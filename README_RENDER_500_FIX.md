# Render 500 Fix: POST /api/devices

This package fixes the Render production issue where Dashboard can connect to Backend, but `/api/devices` returns HTTP 500 when listing or creating devices.

## What was fixed

1. `services/backend/src/controllers/devices.controller.js`
   - Fixed the `INSERT INTO devices` parameter mismatch.
   - Old SQL listed 7 columns but only provided 6 values.
   - New SQL correctly saves `secret_encrypted`, `secret_encrypted_at`, and `model_id`.

2. `services/backend/migrations/run.js`
   - Replaced the old partial migration runner with a production-safe idempotent migration.
   - Creates/patches all tables required by the current backend:
     - users
     - devices
     - sensor_readings
     - device_models
     - device_model_metrics
     - device_metrics
     - device_metric_readings
     - alarm_rules
     - alarm_events
     - alarm_states
     - activity_logs
     - admin_audit_logs
     - organizations/sites/device_groups
   - Seeds fixed model IDs used by the Dashboard wizard:
     - 1 = DW2CH
     - 2 = DW10CH
     - 3 = DW20CH
   - TimescaleDB is optional. If Render PostgreSQL does not support TimescaleDB, migration continues with normal PostgreSQL tables.

## Render deployment steps

1. Commit/push this package to your Git repository.
2. On Render Backend service, make sure Environment includes:

```env
DATABASE_URL=<Render Internal Database URL>
DEVICE_SECRET_ENCRYPTION_KEY=<32-byte base64 or 64-char hex key>
FIREBASE_PROJECT_ID=<firebase project id>
FIREBASE_CLIENT_EMAIL=<firebase service account email>
FIREBASE_PRIVATE_KEY=<firebase private key with \n>
CORS_ORIGIN=https://dotwatch.onrender.com,https://dotwatch-admin.onrender.com
NODE_ENV=production
```

3. Set Backend Pre-Deploy Command:

```bash
npm run migrate
```

4. Clear build cache & deploy Backend.
5. Open Backend logs and confirm:

```text
dotWatch migration completed
```

6. Open Dashboard and create a device again.

## DBeaver verification

Run this SQL in DBeaver after deploy:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'devices',
    'device_models',
    'device_model_metrics',
    'device_metrics',
    'device_metric_readings',
    'sensor_readings',
    'alarm_rules',
    'alarm_events',
    'alarm_states',
    'activity_logs'
  )
ORDER BY table_name;

SELECT id, model_key, model_name, metric_count
FROM device_models
ORDER BY id;
```

Expected model IDs:

```text
1 DW2CH
2 DW10CH
3 DW20CH
```
