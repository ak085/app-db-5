-- Storage App TimescaleDB Initialization
-- Creates sensor_readings hypertable for time-series data

-- Create extension if not exists
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create sensor_readings table
-- Uses a hybrid schema: core indexed columns + dynamic JSONB metadata
CREATE TABLE IF NOT EXISTS sensor_readings (
  time TIMESTAMPTZ NOT NULL,

  -- Core fields (always indexed for fast queries)
  haystack_name TEXT,
  dis TEXT,
  value DOUBLE PRECISION,
  units TEXT,
  quality TEXT CHECK (quality IN ('good', 'uncertain', 'bad')),

  -- Dynamic metadata (stores all other fields from MQTT payload)
  -- This allows flexible schema without null columns
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Convert to hypertable (partitioned by time)
SELECT create_hypertable(
  'sensor_readings',
  'time',
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sensor_haystack_time
  ON sensor_readings (haystack_name, time DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_time
  ON sensor_readings (time DESC);

-- GIN index for JSONB metadata queries (e.g., WHERE metadata->>'device_id' = '123')
CREATE INDEX IF NOT EXISTS idx_sensor_metadata
  ON sensor_readings USING GIN (metadata);

-- Enable compression (compress data older than 6 hours)
ALTER TABLE sensor_readings SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'haystack_name',
  timescaledb.compress_orderby = 'time DESC'
);

-- Add compression policy (compress chunks older than 6 hours)
SELECT add_compression_policy(
  'sensor_readings',
  INTERVAL '6 hours',
  if_not_exists => TRUE
);

-- Add retention policy (drop data older than 30 days)
SELECT add_retention_policy(
  'sensor_readings',
  INTERVAL '30 days',
  if_not_exists => TRUE
);

-- Create continuous aggregate for 5-minute averages (useful for Grafana)
CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_readings_5min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', time) AS bucket,
  haystack_name,
  dis,
  AVG(value) AS avg_value,
  MIN(value) AS min_value,
  MAX(value) AS max_value,
  COUNT(*) AS sample_count
FROM sensor_readings
WHERE quality = 'good'
GROUP BY bucket, haystack_name, dis;

-- Refresh policy for continuous aggregate (refresh every 5 minutes)
SELECT add_continuous_aggregate_policy(
  'sensor_readings_5min',
  start_offset => INTERVAL '1 day',
  end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists => TRUE
);

-- Grant permissions
GRANT ALL ON sensor_readings TO timescale;
GRANT ALL ON sensor_readings_5min TO timescale;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ TimescaleDB initialization complete!';
  RAISE NOTICE '   - sensor_readings hypertable created';
  RAISE NOTICE '   - Compression enabled (6 hours)';
  RAISE NOTICE '   - Retention policy: 30 days';
  RAISE NOTICE '   - Continuous aggregate: 5-minute averages';
END $$;
