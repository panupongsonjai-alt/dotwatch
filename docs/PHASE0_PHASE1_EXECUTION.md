# dotWatch Phase 0 + Phase 1 Execution

## Goal

Stabilize the repo before adding more features.

This phase focuses on:

1. Cleaning generated/backup files safely.
2. Fixing the backend `device_metric_latest` mismatch.
3. Mounting the missing `/api/demo-generator` route for development use.
4. Improving clean export rules so the next zip is truly clean.

## Files changed in this phase

| File | Change |
|---|---|
| `scripts/export-clean.ps1` | Excludes `.pio`, reports, diagnostics, backups, key/cert files and root scratch files. |
| `scripts/phase0-safe-cleanup.ps1` | New dry-run/apply cleanup script that archives, not deletes. |
| `docs/SOURCE_OF_TRUTH.md` | New canonical path and safety rules document. |
| `docs/PHASE0_PHASE1_EXECUTION.md` | New execution guide. |
| `services/backend/src/server.js` | Mounts `/api/demo-generator` route in development. |
| `services/backend/migrations/20260707_create_device_metric_latest.sql` | Converts this migration from wrong VIEW behavior to TABLE behavior. |
| `services/backend/repair-device-metric-latest-table.cjs` | New safe repair script. |
| `services/backend/check-device-metric-latest.cjs` | Checks that the relation is a TABLE with required columns. |
| `services/backend/create-device-metric-latest-view.cjs` | Deprecated wrapper; now runs safe TABLE repair. |
| `services/backend/repair-device-metric-latest-view.cjs` | Deprecated wrapper; now runs safe TABLE repair. |

## Step 1: install these files

Copy the patch files into your current repo at:

```text
D:\IoT Project\dotwatch
```

Overwrite existing files when Windows asks.

## Step 2: run Phase 0 dry run

```powershell
cd "D:\IoT Project\dotwatch"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase0-safe-cleanup.ps1
```

Review the list. It should mostly show generated/report/cache/backup files.

## Step 3: apply Phase 0 cleanup

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase0-safe-cleanup.ps1 -Apply
```

This moves files into `_archive\phase0-YYYYMMDD-HHMMSS` and writes a manifest. It does not delete files permanently.

## Step 4: verify backend syntax

```powershell
cd "D:\IoT Project\dotwatch"
npm run check:backend
```

## Step 5: repair/check `device_metric_latest` on Render database

Use this only after setting the real database URL in your current PowerShell session.

```powershell
cd "D:\IoT Project\dotwatch\services\backend"
$env:DATABASE_URL="วาง Render External Database URL ตรงนี้"
node .\repair-device-metric-latest-table.cjs
node .\check-device-metric-latest.cjs
```

Expected result:

- relation type is `table`
- required columns exist: `device_id`, `metric_key`, `time`, `value`, `updated_at`

## Step 6: run normal migration

```powershell
cd "D:\IoT Project\dotwatch"
npm run backend:migrate
```

## Step 7: run clean export

```powershell
npm run export:clean
```

The exported zip should no longer include `.pio`, `_reports`, diagnostics, backups or real env/key files.
