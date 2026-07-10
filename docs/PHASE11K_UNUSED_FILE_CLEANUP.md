# Phase 11K — Unused File Cleanup

## Goal

Clean unused and duplicated files across the whole `dotwatch` folder while keeping current runtime sources intact.

This cleanup keeps the current source of truth:

- Dashboard: `apps/dashboard`
- Admin: `apps/admin`
- Backend: `services/backend`
- Raspberry Pi agent: `pi/agent`
- ESP32 production firmware: `esp32/dotwatch_esp32_dht3_tls_hardened`
- Root scripts referenced by `package.json`
- Current project documentation in `docs/`

## What was removed

Phase 11K removes these categories:

1. Historical root audit and old phase README files that are no longer the current source of truth.
2. Duplicate root ESP32 files; the canonical ESP32 project is under `esp32/dotwatch_esp32_dht3_tls_hardened`.
3. Legacy ESP32 firmware variants that were superseded by the TLS hardened firmware.
4. Duplicate Pi config UI folder; the canonical config UI now lives in `pi/agent`.
5. Unreferenced Admin Vite starter files and old pages.
6. Dashboard audit docs under `apps/dashboard/docs`; current project docs are kept under root `docs/`.

## What was not removed

Phase 11K does not remove runtime or deployment-critical files:

- No `.env.example` or `.env.production.example` files were removed.
- No backend migrations were removed.
- No backend routes, controllers, or services were removed.
- No current Dashboard/Admin source files were removed.
- No ESP32 TLS hardened source files were removed.
- No package scripts from previous phases were removed.

## Commands

Apply cleanup to an existing local working tree:

```powershell
cd "D:\IoT Project\dotwatch"
npm run cleanup:phase11k:unused
npm run verify:phase11k:cleanup
```

Build checks:

```powershell
npm run dashboard:build
npm run admin:build
```

Git push:

```powershell
git status
git add .
git commit -m "Clean unused dotWatch files"
git push origin main
```
