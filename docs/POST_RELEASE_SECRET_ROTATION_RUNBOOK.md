# Post-release Secret Rotation Runbook

A production database URL was exposed during troubleshooting. Treat the old password as compromised.

## Rotate database password

1. Open Render dashboard.
2. Open the PostgreSQL database.
3. Rotate/reset the database password.
4. Copy the new External Database URL.
5. Update Render backend `DATABASE_URL` environment variable.
6. Redeploy backend.
7. Run health check.
8. Verify the old connection string no longer works.

## Local PowerShell check

```powershell
cd "D:\IoT Project\dotwatch"

$env:DATABASE_URL='postgresql://NEW_USER_OR_PASSWORD@RENDER_HOST/dotwatch?sslmode=require'

npm run db:env:check -- -RequireDockerOrPgDump -RequireRender
npm run db:backup
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -AllowReady503
```

## Advisory check

```powershell
npm run security:rotation:check
```

## Strict completion check

Run this only after completing all manual steps:

```powershell
npm run security:rotation:check -- `
  -DatabasePasswordRotated `
  -RenderEnvUpdated `
  -BackendRedeployed `
  -OldConnectionInvalidated `
  -OpsHealthPassed `
  -RequireAll
```

## Do not store secrets in repo

Allowed:

```text
.env.example
.env.production.example
```

Not allowed:

```text
.env
.env.local
.env.production
*.dump
*.pem
*.key
service account JSON files
```

Backups should stay under `_backups/`, which is ignored by git and clean export.
