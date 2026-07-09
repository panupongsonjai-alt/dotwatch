# Phase 9F - Required Nullability Normalization

## Purpose

`db:parity:compat` showed that local and Render have the same required runtime columns, but the nullability differs for these columns:

- `activity_logs.created_at`
- `activity_logs.metadata`
- `activity_logs.severity`
- `devices.secret_hash`
- `users.device_limit`
- `users.plan`
- `users.role`
- `users.status`
- `users.updated_at`

This can happen when a column already exists before a later migration adds `ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT ...`. PostgreSQL does not update the existing column nullability in that case.

## What the migration does

`services/backend/migrations/020_phase9f_required_nullability_normalization.sql`:

1. Backfills safe defaults for activity log and user columns.
2. Refuses to alter `devices.secret_hash` if any row still has a NULL secret hash.
3. Sets the required runtime columns to `NOT NULL` with expected defaults.

## Safe run order

1. Confirm Render backup exists.
2. Set `DATABASE_URL` to the Render External Database URL.
3. Run:

```powershell
npm run verify:phase9f:nullability
npm run db:env:check -- -RequireDockerOrPgDump -RequireRender
npm run backend:migrate
npm run report:tenant
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -AllowReady503
npm run db:parity:compat -- `
  -LocalDatabaseUrl "$LocalDbUrl" `
  -RenderDatabaseUrl "$RenderDbUrl"
```

## If migration stops at devices.secret_hash

Run this diagnostic on the target database first:

```sql
SELECT id, device_code, name, is_active, created_at
FROM devices
WHERE secret_hash IS NULL
ORDER BY created_at DESC;
```

Do not invent a shared device secret in SQL. Reset those device secrets intentionally through the backend/admin flow, or deactivate invalid device rows before enforcing `NOT NULL`.

## Expected result

After migration, `db:parity:compat` should no longer show nullability-only differences for the required runtime columns.
