# dotWatch Phase 4A — ESP32-DHT3 Add-Only Baseline Fix

ESP32-DHT3 is an additional model. It does not replace Raspberry Pi / DW20CH.

## Fixes in this pack

1. Adds ESP32-DHT3 default `device_model_metrics`.
   This is important because `createDevice()` copies default rows from `device_model_metrics`
   when a new device is created.

2. Adds `services/backend/migrations/018_esp32_dht3_model.sql`.
   The previous SQL was stored under `src/db/migrations`, but `npm run migrate`
   uses `services/backend/migrations/run.js`.

3. Updates `services/backend/migrations/run.js` so normal backend migration also seeds
   ESP32-DHT3 and its default metrics.

4. Fixes ESP32 firmware timestamp.
   The old firmware sent `timestamp = esp32-uptime-ms-...`, which the backend rejects
   because ingest accepts only valid date strings. The fixed firmware omits `timestamp`,
   so the backend uses server time.

5. Fixes `install_config_ui_service.sh` fallback `.env` template.
   The old file had a malformed line after `DEVICE_SECRET=` and defaulted queue flush to 20.
   The fixed file uses `SEND_INTERVAL_SECONDS=20` and `QUEUE_FLUSH_LIMIT=1`.

## Expected models

```text
dw_2ch
dw_10ch
dw_20ch
custom
esp32_dht3
```

## ESP32 default metrics

```text
metric_1 = Temperature (°C)
metric_2 = Humidity (%)
metric_3 = WiFi RSSI (dBm)
```
