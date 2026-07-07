# dotWatch Phase 3/Ingest Diagnostic v3

Generated: 2026-07-07 19:54:54
Root: D:\IoT Project\dotwatch
BaseUrl: http://localhost:4000

## Output

dotWatch Phase 3/Ingest Diagnostic v3
Root: D:\IoT Project\dotwatch
BaseUrl: http://localhost:4000
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
WARN: GET failed: http://localhost:4000/health/live -> Unable to connect to the remote server
WARN: GET failed: http://localhost:4000/health/ready -> Unable to connect to the remote server

Summary
Failures: 0
Warnings: 3
Report: D:\IoT Project\dotwatch\diagnostics\phase3-ingest-diagnostic-v3-20260707-195445.md
