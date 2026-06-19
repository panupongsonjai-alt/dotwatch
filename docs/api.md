# API

## Health

GET /health

## Devices

GET /api/devices
POST /api/devices

Body:

```json
{ "name": "Room Sensor 1" }
```

## Ingest

POST /api/ingest

Headers:

```txt
x-device-id: DW-000001
x-device-secret: dev-secret-001
```

Body:

```json
{
  "temperature": 28.5,
  "humidity": 62.3,
  "rssi": -61,
  "firmwareVersion": "1.0.0"
}
```

## History

GET /api/devices/:id/history?bucket=1m

Allowed buckets:

```txt
1m, 5m, 30m, 1h, 1d
```
