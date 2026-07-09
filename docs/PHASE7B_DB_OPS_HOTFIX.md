# Phase 7B — DB Ops Hotfix

This hotfix fixes two common operations problems before running Phase 7 migration against Render PostgreSQL.

## What changed

1. `scripts/db-backup.ps1`
   - Blocks placeholder `DATABASE_URL` values before running.
   - Masks the database URL in logs.
   - Searches common Windows PostgreSQL install paths.
   - Uses Docker fallback with `postgres:16-alpine` when local `pg_dump` is not installed.

2. `scripts/db-restore.ps1`
   - Blocks placeholder `DATABASE_URL` values before restore.
   - Keeps restore as dry-run by default.
   - Uses Docker fallback when `psql` / `pg_restore` is not installed.

3. `scripts/db-env-check.ps1`
   - Validates `DATABASE_URL` format.
   - Shows masked DB host/name.
   - Checks whether `pg_dump`, `pg_restore`, `psql`, or Docker are available.

4. `services/backend/migrations/run.js`
   - Blocks migration early if `DATABASE_URL` is missing, invalid, or still a placeholder.
   - Prints a masked database URL instead of failing later with unclear DNS errors such as `ENOTFOUND base`.

## Correct Render database URL

Use the real Render PostgreSQL **External Database URL** from Render Dashboard.

Do not use placeholder text such as:

```powershell
$env:DATABASE_URL="วาง Render External Database URL ตรงนี้"
```

The real value should look similar to this pattern, but with your actual private credentials:

```text
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Keep it private. Do not commit it and do not paste it into chat.

## Recommended command order

```powershell
cd "D:\IoT Project\dotwatch"

$env:DATABASE_URL="PASTE_REAL_RENDER_EXTERNAL_DATABASE_URL_HERE"

npm run db:env:check -- -RequireDockerOrPgDump
npm run db:backup
npm run backend:migrate
npm run report:tenant
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -AllowReady503
```

## If Docker fallback is used

The first `db:backup` run may pull the PostgreSQL client image:

```text
postgres:16-alpine
```

After that, backup files are created in:

```text
_backups/database/
```

Keep this folder private.
