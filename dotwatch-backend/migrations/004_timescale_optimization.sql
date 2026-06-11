ALTER TABLE sensor_readings
SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'device_id'
);

SELECT add_compression_policy(
  'sensor_readings',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

SELECT add_retention_policy(
  'sensor_readings',
  INTERVAL '30 days',
  if_not_exists => TRUE
);

CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_readings_1m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', time) AS bucket,
  device_id,
  AVG(temperature) AS avg_temperature,
  MIN(temperature) AS min_temperature,
  MAX(temperature) AS max_temperature,
  AVG(humidity) AS avg_humidity,
  MIN(humidity) AS min_humidity,
  MAX(humidity) AS max_humidity,
  AVG(rssi) AS avg_rssi,
  COUNT(*) AS samples
FROM sensor_readings
GROUP BY bucket, device_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_readings_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  device_id,
  AVG(temperature) AS avg_temperature,
  MIN(temperature) AS min_temperature,
  MAX(temperature) AS max_temperature,
  AVG(humidity) AS avg_humidity,
  MIN(humidity) AS min_humidity,
  MAX(humidity) AS max_humidity,
  AVG(rssi) AS avg_rssi,
  COUNT(*) AS samples
FROM sensor_readings
GROUP BY bucket, device_id;

SELECT add_continuous_aggregate_policy(
  'sensor_readings_1m',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy(
  'sensor_readings_1h',
  start_offset => INTERVAL '30 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);