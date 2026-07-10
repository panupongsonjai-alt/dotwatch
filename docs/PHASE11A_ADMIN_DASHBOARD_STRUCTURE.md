# Phase 11A - Admin structure aligned with Dashboard

## Goal

Make `apps/admin` use the same workspace pattern as `apps/dashboard` while keeping admin-only details, pages, permissions, and API calls separate.

## What changed

- Added admin page metadata in `apps/admin/src/config/adminPages.js`.
- Changed Admin App shell to match Dashboard structure:
  - lazy-loaded pages
  - grouped/collapsible sidebar
  - sticky topbar with theme toggle
  - workspace route bar
  - command palette with `Ctrl/⌘ + K`
  - help panel
  - page-level error boundary
  - dashboard-like loading and notice components
- Added common admin components mirroring Dashboard common components:
  - `PageHeader`
  - `SectionHeader`
  - `NoticeBanner`
  - `EmptyState`
  - `LoadingState`
  - `StatCard`
  - `StatusBadge`
- Added Firebase admin config guard so Admin login shows a useful config message instead of breaking when `.env.local` is missing.
- Added Admin CSS overrides so current admin pages use Dashboard-like layout tokens while keeping the admin accent/tone.

## What did not change

- Admin pages keep their existing content and admin-specific purpose.
- Admin API routes remain `/api/admin/...`.
- Dashboard app is not imported by Admin app.
- Backend, database, ESP32, Pi agent, and Render settings are not changed.

## Verify

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase11a:admin-structure
npm run admin:build
```

## Local admin env

```powershell
Copy-Item ".\apps\admin\.env.local.example" ".\apps\admin\.env.local" -Force
notepad ".\apps\admin\.env.local"
```

Fill Firebase Web SDK values and restart admin dev server.

```powershell
npm run admin:dev
```
