# Storage App - AI Development Context

## Current Status (December 2025)

**Production Ready**: MQTT to TimescaleDB data collection gateway with web-based configuration.

**Core Features**:
- MQTT subscription to any broker
- TLS/SSL with certificate verification
- Username/password MQTT authentication
- Configurable topic patterns
- Web-based monitoring and export
- Dynamic schema with JSONB metadata
- Session-based authentication with Master PIN protection

---

## Architecture

```
┌─────────────────────────────────────────────┐
│ Storage App (Docker Compose)                │
├─────────────────────────────────────────────┤
│  Frontend (Next.js 15) - Port 3002          │
│  ├─ Login (session-based auth)              │
│  ├─ Dashboard (status)                      │
│  ├─ Monitoring (data table)                 │
│  └─ Settings (MQTT + security + data mgmt)  │
│                                             │
│  PostgreSQL 15 - Port 5436                  │
│  └─ Configuration database                  │
│                                             │
│  TimescaleDB 15 - Port 5435                 │
│  └─ Time-series storage (JSONB schema)      │
│                                             │
│  Telegraf (Python)                          │
│  └─ MQTT to TimescaleDB bridge              │
└─────────────────────────────────────────────┘
         ↑ MQTT subscribe
┌─────────────────────────────────────────────┐
│ External MQTT Broker                        │
└─────────────────────────────────────────────┘
```

---

## Technology Stack

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui
- **Authentication**: iron-session + bcryptjs
- **Config Database**: PostgreSQL 15 + Prisma
- **Time-Series Database**: TimescaleDB 15
- **MQTT Bridge**: Python 3.10 + paho-mqtt
- **Deployment**: Docker Compose

---

## Quick Commands

```bash
# Deploy
docker compose up -d

# Access UI
http://<your-ip>:3002

# View logs
docker compose logs -f telegraf

# Restart telegraf
docker compose restart telegraf

# Config database access
docker exec -it storage-postgres psql -U storage -d storage_config

# TimescaleDB access
docker exec -it storage-timescaledb psql -U timescale -d sensor_data
```

---

## Key Files

| File | Purpose |
|------|---------|
| `telegraf/mqtt_to_timescaledb.py` | MQTT subscription and TimescaleDB write |
| `frontend/src/app/page.tsx` | Dashboard |
| `frontend/src/app/login/page.tsx` | Login page |
| `frontend/src/app/settings/page.tsx` | MQTT/TLS + security + data management |
| `frontend/src/app/monitoring/page.tsx` | Data table view |
| `frontend/src/middleware.ts` | Route protection (auth) |
| `frontend/src/lib/auth.ts` | Password hashing utilities |
| `frontend/src/lib/session.ts` | Session configuration |
| `frontend/src/app/api/auth/*` | Auth API routes (login, logout, password, pin) |
| `frontend/src/app/api/export/route.ts` | CSV/JSON export |
| `frontend/prisma/schema.prisma` | Config database schema |
| `frontend/scripts/` | CLI recovery scripts |
| `timescaledb/init/01_init_hypertable.sql` | TimescaleDB schema |

---

## Database Schemas

### Config Database (PostgreSQL)

**MqttConfig**:
- `broker`, `port`, `clientId`
- `username`, `password`
- `tlsEnabled`, `tlsInsecure`, `caCertPath`
- `topicPatterns[]`, `qos`
- `enabled`, `connectionStatus`, `lastConnected`

**SystemSettings**:
- `adminUsername`, `adminPasswordHash`, `masterPinHash` (auth)
- `retentionDays`

### Time-Series Database (TimescaleDB)

**sensor_readings** (Hybrid Schema):
```sql
time TIMESTAMPTZ NOT NULL,      -- Timestamp (indexed)
haystack_name TEXT,             -- Point identifier (indexed)
dis TEXT,                       -- Display name
value DOUBLE PRECISION,         -- Measurement value
units TEXT,                     -- Unit of measure
quality TEXT,                   -- good/uncertain/bad
metadata JSONB                  -- All other fields (dynamic)
```

**metadata JSONB** contains any additional fields from MQTT payload:
- `device_id`, `device_ip`, `device_name`
- `object_type`, `object_instance`
- `site_id`, `equipment_type`, `equipment_id`
- `timezone` (if published by source)
- Any other fields - schema adapts automatically

---

## MQTT Configuration

### TLS Modes

1. **Disabled**: Plain MQTT (port 1883)
2. **TLS Secure**: Certificate verification enabled
   - Upload CA certificate via UI
   - Validates server certificate
3. **TLS Insecure**: Skip verification (self-signed certs)
   - Use `tlsInsecure: true`
   - No CA certificate needed

### Topic Patterns

Default pattern: `bacnet/#` (all BacPipes topics)

Common patterns:
- `bacnet/#` - All BacPipes data
- `+/+/+/presentValue` - All point values
- `building1/#` - Specific building

### Troubleshooting

**Client ID Conflict (connect/disconnect loop)**:
- **Symptom**: Telegraf logs show rapid "Connected" followed by "Unexpected disconnect" in a loop
- **Cause**: Another MQTT client is using the same `clientId` on the broker
- **Fix**: Change the client ID in Settings to a unique value (e.g., `storage-app`)
- **Note**: Client ID is an MQTT-level identifier, unrelated to TLS - the TLS connection succeeds but MQTT session conflicts

```bash
# Check for connect/disconnect loop
docker compose logs --tail=50 telegraf | grep -E "(Connected|disconnect)"

# Fix via database if UI unavailable
docker exec storage-postgres psql -U storage -d storage_config \
  -c "UPDATE \"MqttConfig\" SET \"clientId\" = 'storage-app' WHERE id = 1;"
docker compose restart telegraf
```

---

## Telegraf Hot-Reload

The Telegraf service polls the config database every 30 seconds. When MQTT settings change:
1. Detects broker/port/TLS changes
2. Disconnects from old broker
3. Reconnects with new settings

No container restart needed for config changes.

---

## Dynamic Schema Benefits

The JSONB metadata approach provides:
- **No null columns** - only fields present in payload are stored
- **Auto-adapting** - new fields captured automatically
- **ML-ready** - timezone stored in metadata for local time analysis
- **Queryable** - GIN index on metadata for efficient JSON queries

Example query for local time:
```sql
SELECT
  time AT TIME ZONE (metadata->>'timezone') as local_time,
  haystack_name, value
FROM sensor_readings;
```

---

## TimescaleDB Features

- **Hypertable**: Auto-partitioned by time (1 day chunks)
- **Compression**: Data older than 6 hours compressed
- **Retention**: Data older than 30 days deleted (configurable)
- **Continuous Aggregate**: 5-minute averages (sensor_readings_5min)

---

## Port Allocation

| Port | Service |
|------|---------|
| 3002 | Frontend (Web UI) |
| 5435 | TimescaleDB |
| 5436 | PostgreSQL (Config) |

---

## Authentication

### Default Credentials
- **Username**: admin
- **Password**: admin

### Features
- Session-based auth using encrypted cookies (iron-session)
- Master PIN protects password changes (4-6 digits)
- Middleware-based route protection
- 3-hour session expiry

### CLI Recovery Commands

| Command | Description |
|---------|-------------|
| `docker exec storage-frontend node scripts/reset-password.js` | Reset password to "admin" |
| `docker exec storage-frontend node scripts/reset-pin.js` | Remove master PIN |
| `docker exec storage-frontend node scripts/set-pin.js <pin>` | Set master PIN (4-6 digits) |

---

## Repository

- **Gitea**: http://10.0.10.2:30008/ak101/app-db-5.git
- **Branch**: main

---

**Last Updated**: 2026-01-07
