# dotWatch Phase 5 — Dashboard/Admin UX Stabilization

Phase 5 focuses on making the web UI safer and easier to operate before adding more commercial features. This phase intentionally avoids database writes, firmware changes, and device-side behavior changes.

## Scope

### Dashboard

- Add a workspace-level error boundary so one broken page does not turn the whole app into a white screen.
- Add a shared API status banner for slow backend responses and auth/permission errors.
- Add reusable loading and notice primitives under `apps/dashboard/src/components/common`.
- Keep Phase 5 CSS isolated in `apps/dashboard/src/styles/phase5-ux-stabilizer.css` and import it last from `styles.css`.
- Improve the document title to show the current workspace page.

### Admin

- Harden the admin API client to match the dashboard client safety level:
  - API URL validation.
  - HTTPS page blocks non-local HTTP API URLs.
  - timeout via `AbortController`.
  - retry once with refreshed Firebase token after 401.
  - request ID header.
  - admin API path guard.
- Persist the active admin page in localStorage.
- Add a manual refresh button for admin data.
- Add typed admin notices for success, warning, and error states.
- Fix the mock ESP32-DHT3 model metric list so metric keys are unique.

## Files changed

```text
apps/dashboard/src/App.jsx
apps/dashboard/src/components/AppErrorBoundary.jsx
apps/dashboard/src/components/ApiStatusBanner.jsx
apps/dashboard/src/components/common/LoadingState.jsx
apps/dashboard/src/components/common/NoticeBanner.jsx
apps/dashboard/src/components/common/index.js
apps/dashboard/src/styles.css
apps/dashboard/src/styles/phase5-ux-stabilizer.css
apps/admin/src/App.jsx
apps/admin/src/services/adminApi.js
apps/admin/src/styles/admin.css
scripts/phase5-ux-verify.mjs
scripts/phase5-ux-verify.ps1
package.json
docs/PHASE5_DASHBOARD_ADMIN_UX_STABILIZATION.md
```

## Verify

From the repo root:

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase5:ux
```

Optional PowerShell wrapper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase5-ux-verify.ps1
```

## Manual browser checks

### Dashboard

1. Start backend and dashboard.
2. Open dashboard and log in.
3. Check these pages: Dashboard, Devices, History, Alarms, Activity, System Health, Profile, Settings.
4. Temporarily stop backend and refresh a page. The app should show a backend/API notice instead of silently failing.
5. Open command palette with `Ctrl + K`; routing should still work.
6. Confirm the browser tab title changes per page, for example `Devices · dotWatch`.

### Admin

1. Start backend and admin UI.
2. Open admin and log in with an admin account.
3. Navigate between Overview, Users, Devices, Models, Subscriptions, Audit, System, Settings.
4. Refresh the browser. The same admin page should remain active.
5. Press `Refresh admin data`; it should reload admin datasets and disable the button while loading.
6. Temporarily stop backend. Admin should show a warning/error notice instead of hanging forever.

## Notes

- This phase does not remove legacy CSS yet. The project still has many historical stabilizer files, so Phase 5 adds the new stabilizer last rather than deleting old styles. A deeper CSS consolidation should be done only after visual screenshot comparison across all pages.
- This phase does not change backend routes. It only improves frontend behavior when backend calls are slow, unauthorized, or unavailable.
