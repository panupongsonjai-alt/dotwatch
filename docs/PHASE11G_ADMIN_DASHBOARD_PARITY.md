# Phase 11G — Admin / Dashboard Parity Install Guide

## What changed

Phase 11G makes Admin and Dashboard closer in structure, font, spacing, and CSS behavior while keeping their details independent.

Changed files:

```text
apps/admin/src/main.jsx
apps/admin/vite.config.js
apps/admin/src/styles/phase11g-admin-dashboard-parity.css
apps/dashboard/src/styles.css
apps/dashboard/src/styles/phase11g-dashboard-parity-lock.css
scripts/phase11g-admin-dashboard-parity-verify.mjs
package.json
docs/PHASE11G_ADMIN_DASHBOARD_PARITY_AUDIT.md
docs/PHASE11G_ADMIN_DASHBOARD_PARITY.md
```

## What stays separate

```text
Admin routes
Admin pages
Admin API calls
Admin role checks
Dashboard monitoring pages
Dashboard device logic
Backend
Database
ESP32 firmware
```

## Install

Copy the patched `dotwatch` folder over:

```text
D:\IoT Project\dotwatch
```

## Verify

```powershell
cd "D:\IoT Project\dotwatch"

npm run verify:phase11g:admin-dashboard-parity
npm run dashboard:build
npm run admin:build
```

## Push

```powershell
cd "D:\IoT Project\dotwatch"

git status
git add .
git commit -m "Align admin and dashboard UI structure"
git push origin main
```

## Render deploy

After push, deploy Dashboard/Admin services on Render. Backend deploy is not required unless backend files changed separately.
