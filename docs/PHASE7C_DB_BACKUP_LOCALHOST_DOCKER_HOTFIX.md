# Phase 7C — DB Backup Localhost/Docker Hotfix

## Why this hotfix exists

`db:backup` can use Docker as a fallback when `pg_dump` is not installed locally. On Windows, when Docker runs `pg_dump` inside a container, `localhost` means the container itself, not the Windows host.

If `DATABASE_URL` is similar to:

```text
postgres://USER:PASSWORD@localhost:5432/dotwatch
```

Docker fallback must connect to:

```text
host.docker.internal
```

This hotfix makes `db-backup.ps1` and `db-restore.ps1` rewrite local-only hosts automatically for Docker fallback.

## What changed

- `scripts/db-backup.ps1`
  - Detects `localhost`, `127.0.0.1`, and `::1`.
  - Rewrites local DB URL to `host.docker.internal` only for Docker fallback.
  - Prints a clear warning when the target is local and not Render.
  - Prints more helpful Docker troubleshooting notes on failure.

- `scripts/db-restore.ps1`
  - Adds the same Docker localhost handling for restore.
  - Keeps restore as dry-run by default unless `-Apply` is passed.

- `scripts/db-env-check.ps1`
  - Shows whether the DB target is local or Render-like.
  - Shows the Docker-safe local URL mask.
  - Adds `-RequireRender` to prevent accidentally using local DB before production migrate.

## Recommended commands for Render migration

Do not use localhost when backing up or migrating Render production.

```powershell
cd "D:\IoT Project\dotwatch"

# Put the real Render External Database URL here.
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"

npm run db:env:check -- -RequireDockerOrPgDump -RequireRender
npm run db:backup
npm run backend:migrate
npm run report:tenant
```

## Recommended commands for local backup

This is only for local development DB.

```powershell
cd "D:\IoT Project\dotwatch"
$env:DATABASE_URL="postgres://dotwatch:dotwatch@localhost:5432/dotwatch"
npm run db:env:check -- -RequireDockerOrPgDump
npm run db:backup
```

If Docker fallback is used, the script will automatically rewrite the Docker-side target to `host.docker.internal`.
