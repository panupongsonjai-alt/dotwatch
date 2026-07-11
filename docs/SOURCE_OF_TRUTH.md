# dotWatch Source of Truth

Last updated: 2026-07-11

This file defines which folders/files are the canonical source for the project. Use it before editing, exporting, or deploying dotWatch.

## Canonical app locations

| Area | Canonical path | Notes |
|---|---|---|
| Backend API | `services/backend` | Express API, migrations, auth, ingest, admin APIs. |
| Dashboard | `apps/dashboard` | User dashboard UI. |
| Admin console | `apps/admin` | Admin/commercial management UI. |
| Raspberry Pi Agent | `pi/agent` | Production Pi gateway/agent files. |
| Raspberry Pi scripts | `pi/scripts` | Windows PowerShell upload/check/setup helpers. |
| ESP32 production firmware | `esp32/dotwatch_esp32_product` | Modular ESP32 Product Core firmware. |
| Documentation | `docs` | Architecture, deployment, security and phase docs. |
| Root scripts | `scripts` | Verification, export, smoke test, doctor scripts. |

## Important backend rule

`device_metric_latest` must be a **TABLE**, not a view.

Reason: `services/backend/src/controllers/ingest.controller.js` writes latest metric values with `INSERT ... ON CONFLICT (device_id, metric_key)`. A view cannot support this ingest path.

Canonical repair/check scripts:

```powershell
cd "D:\IoT Project\dotwatch\services\backend"
$env:DATABASE_URL="postgresql://..."
node .\repair-device-metric-latest-table.cjs
node .\check-device-metric-latest.cjs
```

Deprecated compatibility wrappers still exist for safety:

- `services/backend/create-device-metric-latest-view.cjs`
- `services/backend/repair-device-metric-latest-view.cjs`

They now run the safe TABLE repair script instead of creating a view.

## Generated / non-source folders

These should not be committed or sent as the clean project zip:

- `.pio`
- any `*/.pio`
- `node_modules`
- `dist`, `build`, `.vite`
- `_reports`
- `diagnostics`
- `_export`
- `_archive`
- `__pycache__`, `.pytest_cache`, `.mypy_cache`
- `logs`, `tmp`, `temp`

## Secrets / local-only files

Never commit or export:

- `.env`
- `.env.local`
- `.env.production`
- Firebase service account JSON files
- private key files: `.pem`, `.key`, `.p8`, `.p12`
- database dumps/backups
- Raspberry Pi runtime queue data

Examples are allowed:

- `.env.example`
- `.env.local.example`
- `.env.production.example`

## Phase 0 cleanup command

Dry run first:

```powershell
cd "D:\IoT Project\dotwatch"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase0-safe-cleanup.ps1
```

Apply cleanup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase0-safe-cleanup.ps1 -Apply
```

The cleanup script moves generated/backup files to `_archive`; it does not permanently delete them.

## Clean export command

```powershell
cd "D:\IoT Project\dotwatch"
npm run export:clean
```

The clean export excludes generated files, reports, diagnostics, backups, real env files and key files.


## Phase 2 security rules

- Pi Config UI canonical files are in `pi/agent/pi_config_web.py` and `pi/agent/install_config_ui_service.sh`.
- Pi Config UI binds to `127.0.0.1:8080` by default. Use SSH tunnel unless LAN exposure is explicitly required.
- ESP32 production firmware is `esp32/dotwatch_esp32_product`.
- ESP32 production firmware must not use insecure TLS fallback unless a lab-only build flag is deliberately enabled.
- Backend production Dockerfile must not run `npm run dev`.

## Phase 4 device field readiness rules

- Raspberry Pi commissioning uses `scripts/pi-field-commissioning.ps1` from Windows and `pi/agent/agent_field_test.py` on the Pi.
- Pi field tests must mask `DEVICE_SECRET`; do not paste raw `.env` or real secrets into chat, Git or exported zip files.
- Pi production/lab HTTP backend URLs are blocked by default unless `ALLOW_HTTP_API=true` is explicitly set for a trusted local network.
- ESP32 field checks use `scripts/esp32-field-check.ps1`; production source remains `esp32/dotwatch_esp32_product/src/main.cpp`.
- Do not flash legacy ESP32 sketches from old exports; use the Product Core project above.

## Phase 10A ESP32 Wi-Fi memory rules

- ESP32 production firmware remains `esp32/dotwatch_esp32_product/src/main.cpp`.
- Remembered Wi-Fi profiles are stored in ESP32 Preferences/NVS key `wifiProfiles`.
- Firmware remembers up to 5 Wi-Fi profiles and auto-connects to the strongest remembered SSID found during scan.
- Factory Reset Config clears remembered Wi-Fi profiles together with device/backend/TLS settings.
- Do not print or expose Wi-Fi passwords in portal, JSON, logs, or screenshots.

## Clean repository rules

- Legacy root sketches and old ESP32 variants are removed from the clean repository.
- Pi Config UI source is canonical under `pi/agent`; `pi/config-ui` is no longer exported.
- Dashboard/Admin unused starter files and one-off audit notes are not exported.
