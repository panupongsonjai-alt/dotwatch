# Phase 11D — Admin Sidebar Dashboard Parity

## Goal

Align the Admin sidebar visual structure with the Dashboard sidebar while keeping Admin pages, Admin API, role checks, and data flow independent.

## What changed

- Re-grouped Admin navigation into Dashboard-like blocks:
  - Admin Workspace: Overview, Users, Devices
  - Operations: Device Models, Subscriptions, Audit Logs
  - System: System
  - Account: Settings
- Matched collapsed sidebar behavior with Dashboard:
  - hidden section labels do not consume height
  - active item indicator uses the same geometry as Dashboard
  - group dividers and spacing follow the Dashboard pattern
  - sidebar card is hidden when collapsed
- Kept Admin-specific icons, pages, routes, API calls, auth gate, and role protection.

## Files changed

- `apps/admin/src/config/adminPages.js`
- `apps/admin/src/styles/admin.css`
- `scripts/phase11d-admin-sidebar-parity-verify.mjs`
- `package.json`

## Verify

```powershell
npm run verify:phase11d:admin-sidebar
npm run admin:build
```
