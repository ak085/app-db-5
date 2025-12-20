#!/usr/bin/env python3
"""
Storage App - MQTT to TimescaleDB Bridge
Subscribes to MQTT topics and writes sensor data to TimescaleDB
Supports TLS/SSL and username/password authentication
"""

import os
import ssl
import json
import time
import logging
from datetime import datetime
import paho.mqtt.client as mqtt
import psycopg2

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Configuration from environment - TimescaleDB
TIMESCALE_HOST = os.getenv('TIMESCALE_HOST', 'timescaledb')
TIMESCALE_PORT = int(os.getenv('TIMESCALE_PORT', '5432'))
TIMESCALE_DB = os.getenv('TIMESCALE_DB', 'sensor_data')
TIMESCALE_USER = os.getenv('TIMESCALE_USER', 'timescale')
TIMESCALE_PASSWORD = os.getenv('TIMESCALE_PASSWORD', 'timescale123')

# Configuration from environment - Config database
CONFIG_DB_HOST = os.getenv('CONFIG_DB_HOST', 'postgres')
CONFIG_DB_PORT = int(os.getenv('CONFIG_DB_PORT', '5432'))
CONFIG_DB_NAME = os.getenv('CONFIG_DB_NAME', 'storage_config')
CONFIG_DB_USER = os.getenv('CONFIG_DB_USER', 'storage')
CONFIG_DB_PASSWORD = os.getenv('CONFIG_DB_PASSWORD', 'storage123')

# MQTT Configuration (loaded from database)
mqtt_config = {
    'broker': '',
    'port': 1883,
    'client_id': 'storage_telegraf',
    'username': '',
    'password': '',
    'tls_enabled': False,
    'tls_insecure': False,
    'ca_cert_path': None,
    'topic_patterns': ['bacnet/#'],
    'qos': 1,
    'enabled': False
}

# Database connections
timescale_conn = None
config_conn = None

# MQTT client
mqtt_client = None
mqtt_connected = False

# Statistics
stats = {
    'messages_received': 0,
    'messages_written': 0,
    'errors': 0,
    'last_write_time': time.time()  # Initialize to now to suppress startup disconnect noise
}

# Deduplication cache
seen_messages = {}


def connect_config_db():
    """Connect to configuration database"""
    global config_conn
    try:
        config_conn = psycopg2.connect(
            host=CONFIG_DB_HOST,
            port=CONFIG_DB_PORT,
            database=CONFIG_DB_NAME,
            user=CONFIG_DB_USER,
            password=CONFIG_DB_PASSWORD,
            connect_timeout=10
        )
        config_conn.autocommit = True
        logger.info(f"Connected to config database at {CONFIG_DB_HOST}:{CONFIG_DB_PORT}")
        return True
    except Exception as e:
        logger.error(f"Failed to connect to config database: {e}")
        return False


def load_mqtt_config():
    """Load MQTT configuration from database"""
    global mqtt_config, config_conn
    try:
        cursor = config_conn.cursor()
        cursor.execute('''
            SELECT broker, port, "clientId", username, password,
                   "tlsEnabled", "tlsInsecure", "caCertPath",
                   "topicPatterns", qos, enabled
            FROM "MqttConfig"
            WHERE id = 1
            LIMIT 1
        ''')
        result = cursor.fetchone()
        cursor.close()

        if result:
            mqtt_config['broker'] = result[0] or ''
            mqtt_config['port'] = result[1] or 1883
            mqtt_config['client_id'] = result[2] or 'storage_telegraf'
            mqtt_config['username'] = result[3] or ''
            mqtt_config['password'] = result[4] or ''
            mqtt_config['tls_enabled'] = result[5] or False
            mqtt_config['tls_insecure'] = result[6] or False
            mqtt_config['ca_cert_path'] = result[7]
            mqtt_config['topic_patterns'] = result[8] or ['bacnet/#']
            mqtt_config['qos'] = result[9] or 1
            mqtt_config['enabled'] = result[10] if result[10] is not None else True

            logger.info(f"Loaded MQTT config: {mqtt_config['broker']}:{mqtt_config['port']}")
            logger.info(f"  TLS: {mqtt_config['tls_enabled']}, Auth: {bool(mqtt_config['username'])}")
            logger.info(f"  Topics: {mqtt_config['topic_patterns']}")
            return True
        else:
            logger.warning("No MQTT config found in database")
            return False
    except Exception as e:
        logger.error(f"Failed to load MQTT config: {e}")
        return False


def update_connection_status(status: str, last_connected: bool = False):
    """Update MQTT connection status in database"""
    global config_conn
    try:
        cursor = config_conn.cursor()
        if last_connected:
            cursor.execute('''
                UPDATE "MqttConfig"
                SET "connectionStatus" = %s, "lastConnected" = NOW(), "updatedAt" = NOW()
                WHERE id = 1
            ''', (status,))
        else:
            cursor.execute('''
                UPDATE "MqttConfig"
                SET "connectionStatus" = %s, "updatedAt" = NOW()
                WHERE id = 1
            ''', (status,))
        cursor.close()
    except Exception as e:
        logger.error(f"Failed to update connection status: {e}")


def connect_timescale_db():
    """Connect to TimescaleDB"""
    global timescale_conn
    try:
        timescale_conn = psycopg2.connect(
            host=TIMESCALE_HOST,
            port=TIMESCALE_PORT,
            database=TIMESCALE_DB,
            user=TIMESCALE_USER,
            password=TIMESCALE_PASSWORD,
            connect_timeout=10
        )
        timescale_conn.autocommit = True
        logger.info(f"Connected to TimescaleDB at {TIMESCALE_HOST}:{TIMESCALE_PORT}")
        return True
    except Exception as e:
        logger.error(f"Failed to connect to TimescaleDB: {e}")
        return False


def ensure_schema_exists():
    """Ensure the sensor_readings table and hypertable exist.

    This handles cases where:
    - Docker init scripts didn't run (container rebuild with existing volume)
    - Database was recreated without init scripts
    - Partial initialization occurred

    Uses hybrid schema: core indexed columns + dynamic JSONB metadata
    """
    global timescale_conn

    try:
        cursor = timescale_conn.cursor()

        # Check if table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'sensor_readings'
            );
        """)
        table_exists = cursor.fetchone()[0]

        if table_exists:
            # Check if metadata column exists (migration from old schema)
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns
                    WHERE table_name = 'sensor_readings'
                    AND column_name = 'metadata'
                );
            """)
            has_metadata = cursor.fetchone()[0]

            if has_metadata:
                logger.info("sensor_readings table exists with metadata column")
                cursor.close()
                return True
            else:
                # Migrate old schema: add metadata column
                # Must decompress chunks first for compressed hypertables
                logger.info("Migrating schema: decompressing chunks and adding metadata column...")
                try:
                    # Decompress all chunks
                    cursor.execute("""
                        SELECT decompress_chunk(c.chunk_schema || '.' || c.chunk_name)
                        FROM timescaledb_information.chunks c
                        WHERE c.hypertable_name = 'sensor_readings'
                        AND c.is_compressed = true;
                    """)
                    logger.info("Decompressed existing chunks")
                except Exception as e:
                    logger.info(f"No compressed chunks to decompress: {e}")

                # Add column with NULL default (allowed on compressed hypertables)
                cursor.execute("ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS metadata JSONB;")

                # Update existing rows to have empty JSON object
                cursor.execute("UPDATE sensor_readings SET metadata = '{}'::jsonb WHERE metadata IS NULL;")

                # Set default for new rows
                cursor.execute("ALTER TABLE sensor_readings ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;")

                # Create index
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_sensor_metadata ON sensor_readings USING GIN (metadata);")

                logger.info("Schema migration complete")
                cursor.close()
                return True

        logger.warning("sensor_readings table not found - creating schema...")

        # Create timescaledb extension
        cursor.execute("CREATE EXTENSION IF NOT EXISTS timescaledb;")

        # Create the table with hybrid schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sensor_readings (
                time TIMESTAMPTZ NOT NULL,
                haystack_name TEXT,
                dis TEXT,
                value DOUBLE PRECISION,
                units TEXT,
                quality TEXT CHECK (quality IN ('good', 'uncertain', 'bad')),
                metadata JSONB DEFAULT '{}'::jsonb
            );
        """)

        # Convert to hypertable
        cursor.execute("""
            SELECT create_hypertable(
                'sensor_readings',
                'time',
                if_not_exists => TRUE,
                chunk_time_interval => INTERVAL '1 day'
            );
        """)

        # Create indexes
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sensor_haystack_time
                ON sensor_readings (haystack_name, time DESC);
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sensor_time
                ON sensor_readings (time DESC);
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sensor_metadata
                ON sensor_readings USING GIN (metadata);
        """)

        # Enable compression
        cursor.execute("""
            ALTER TABLE sensor_readings SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'haystack_name',
                timescaledb.compress_orderby = 'time DESC'
            );
        """)

        # Add compression policy
        cursor.execute("""
            SELECT add_compression_policy(
                'sensor_readings',
                INTERVAL '6 hours',
                if_not_exists => TRUE
            );
        """)

        # Add retention policy
        cursor.execute("""
            SELECT add_retention_policy(
                'sensor_readings',
                INTERVAL '30 days',
                if_not_exists => TRUE
            );
        """)

        cursor.close()
        logger.info("Successfully created sensor_readings hypertable with indexes and policies")
        return True

    except Exception as e:
        logger.error(f"Failed to ensure schema exists: {e}")
        return False


def on_connect(client, userdata, flags, reason_code, properties):
    """Callback when connected to MQTT broker"""
    global mqtt_connected
    if reason_code == 0:
        mqtt_connected = True
        logger.info(f"Connected to MQTT broker {mqtt_config['broker']}:{mqtt_config['port']}")
        # Don't update status here - let main loop handle it based on actual data flow

        # Subscribe to configured topic patterns
        for pattern in mqtt_config['topic_patterns']:
            client.subscribe(pattern, qos=mqtt_config['qos'])
            logger.info(f"Subscribed to: {pattern}")
    else:
        mqtt_connected = False
        logger.error(f"Failed to connect to MQTT broker, code: {reason_code}")


def on_disconnect(client, userdata, disconnect_flags, reason_code, properties):
    """Callback when disconnected from MQTT broker"""
    global mqtt_connected
    mqtt_connected = False
    if reason_code != 0:
        logger.warning(f"Unexpected disconnect from MQTT broker, code: {reason_code}")
    # Don't update status here - let main loop handle it based on actual data flow
    # This prevents rapid connect/disconnect cycles from setting wrong status


def on_message(client, userdata, msg):
    """Callback when MQTT message received"""
    global stats, seen_messages

    try:
        stats['messages_received'] += 1

        # Parse JSON payload
        payload = json.loads(msg.payload.decode('utf-8'))

        # Extract timestamp (broker may use 'time' or 'timestamp')
        timestamp = payload.get('timestamp') or payload.get('time')
        if timestamp:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        else:
            dt = datetime.utcnow()

        # Deduplication check
        haystack_name = payload.get('haystackName') or payload.get('haystack_name')
        timestamp_second = timestamp[:19] if timestamp and len(timestamp) >= 19 else str(dt)[:19]
        dedup_key = (haystack_name, timestamp_second)
        if dedup_key in seen_messages:
            return

        seen_messages[dedup_key] = True
        if len(seen_messages) > 1000:
            for _ in range(100):
                seen_messages.pop(next(iter(seen_messages)), None)

        # Core fields stored in dedicated columns (indexed for fast queries)
        # These are excluded from metadata JSONB
        core_fields = {'timestamp', 'time', 'haystackName', 'haystack_name', 'dis', 'value', 'units', 'quality'}

        # Build metadata from all non-core fields that have values
        metadata = {}
        for key, value in payload.items():
            if key not in core_fields and value is not None:
                # Convert camelCase to snake_case for consistency
                snake_key = ''.join(['_' + c.lower() if c.isupper() else c for c in key]).lstrip('_')
                metadata[snake_key] = value

        # Prepare data for insertion - only store what broker sends
        data = {
            'time': dt,
            'haystack_name': haystack_name,
            'dis': payload.get('dis'),
            'value': payload.get('value'),
            'units': payload.get('units'),
            'quality': payload.get('quality', 'good'),
            'metadata': metadata  # All other fields as JSONB
        }

        # Insert into TimescaleDB
        insert_sensor_reading(data)
        stats['messages_written'] += 1

        # Log progress every 10 messages
        if stats['messages_received'] % 10 == 0:
            logger.info(f"Stats: {stats['messages_received']} received, {stats['messages_written']} written, {stats['errors']} errors")

    except json.JSONDecodeError as e:
        stats['errors'] += 1
        logger.error(f"Invalid JSON in message: {e}")
    except Exception as e:
        stats['errors'] += 1
        logger.error(f"Error processing message: {e}")


def insert_sensor_reading(data):
    """Insert sensor reading into TimescaleDB with dynamic metadata"""
    global timescale_conn, stats

    try:
        cursor = timescale_conn.cursor()

        # Convert metadata dict to JSON string for PostgreSQL
        metadata_json = json.dumps(data.get('metadata', {}))

        sql = """
        INSERT INTO sensor_readings (
            time, haystack_name, dis, value, units, quality, metadata
        ) VALUES (
            %(time)s, %(haystack_name)s, %(dis)s, %(value)s, %(units)s, %(quality)s, %(metadata)s::jsonb
        )
        """

        cursor.execute(sql, {
            'time': data['time'],
            'haystack_name': data.get('haystack_name'),
            'dis': data.get('dis'),
            'value': data.get('value'),
            'units': data.get('units'),
            'quality': data.get('quality', 'good'),
            'metadata': metadata_json
        })
        cursor.close()

        # Track successful write time - main loop uses this to determine status
        stats['last_write_time'] = time.time()

    except Exception as e:
        logger.error(f"Database insert error: {e}")
        stats['errors'] += 1
        # Reconnect and ensure schema exists
        if connect_timescale_db():
            ensure_schema_exists()


def connect_mqtt():
    """Connect to MQTT broker with TLS and authentication support"""
    global mqtt_client, mqtt_connected

    if not mqtt_config['broker']:
        logger.warning("MQTT broker not configured, waiting...")
        return False

    if not mqtt_config['enabled']:
        logger.info("MQTT is disabled in configuration")
        return False

    try:
        # Create MQTT client
        mqtt_client = mqtt.Client(
            client_id=mqtt_config['client_id'],
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            clean_session=True
        )
        mqtt_client.on_connect = on_connect
        mqtt_client.on_disconnect = on_disconnect
        mqtt_client.on_message = on_message
        mqtt_client.reconnect_delay_set(min_delay=1, max_delay=60)

        # Configure authentication
        if mqtt_config['username']:
            mqtt_client.username_pw_set(
                mqtt_config['username'],
                mqtt_config['password']
            )
            logger.info(f"MQTT authentication configured for user: {mqtt_config['username']}")

        # Configure TLS
        if mqtt_config['tls_enabled']:
            ca_cert = mqtt_config['ca_cert_path']

            if mqtt_config['tls_insecure']:
                # Insecure mode: skip certificate verification
                mqtt_client.tls_set(cert_reqs=ssl.CERT_NONE)
                mqtt_client.tls_insecure_set(True)
                logger.warning("TLS configured with INSECURE mode (certificate verification disabled)")
            else:
                # Secure mode: verify certificates
                if ca_cert:
                    if not os.path.exists(ca_cert):
                        logger.error(f"CA certificate file not found: {ca_cert}")
                        ca_cert = None
                    elif not os.access(ca_cert, os.R_OK):
                        logger.error(f"CA certificate file not readable: {ca_cert}")
                        ca_cert = None

                if ca_cert:
                    mqtt_client.tls_set(
                        ca_certs=ca_cert,
                        cert_reqs=ssl.CERT_REQUIRED,
                        tls_version=ssl.PROTOCOL_TLS
                    )
                    logger.info(f"TLS configured with CA certificate: {ca_cert}")
                else:
                    # Use system CA bundle
                    mqtt_client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
                    logger.info("TLS configured with system CA bundle")

        # Connect
        mqtt_client.connect(mqtt_config['broker'], mqtt_config['port'], keepalive=60)
        mqtt_client.loop_start()

        # Wait for connection
        time.sleep(2)
        return mqtt_connected

    except Exception as e:
        logger.error(f"Failed to connect to MQTT broker: {e}")
        # Don't update status here - let main loop handle it based on actual data flow
        return False


def main():
    """Main function"""
    logger.info(f"Starting Storage App MQTT to TimescaleDB bridge (PID: {os.getpid()})")

    # Connect to config database
    while not connect_config_db():
        logger.info("Waiting for config database...")
        time.sleep(5)

    # Connect to TimescaleDB
    while not connect_timescale_db():
        logger.info("Waiting for TimescaleDB...")
        time.sleep(5)

    # Ensure schema exists (handles cases where init scripts didn't run)
    while not ensure_schema_exists():
        logger.info("Waiting for schema to be ready...")
        time.sleep(5)

    # Reset last_write_time to now (module import time may be stale)
    stats['last_write_time'] = time.time()

    # Main loop - poll for config changes and maintain MQTT connection
    last_config_check = 0
    config_check_interval = 30  # Check config every 30 seconds

    while True:
        global mqtt_connected
        current_time = time.time()

        # Check for config changes periodically
        if current_time - last_config_check > config_check_interval:
            last_config_check = current_time

            # Save old config values before reload
            old_broker = mqtt_config['broker']
            old_port = mqtt_config['port']
            old_tls = mqtt_config['tls_enabled']
            old_tls_insecure = mqtt_config['tls_insecure']
            old_ca_cert = mqtt_config['ca_cert_path']
            old_username = mqtt_config['username']
            old_password = mqtt_config['password']
            old_topics = mqtt_config['topic_patterns'].copy() if mqtt_config['topic_patterns'] else []
            old_qos = mqtt_config['qos']
            old_enabled = mqtt_config['enabled']

            load_mqtt_config()

            # Check if any connection-related config changed
            config_changed = (
                old_broker != mqtt_config['broker'] or
                old_port != mqtt_config['port'] or
                old_tls != mqtt_config['tls_enabled'] or
                old_tls_insecure != mqtt_config['tls_insecure'] or
                old_ca_cert != mqtt_config['ca_cert_path'] or
                old_username != mqtt_config['username'] or
                old_password != mqtt_config['password'] or
                old_topics != mqtt_config['topic_patterns'] or
                old_qos != mqtt_config['qos']
            )

            # Handle enabled/disabled toggle
            enabled_changed = old_enabled != mqtt_config['enabled']

            if enabled_changed:
                if not mqtt_config['enabled'] and mqtt_client:
                    logger.info("MQTT disabled, disconnecting...")
                    mqtt_client.disconnect()
                    mqtt_client.loop_stop()
                    mqtt_connected = False
                    update_connection_status('disconnected')
                elif mqtt_config['enabled'] and not mqtt_connected:
                    logger.info("MQTT enabled, connecting...")
                    connect_mqtt()

            elif config_changed and mqtt_client and mqtt_connected:
                # Log what changed for debugging
                if old_topics != mqtt_config['topic_patterns']:
                    logger.info(f"Topic patterns changed: {old_topics} -> {mqtt_config['topic_patterns']}")
                if old_broker != mqtt_config['broker']:
                    logger.info(f"Broker changed: {old_broker} -> {mqtt_config['broker']}")
                if old_port != mqtt_config['port']:
                    logger.info(f"Port changed: {old_port} -> {mqtt_config['port']}")
                if old_tls != mqtt_config['tls_enabled']:
                    logger.info(f"TLS changed: {old_tls} -> {mqtt_config['tls_enabled']}")
                if old_username != mqtt_config['username']:
                    logger.info(f"Username changed")
                if old_qos != mqtt_config['qos']:
                    logger.info(f"QoS changed: {old_qos} -> {mqtt_config['qos']}")

                logger.info("MQTT config changed, reconnecting...")
                mqtt_client.disconnect()
                mqtt_client.loop_stop()

                # Reset data flow tracking - new config means we need fresh data to confirm connection
                stats['last_write_time'] = current_time  # Start timeout from now
                stats['messages_written'] = 0  # Reset counter to detect new data
                update_connection_status('connecting')

                time.sleep(1)
                connect_mqtt()

        # Connect if not connected
        if not mqtt_connected and mqtt_config['broker'] and mqtt_config['enabled']:
            logger.info(f"Connecting to MQTT broker {mqtt_config['broker']}:{mqtt_config['port']}...")
            connect_mqtt()

        # Update connection status based on actual data flow
        # This is more reliable than callbacks during rapid connect/disconnect cycles
        if mqtt_config['enabled'] and mqtt_config['broker']:
            data_age = current_time - stats['last_write_time']
            if stats['messages_written'] > 0 and data_age < 120:
                # Data flowing - ensure status shows connected
                update_connection_status('connected', last_connected=True)
            elif data_age > 120:
                # No data for 2+ minutes - mark as disconnected
                update_connection_status('disconnected')

        # Sleep before next iteration
        time.sleep(5)


if __name__ == "__main__":
    main()
