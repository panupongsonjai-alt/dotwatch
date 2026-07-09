# dotWatch Phase 6 — Observability / Operations

Phase 6 adds the operational layer needed before repeated production deployments. It does not change the database schema, firmware protocol, or dashboard feature set.

## Goals

- Make backend logs easier to search and correlate with frontend/API errors.
- Keep `/health/live` lightweight for platform liveness checks.
- Keep `/health/ready` strict enough to catch database/Firebase readiness problems.
- Generate repeatable health and release reports under `_reports/ops/`.
- Give a clear deploy and rollback checklist for Render and local testing.

## Files added or changed

### Backend runtime

- `services/backend/src/utils/logger.js`
  - Adds structured JSON logging through `pino` and `pino-http`.
  - Redacts authorization, cookies, device secrets, API keys, passwords and token-like fields.
  - Adds optional slow request marking.
  - Adds optional operational heartbeat logs.

- `services/backend/src/server.js`
  - Uses `requestContext` then HTTP request logging.
  - Adds startup/listening/shutdown logs through the structured logger.
  - Adds unhandled rejection and uncaught exception logging.

- `services/backend/src/middlewares/errorHandler.js`
  - Logs handled request failures with structured metadata and `requestId`.

- `services/backend/src/utils/health.js`
  - Adds release/render metadata to health responses.

### Scripts

- `scripts/ops-health-check.ps1`
  - Checks backend live/ready health plus optional dashboard/admin roots.
  - Writes `_reports/ops/ops-health-*.json`.

- `scripts/ops-release-check.ps1`
  - Runs the static verifies, secret scan, backend syntax check, and optional frontend/admin builds.
  - Writes `_reports/ops/ops-release-check-*.json`.

- `services/backend/scripts/ops-report.mjs`
  - Connects to PostgreSQL and writes a database/backend operations report.
  - Writes `_reports/ops/backend-ops-report-*.json`.

- `scripts/phase6-ops-verify.mjs`
  - Static verification for all Phase 6 files and script wiring.

## New npm commands

From repo root:

```powershell
npm run verify:phase6:ops
npm run ops:health
npm run ops:release-check
npm run ops:backend-report
```

## New backend environment variables

```env
LOG_LEVEL=info
HTTP_LOG_ENABLED=true
SLOW_REQUEST_MS=1500
OPS_SUMMARY_INTERVAL_SECONDS=0
RELEASE_VERSION=
```

Recommended production defaults:

- `LOG_LEVEL=info`
- `HTTP_LOG_ENABLED=true`
- `SLOW_REQUEST_MS=1500`
- `OPS_SUMMARY_INTERVAL_SECONDS=0` unless you want periodic heartbeat logs.

## Health endpoint behavior

### `/health/live`

Use for platform liveness. It should return quickly even when downstream systems are degraded.

### `/health/ready`

Use for readiness or deploy checks. It verifies database health and production Firebase readiness.

### `/health`

Compatibility endpoint matching readiness behavior.

## Report output

Reports are intentionally written to `_reports/ops/` and `_reports/` is gitignored so operational data does not leak into commits or clean exports.
