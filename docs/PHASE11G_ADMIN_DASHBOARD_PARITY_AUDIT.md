# Phase 11G — Admin / Dashboard Structure, Font, and CSS Parity Audit

Date: 2026-07-10
Scope: `apps/dashboard` and `apps/admin`

## Goal

Make the Admin web app feel and behave as close as possible to the Dashboard web app for end-user operation, while keeping Admin-specific details independent:

- Admin pages remain Admin pages.
- Admin API remains `/api/admin/...`.
- Admin role/permission checks remain unchanged.
- Dashboard device/monitoring pages remain unchanged.
- No backend, database, firmware, or ESP32 logic changes.

## Detailed findings

### 1. App structure

Dashboard structure is already the stronger reference pattern:

```text
App.jsx
├─ Sidebar
├─ Navbar / top-header
├─ Workspace route bar
├─ Command palette
├─ Help panel
└─ Lazy-loaded pages
```

Admin has the same intended pattern after Phase 11A:

```text
App.jsx
├─ AuthGate
├─ AdminLayout
│  ├─ AdminSidebar
│  └─ AdminTopbar
├─ AdminWorkspaceRouteBar
├─ AdminCommandPalette
├─ AdminWorkspaceHelp
└─ Lazy-loaded admin pages
```

Result: the high-level structure is acceptable and should not be merged into one shared React app. Keeping them separate prevents Dashboard monitoring logic and Admin permission logic from mixing.

### 2. CSS organization

Dashboard CSS is modular and imported through `apps/dashboard/src/styles.css`:

```text
base.css
layout.css
components.css
design-system.css
page-specific styles
phase-specific stabilizers
```

Admin CSS is still mostly monolithic in `apps/admin/src/styles/admin.css`, with later Phase 11 overrides appended. This works, but it is easier for older Admin rules to override newer rules by accident.

Action in Phase 11G: add a final Admin parity layer loaded after `admin.css`:

```text
apps/admin/src/styles/phase11g-admin-dashboard-parity.css
```

This avoids rewriting all Admin CSS and keeps the fix focused.

### 3. Font stack

Dashboard uses:

```text
Inter + Prompt + system UI
```

Admin used mostly:

```text
Inter + system UI
```

This causes Thai text and mixed English/Thai labels to look different between apps.

Action in Phase 11G: Admin now loads and uses the same font stack as Dashboard:

```text
Inter + Prompt + system UI
```

### 4. Layout tokens

Dashboard reference values:

```text
sidebar width             280px
collapsed sidebar width   88px
topbar height             76px
page gap                  18px
card radius               22px
form/button radius         13px
collapsed nav pill         48px
```

Action in Phase 11G: both apps now expose the same `--dw-*` visual constants, and Admin maps these constants into its Admin variables.

### 5. Sidebar behavior

Dashboard collapsed sidebar is the reference:

- 88px rail
- 48px centered nav pill
- centered icon
- section label hidden
- active bar visually attached to the pill

Admin already uses Dashboard-like class aliases:

```text
admin-nav menu
admin-menu-section menu-section
admin-nav-item menu-item
admin-menu-icon menu-icon
admin-menu-label menu-label
```

Action in Phase 11G: Admin collapsed sidebar geometry is locked to Dashboard dimensions.

### 6. Topbar behavior

Dashboard topbar:

- sticky
- 76px height
- background blur
- bottom border
- action buttons are 42px

Admin topbar now keeps Admin title/detail but uses Dashboard-equivalent height, spacing, button size, and background behavior.

### 7. Cards, headers, buttons, inputs

Dashboard common classes:

```text
dw-page-header
dw-stat-card
primary-button
ghost-button
secondary-button
input/select/textarea
```

Admin already uses several of the same shared class names. Phase 11G normalizes the final visual layer so both apps read consistently.

### 8. Runtime dependency difference

Current package difference found:

```text
Dashboard: React 18 / Vite 5
Admin:     React 19 / Vite 8
```

This phase does **not** change package versions because changing dependency versions also requires a package-lock update and can create a larger deployment risk. The visual/UI parity fix is safe without changing these packages.

Recommended future phase, only if needed:

```text
Phase 11H — Admin/Dashboard dependency version alignment
```

### 9. Unused Admin files found but not removed in this phase

The following look like legacy Vite/starter or unused Admin files:

```text
apps/admin/src/App.css
apps/admin/src/index.css
apps/admin/src/assets/react.svg
apps/admin/src/assets/vite.svg
apps/admin/src/assets/hero.png
apps/admin/src/pages/AdminDashboard.jsx
apps/admin/src/pages/Users.jsx
```

They are not imported by the current Admin app. This phase does not delete them because the requested task is parity of structure/font/CSS, not cleanup. Delete in a separate cleanup-only phase to keep changes easy to review.

## Phase 11G actions

- Added final Admin parity CSS layer.
- Added Dashboard visual constant lock CSS.
- Made Admin StrictMode env-gated like Dashboard.
- Added `base: '/'` to Admin Vite config like Dashboard.
- Added verification script to check parity-critical structure/classes/tokens.

## Verification

Run:

```powershell
npm run verify:phase11g:admin-dashboard-parity
npm run dashboard:build
npm run admin:build
```
