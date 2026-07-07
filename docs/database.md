# Database Design

## Main Tables

- users
- devices
- sensor_readings

## Important Index

```sql
CREATE INDEX idx_sensor_device_time
ON sensor_readings (device_id, time DESC);
```

## Retention Recommendation

For 1,000 devices:

```txt
Raw data: 30–90 days or 1 year only if interval is 60 seconds or slower
5-minute summary: 1 year
Hourly summary: 3–5 years
```

Future improvement:

- continuous aggregates
- compression policy
- retention policy
- backup policy
