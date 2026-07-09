# Phase 7D — DB Ops Docker Exec Hotfix

This hotfix improves dotWatch local database backup/restore on Windows when PostgreSQL runs inside Docker and PostgreSQL client tools are not installed locally.

## Why this exists

`db:backup` previously used Docker run fallback and rewrote `localhost` to `host.docker.internal`. That works only when the PostgreSQL container publishes port `5432` to the Windows host. In some dotWatch local setups the backend can still reach PostgreSQL through Docker networking, but a separate fallback container cannot reach `host.docker.internal:5432`. The backup then fails even though migrations work.

Phase 7D adds a safer order for local backups:

1. Use local `pg_dump` if installed.
2. If the target is local and Docker is available, auto-detect the running PostgreSQL/TimescaleDB container and run `pg_dump` with `docker exec` inside that DB container.
3. If no suitable DB container is found, fall back to the existing Docker run method with `host.docker.internal`.

## New options

`db-backup.ps1` and `db-restore.ps1` now support:

```powershell
-DockerContainerName <name>
-NoDockerExecFallback
```

Use `-DockerContainerName` if auto-detection chooses the wrong container.

## Recommended local backup command

```powershell
cd "D:\IoT Project\dotwatch"

$env:DATABASE_URL="postgres://dotwatch:<LOCAL_DB_PASSWORD>@localhost:5432/dotwatch"

npm run db:env:check -- -RequireDockerOrPgDump
npm run db:backup
```

If auto-detection fails, find the container name:

```powershell
docker ps
```

Then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1 `
  -DockerContainerName "dotwatch-db"
```

Replace `dotwatch-db` with the actual PostgreSQL container name.

## Render production backup

For Render production, do not use a localhost URL. Use the real Render External Database URL:

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"

npm run db:env:check -- -RequireDockerOrPgDump -RequireRender
npm run db:backup
```

Never paste the real production database URL into chat or commit it to the repository.

## Restore safety

Restore remains dry-run by default:

```powershell
npm run db:restore -- -BackupFile "D:\IoT Project\dotwatch\_backups\database\dotwatch-full-YYYYMMDD-HHMMSS.dump"
```

Actual restore requires `-Apply`:

```powershell
npm run db:restore -- -BackupFile "D:\IoT Project\dotwatch\_backups\database\dotwatch-full-YYYYMMDD-HHMMSS.dump" -Apply
```

For local Docker DBs, restore can also use Docker exec fallback automatically.
