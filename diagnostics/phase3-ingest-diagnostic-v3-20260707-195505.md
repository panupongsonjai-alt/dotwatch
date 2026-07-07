# dotWatch Phase 3/Ingest Diagnostic v3

Generated: 2026-07-07 19:55:06
Root: D:\IoT Project\dotwatch
BaseUrl: https://dotwatch-backend.onrender.com

## Output

dotWatch Phase 3/Ingest Diagnostic v3
Root: D:\IoT Project\dotwatch
BaseUrl: https://dotwatch-backend.onrender.com
This script intentionally avoids PowerShell here-strings to prevent terminator parser errors.

Required files
OK: Required file exists: package.json
OK: Required file exists: services\backend\package.json
OK: Required file exists: services\backend\src\controllers\ingest.controller.js
OK: Required file exists: services\backend\src\routes\ingest.routes.js
OK: Required file exists: services\backend\src\middlewares\authDevice.js
OK: Required file exists: services\backend\src\config\env.js
OK: Required file exists: services\backend\migrations\run.js
OK: Required file exists: services\backend\migrations\016_phase4_data_scale_performance.sql
OK: Required file exists: apps\dashboard\src\services\api.js
OK: Required file exists: pi\agent\services\dotwatch_api.py

Ingest feature checks
OK: Ingest batch route exists
OK: ingestBatch controller exists
OK: Controller updates device_metric_latest
OK: Device auth accepts x-device-code
OK: Device auth accepts x-device-secret
OK: Backend env supports ingest batch max readings
OK: Dashboard API supports history resolution query
OK: Pi agent API supports batch ingest

Backend environment summary
WARN: services/backend/.env not found. This is OK if you use Render env or shell env.

Node syntax checks
OK: node --check passed: services\backend\src\controllers\ingest.controller.js
OK: node --check passed: services\backend\src\routes\ingest.routes.js
OK: node --check passed: services\backend\src\middlewares\authDevice.js
OK: node --check passed: services\backend\src\config\env.js
OK: node --check passed: services\backend\migrations\run.js
OK: node --check passed: apps\dashboard\src\services\api.js

Backend health checks
OK: GET https://dotwatch-backend.onrender.com/health/live
{
    "ok":  true,
    "service":  "dotwatch-backend",
    "environment":  "production",
    "uptime":  3149,
    "timestamp":  "2026-07-07T12:55:17.249Z",
    "requestId":  "6451899f-1809-4661-8981-d7299ac429b2"
}

OK: GET https://dotwatch-backend.onrender.com/health/ready
{
    "ok":  true,
    "service":  "dotwatch-backend",
    "environment":  "production",
    "database":  "connected",
    "databaseLatencyMs":  1,
    "firebase":  "configured",
    "websocket":  "enabled",
    "uptime":  3149,
    "latencyMs":  1,
    "timestamp":  "2026-07-07T12:55:17.330Z",
    "requestId":  "265d908f-c0b0-42e1-a7e2-7f3c89980521"
}


Summary
Failures: 0
Warnings: 1
Report: D:\IoT Project\dotwatch\diagnostics\phase3-ingest-diagnostic-v3-20260707-195505.md
