# dotWatch Architecture

## Production Flow

```txt
ESP32 Device
  -> POST /api/ingest
  -> Backend validates device secret
  -> TimescaleDB stores sensor_readings
  -> Dashboard reads latest and bucketed history
```

## Scale Target

- 1,000 devices
- Data retention 1 year
- Recommended raw interval: 30–60 seconds
- Recommended dashboard interval: 5–10 seconds for latest value only
- Long chart range should use bucket aggregation

## Do Not

- Do not let ESP write directly to Firebase Database in production.
- Do not load raw 1-year data directly into browser chart.
- Do not commit `.env` or device secrets.
