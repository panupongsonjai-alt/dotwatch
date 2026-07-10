# Phase 11J — Dashboard Sidebar Admin Spacing

## Scope

This patch changes only the Dashboard collapsed sidebar spacing so it matches the approved Admin collapsed sidebar rhythm.

It does not change:

- Admin app
- Backend
- Database
- ESP32 firmware
- Dashboard routes/pages/data logic

## Files changed

```text
apps/dashboard/src/styles.css
apps/dashboard/src/styles/phase11j-dashboard-sidebar-admin-spacing.css
scripts/phase11j-dashboard-sidebar-admin-spacing-verify.mjs
package.json
```

## What changed

The Dashboard collapsed sidebar now uses the same approved geometry as Admin:

```text
collapsed rail width       88px
collapsed rail padding     22px 14px
brand height               58px
brand bottom margin        26px
nav top offset             12px
nav item gap               10px
section item gap           7px
section divider spacing    10px / 10px
nav pill size              48px
active indicator left      5px
```

## Install

Copy the `dotwatch` folder from the patch over:

```text
D:\IoT Project\dotwatch
```

## Verify and build

```powershell
cd "D:\IoT Project\dotwatch"

npm run verify:phase11j:dashboard-sidebar-spacing
npm run dashboard:build
```

## Git push

```powershell
cd "D:\IoT Project\dotwatch"

git status
git add .
git commit -m "Match dashboard sidebar spacing to admin"
git push origin main
```
