# dotWatch latest ZIP audit — 2026-07-08

## Status

- Python files: syntax OK.
- Backend/root JS/CJS/MJS files: `node --check` OK.
- Dashboard/Admin relative imports: no missing local imports detected.
- ESP32 model exists in DB according to user output:
  - `dw_20ch`: YES
  - `esp32_dht3`: YES

## Critical findings

1. ESP32 firmware timestamp would fail ingest.
   Current firmware sends `timestamp = "esp32-uptime-ms-..."`.
   Backend validates timestamp as a JavaScript date string and rejects invalid timestamps.
   Fix: omit `timestamp` from firmware so backend uses server time.

2. ESP32 model migration is in `services/backend/src/db/migrations`.
   Current `npm run migrate` uses `services/backend/migrations/run.js`, so the SQL would not run during normal backend migration.
   Fix: add `services/backend/migrations/018_esp32_dht3_model.sql` and update `run.js`.

3. ESP32 model row exists, but default model metrics were missing from the add-only migration/seed.
   `createDevice()` copies rows from `device_model_metrics` when creating a new device.
   Without defaults, new ESP32 devices may have no metric display config.
   Fix: seed `metric_1..metric_3` into `device_model_metrics`.

4. Pi Config UI duplicate location is stale.
   `pi/agent/pi_config_web.py` is v1.2.1-ui-cleanup, but `pi/config-ui/pi_config_web.py` is v1.2.0-phase2-gateway.
   If old upload scripts use `pi/config-ui`, they can reinstall the old UI.
   Recommended next cleanup: sync or remove stale duplicate.

5. `install_config_ui_service.sh` fallback `.env` template has a malformed line after `DEVICE_SECRET=`.
   Fix included in this pack.

6. The ZIP still contains many temporary/root-level troubleshooting files and `_cleanup_trash`.
   Recommended after this fix: run cleanup after restoring/deciding deleted README files.
