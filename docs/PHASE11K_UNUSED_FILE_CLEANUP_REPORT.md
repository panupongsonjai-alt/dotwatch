# Phase 11K — Cleanup Report

## Summary

Input source used for cleanup: Phase 11J clean repo.

Removed paths: 54 top-level file/folder entries.

Approximate file count:

- Before cleanup: 593 files
- After cleanup plus Phase 11K scripts/docs: 525 files

## Removed categories

### Historical root documentation and audits

Removed old root-level phase/audit notes that were replaced by the current `docs/` source of truth.

Examples:

- `AUDIT_LATEST_ZIP_20260708.md`
- `AUDIT_PHASE4B_MODEL_ADMIN.md`
- `AUDIT_REPORT.md`
- old root `README_PHASE*_START_HERE.md` files, except `README_PHASE4_START_HERE.md` which is still required by `verify:phase4`
- `README_RASPBERRY_PI_*.md`
- `README_WHITE_SCREEN_FIX.md`

### Duplicate root ESP32 files

Removed root ESP32 duplicates because the canonical firmware is:

```text
esp32/dotwatch_esp32_dht3_tls_hardened
```

Removed examples:

- `dotwatch_esp32_dht3_tls_hardened.ino`
- `main.cpp`
- `platformio.ini`
- `dotwatch-phase5a-esp32-tls-hardening.ps1`
- `dotwatch-phase5b-fetch-tls-ca.v2.ps1`

Kept:

- `dotwatch-phase5b-fetch-tls-ca.ps1` because Phase 10B Root CA installer still calls it.
- `esp32/dotwatch_esp32_dht3_tls_hardened/**`

### Legacy ESP32 variants

Removed older ESP32 variants that are no longer the production source:

- `esp32/dotwatch_esp32_dht3`
- `esp32/dotwatch_esp32_dht3_config_portal`
- `esp32/dotwatch_esp32_dht3_hardened`
- `esp32/dotwatch_esp32_dht3_local_admin`

### Duplicate Pi config UI

Removed:

- `pi/config-ui`

Kept canonical files:

- `pi/agent/pi_config_web.py`
- `pi/agent/install_config_ui_service.sh`

### Admin unused Vite starter and legacy files

Removed unreferenced Admin files:

- `apps/admin/src/App.css`
- `apps/admin/src/index.css`
- `apps/admin/src/assets/hero.png`
- `apps/admin/src/assets/react.svg`
- `apps/admin/src/assets/vite.svg`
- `apps/admin/src/pages/AdminDashboard.jsx`
- `apps/admin/src/pages/Users.jsx`

### Dashboard app-level audit docs

Removed:

- `apps/dashboard/docs`

Current docs remain in:

```text
docs/
```

## Verification

Phase 11K verification checks that removed paths are gone and the current runtime source paths still exist.

Run:

```powershell
npm run verify:phase11k:cleanup
```
