# Phase 11H — Dashboard Sidebar Vertical Restore

## Scope

This patch changes only the Dashboard collapsed sidebar vertical position.
It does not change Admin, Backend, Database, ESP32, API, routes, or Dashboard page logic.

## What changed

The collapsed Dashboard sidebar icons were horizontally centered in Phase 11E/11G, but the icon list moved upward.
This patch keeps the horizontal centering and restores the collapsed menu list slightly lower.

Changed files:

- `apps/dashboard/src/styles.css`
- `apps/dashboard/src/styles/phase11h-dashboard-sidebar-vertical-restore.css`
- `scripts/phase11h-dashboard-sidebar-vertical-verify.mjs`
- `package.json`

## Install

Copy the `dotwatch` folder from the patch over your project:

```powershell
cd "D:\IoT Project\dotwatch"

npm run verify:phase11h:dashboard-sidebar-vertical
npm run dashboard:build
```

## Git push

```powershell
cd "D:\IoT Project\dotwatch"

git status
git add .
git commit -m "Restore dashboard sidebar icon vertical position"
git push origin main
```
