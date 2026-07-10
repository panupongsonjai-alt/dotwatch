# Phase 11I — Admin / Dashboard Comfort Parity

## Purpose

Make Dashboard and Admin feel like the same product while preserving each app's own purpose and content.

Dashboard remains the monitoring workspace. Admin remains the control/admin workspace.

## What changed

### Dashboard

Added:

```text
apps/dashboard/src/styles/phase11i-dashboard-comfort-parity.css
```

This locks the final Dashboard shell constants for sidebar, collapsed sidebar, topbar, card radius, input radius, focus ring, and readable line-height.

### Admin

Added:

```text
apps/admin/src/styles/phase11i-admin-comfort-parity.css
```

This applies the same shell constants to Admin using Admin class names, without importing Dashboard components or sharing Dashboard logic.

## Install

Copy the patch into the repo, then run:

```powershell
cd "D:\IoT Project\dotwatch"

npm run verify:phase11i:admin-dashboard-comfort
npm run dashboard:build
npm run admin:build
```

## Git push

```powershell
cd "D:\IoT Project\dotwatch"

git status
git add .
git commit -m "Improve admin and dashboard UI comfort parity"
git push origin main
```

## Render deploy

After push, redeploy Dashboard and Admin services. Backend deploy is not required for this phase because backend code is not changed.
