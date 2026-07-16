# Local / Render Parity Runbook

This runbook explains how dotWatch local and Render environments should relate to each other.

## Key principle

Local and Render should be aligned by migrations, not by permanent database-to-database syncing.

```text
Correct:
- Same migration files
- Same public schema after migration
- Render backup restored to local when a production-like local snapshot is needed

Avoid:
- Local backend using Render DB every day
- Render backend using local DB
- Automatic local -> Render sync
- Pi/ESP32 sending production data to local backend
```

## Check Render only

Enter the Render External Database URL only when PowerShell prompts for it. This keeps the credential out of the repository and normal command examples.

```powershell
$env:DATABASE_URL = Read-Host "Paste Render External Database URL"
npm run db:env:check -- -RequireDockerOrPgDump -RequireRender
npm run report:tenant
npm run ops:health -- -BackendUrl "https://dotwatch-backend.onrender.com" -AllowReady503
```

## Check local only

```powershell
$env:DATABASE_URL='postgres://dotwatch:LOCAL_PASSWORD@localhost:5432/dotwatch'
npm run db:env:check -- -RequireDockerOrPgDump
npm run report:tenant
```

Do not add `-RequireRender` when `DATABASE_URL` is local.

## Compare local and Render schema

With local exposed on port 5432:

```powershell
npm run db:parity -- `
  -LocalDatabaseUrl "postgres://dotwatch:LOCAL_PASSWORD@localhost:5432/dotwatch" `
  -RenderDatabaseUrl $env:DATABASE_URL
```

With local DB inside Docker:

```powershell
docker ps --format "table {{.Names}}	{{.Image}}	{{.Ports}}"

npm run db:parity -- `
  -LocalDatabaseUrl "postgres://dotwatch:LOCAL_PASSWORD@localhost:5432/dotwatch" `
  -RenderDatabaseUrl $env:DATABASE_URL `
  -LocalDockerContainerName "container-name-from-docker-ps"
```

## If schema hashes differ

1. Confirm both targets use the same repo version.
2. Run migrations on local.
3. Backup Render.
4. Run migrations on Render if needed.
5. Run parity again.

If data should match, restore a Render backup into local. Do not push local dummy data to Render production.
