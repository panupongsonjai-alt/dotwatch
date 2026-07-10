# Phase 11I — Admin / Dashboard Structure, Font, CSS Comfort Audit

## Scope

This audit compares the latest `apps/dashboard` and `apps/admin` web apps for visual structure, font usage, CSS layering, spacing, sidebar behavior, topbar rhythm, cards, buttons, inputs, and overall readability.

No backend, database, ESP32 firmware, API route, permission, role, or page data logic is changed.

## Findings

### 1. Shell structure

Dashboard is the reference shell and already has a stable pattern:

- fixed/collapsible sidebar
- sticky top header
- page content area
- grouped navigation
- common card/panel/form controls
- Inter + Prompt font stack

Admin already follows the same structure after previous phases, but it still had small CSS drift because Admin uses its own class namespace and a large base stylesheet.

### 2. CSS layering

Dashboard imports many historical stabilizer files. Admin has `admin.css` plus a parity layer. The safest improvement is not to delete old CSS in this pass, but to add a final controlled parity layer for both apps. This makes the final cascade explicit and avoids breaking page details.

### 3. Font comfort

Dashboard uses `Inter` and `Prompt`, which reads better for Thai + English mixed UI. Admin was already partly aligned, but Phase 11I locks both apps to the same font stack at the final layer.

### 4. Sidebar comfort

The most sensitive area is collapsed sidebar geometry. Both apps now use the same visual constants:

- sidebar width: `280px`
- collapsed width: `88px`
- collapsed nav pill: `48px`
- topbar height: `76px`
- page horizontal padding: `28px`
- page gap: `18px`

Dashboard and Admin still keep their own menu items and routes. Only visual rhythm is aligned.

### 5. Visual comfort

Cards, panels, controls, focus rings, and line-height now use shared comfort tokens so both apps feel softer and easier to scan without changing data content.

## Files changed

- `apps/dashboard/src/styles.css`
- `apps/dashboard/src/styles/phase11i-dashboard-comfort-parity.css`
- `apps/admin/src/main.jsx`
- `apps/admin/src/styles/phase11i-admin-comfort-parity.css`
- `scripts/phase11i-admin-dashboard-comfort-verify.mjs`
- `package.json`

## Verification

Run:

```powershell
npm run verify:phase11i:admin-dashboard-comfort
```

Expected:

```text
Phase 11I Admin/Dashboard comfort verify: OK
```

## Not changed

- Admin data details
- Dashboard data details
- Backend
- Database
- ESP32
- Firebase
- Render settings
- API permissions
