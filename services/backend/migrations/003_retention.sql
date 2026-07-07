CREATE MATERIALIZED VIEW telemetry_1m
WITH (timescaledb.continuous)
AS

SELECT

time_bucket('1 minute', ts) AS bucket,

device_id,

AVG(temperature) avg_temp,

AVG(humidity) avg_hum,

COUNT(*) samples

FROM telemetry

GROUP BY bucket, device_id;

CREATE MATERIALIZED VIEW telemetry_1h
WITH (timescaledb.continuous)
AS

SELECT

time_bucket('1 hour', ts) AS bucket,

device_id,

AVG(temperature) avg_temp,

AVG(humidity) avg_hum,

COUNT(*) samples

FROM telemetry

GROUP BY bucket, device_id;