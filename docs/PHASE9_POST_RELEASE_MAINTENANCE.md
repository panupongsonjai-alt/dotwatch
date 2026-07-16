# dotWatch Phase 9 — Post-release Maintenance, Secret Rotation, and Local/Render Parity

Phase 9 makes the production workflow safer after release. It does not add new product features. It adds repeatable checks for two problems that caused confusion during the release process:

1. Local and Render were sometimes targeted with the same commands.
2. A real production `DATABASE_URL` was exposed during troubleshooting and must be rotated.

## Production rule

Render is the production source of truth. Local is a development and test sandbox.

```text
Local dashboard/backend  -> Local database by default
Render dashboard/backend -> Render PostgreSQL
Pi / ESP32               -> Render backend only
```

Local and Render should use the same code and migrations. They do not need continuous live data sync.

## What should match

- Migration files
- Public database schema
- Device models and metric definitions
- Backend API behavior
- Security policy

## What does not need to match continuously

- Sensor readings
- Live device status
- Demo data
- Temporary local test users
- Local logs and reports

When local needs to match production data, take a Render backup and restore it to local. Do not sync local test data back to Render unless this is an intentional restore from a trusted backup.

## New commands

```powershell
npm run verify:phase9:maintenance
npm run security:rotation:check
npm run db:parity
```

## Recommended post-release order

```powershell
cd "D:\IoT Project\dotwatch"

npm run verify:phase9:maintenance

# 1. Confirm Render backend health
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -AllowReady503

# 2. Rotate exposed database secret in Render.
# Paste the new External Database URL only when prompted.
$env:DATABASE_URL = Read-Host "Paste rotated Render External Database URL"

npm run db:env:check -- -RequireDockerOrPgDump -RequireRender
npm run db:backup

# 3. Run advisory rotation check
npm run security:rotation:check

# 4. Run strict rotation check once all manual steps are completed
npm run security:rotation:check -- `
  -DatabasePasswordRotated `
  -RenderEnvUpdated `
  -BackendRedeployed `
  -OldConnectionInvalidated `
  -OpsHealthPassed `
  -RequireAll
```

## Local/Render parity check

If local database is exposed on host port 5432:

```powershell
$env:LOCAL_DATABASE_URL='postgres://dotwatch:LOCAL_PASSWORD@localhost:5432/dotwatch'
$env:DATABASE_URL = Read-Host "Paste Render External Database URL"

npm run db:parity -- `
  -LocalDatabaseUrl $env:LOCAL_DATABASE_URL `
  -RenderDatabaseUrl $env:DATABASE_URL
```

If local database is inside Docker and not reachable through `host.docker.internal`, pass the database container name:

```powershell
docker ps --format "table {{.Names}}	{{.Image}}	{{.Ports}}"

npm run db:parity -- `
  -LocalDatabaseUrl "postgres://dotwatch:LOCAL_PASSWORD@localhost:5432/dotwatch" `
  -RenderDatabaseUrl $env:DATABASE_URL `
  -LocalDockerContainerName "your-postgres-container-name"
```

Reports are written to:

```text
_reports\phase9-parity
_reports\phase9-security
```

## Success criteria

- `verify:phase9:maintenance` passes.
- Render health check passes.
- Render database backup succeeds using PostgreSQL 18 client.
- Database password has been rotated after exposure.
- Render backend uses the new rotated `DATABASE_URL`.
- Old exposed connection string no longer works.
- Local/Render schema parity either matches or any difference is explained by pending migration work.
