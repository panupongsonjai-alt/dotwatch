# dotWatch Phase 7 — Multi-tenant / Commercial Readiness

Phase 7 adds the minimum safe foundation for using dotWatch with multiple organizations, teams, roles, and future paid plans while keeping the current `user_id` device ownership flow working.

## What changed

### 1. Tenant access foundation

New backend service:

- `services/backend/src/services/organizationAccess.service.js`

It centralizes role checks for:

- organization read access
- organization admin access
- device read/manage access
- stricter Device Secret access

The important design decision is backward compatibility. A device can still be owned directly by `devices.user_id`, but if a device belongs to an organization, active members of that organization can also access it according to their role.

### 2. Tenant-visible audit log

New migration table:

- `organization_audit_logs`

This is separate from `admin_audit_logs`. `admin_audit_logs` remains system/admin facing. `organization_audit_logs` is safe to show later inside an organization admin panel because every row is scoped to one `organization_id`.

### 3. Organization usage/quota support

New migration table:

- `organization_quota_overrides`

This allows future custom limits per organization without changing plan definitions globally. If an override is `NULL`, the system uses the owner subscription plan default.

New usage service:

- `services/backend/src/services/organizationUsage.service.js`

It calculates:

- device count
- site count
- member count
- pending invitation count
- effective device/site/user/retention limits
- warning/blocked status

### 4. New tenant API

New route:

```text
GET /api/tenant/context
```

Returns the authenticated user, organizations they belong to, role per organization, and active organization usage.

New organization endpoints:

```text
GET /api/organizations/:id/usage
GET /api/organizations/:id/audit-logs
```

`/usage` is visible to all active organization members. `/audit-logs` is visible only to owner/admin.

### 5. Device access upgraded for teams

The main device endpoints now use tenant-aware checks:

- `GET /api/devices`
- `GET /api/devices/:id`
- `PUT /api/devices/:id`
- `GET /api/devices/:id/history`
- `GET /api/devices/:id/secret`
- `POST /api/devices/:id/reset-secret`
- `DELETE /api/devices/:id`

Role behavior is documented in `docs/TENANT_ACCESS_CONTROL_MATRIX.md`.

## Install order

1. Apply the Phase 7 patch files.
2. Run static verification.
3. Back up the database.
4. Run migration.
5. Run tenant report.
6. Smoke test tenant endpoints.

## Commands

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase7:tenant
```

Set database URL for the current PowerShell session:

```powershell
$env:DATABASE_URL="วาง Render External Database URL ตรงนี้"
```

Back up first:

```powershell
npm run db:backup
```

Run migration:

```powershell
npm run backend:migrate
```

Generate tenant report:

```powershell
npm run report:tenant
```

## API smoke tests

After logging in from dashboard/admin, use real Firebase token for authenticated APIs.

Local dev with `DEV_AUTH_BYPASS=true`:

```powershell
Invoke-RestMethod "http://localhost:4000/api/tenant/context"
```

Render production requires a Bearer token:

```powershell
$token="วาง Firebase ID token"
Invoke-RestMethod `
  -Headers @{ Authorization="Bearer $token" } `
  "https://dotwatch-backend.onrender.com/api/tenant/context"
```

## Safety notes

- This phase does not force all devices to be organization-only.
- Existing single-user dashboard behavior should continue to work.
- Device Secret access is stricter than normal read access.
- Tenant audit is best-effort and will not break main actions if logging fails.
- Quota overrides are added now, but an admin UI for editing them should be a later phase.

## Recommended next phase

Phase 8 should focus on production release hardening:

- full staging deploy checklist
- Firebase custom claims or backend role sync policy
- admin UI for tenant usage/audit
- safe soft-delete/decommission flow for devices
- end-to-end tests for owner/admin/operator/viewer roles
