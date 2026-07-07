# dotWatch Phase 5 — Admin & Commercial Foundation

Phase 5 adds the foundation needed to turn dotWatch into a multi-customer / commercial product without changing the existing Raspberry Pi ingest flow.

## Install

Copy this patch into the root `dotwatch` folder, then run:

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase5
npm run backend:migrate
```

Restart the backend after the migration.

## New backend endpoints

User/customer billing:

```text
GET /api/billing/plans
GET /api/billing/me
```

Admin/commercial:

```text
GET   /api/admin/plans
GET   /api/admin/commercial-summary
PATCH /api/admin/users/:userId/plan
PATCH /api/admin/users/:userId/role
```

Organization/team foundation:

```text
GET    /api/organizations
POST   /api/organizations
GET    /api/organizations/:id/overview
GET    /api/organizations/:id/members
POST   /api/organizations/:id/members
PATCH  /api/organizations/:id/members/:memberId
GET    /api/organizations/:id/invitations
DELETE /api/organizations/:id/invitations/:invitationId

GET    /api/sites?organizationId=1
POST   /api/sites
PUT    /api/sites/:id

GET    /api/device-groups?organizationId=1
POST   /api/device-groups
PUT    /api/device-groups/:id
```

## New database tables

```text
plan_definitions
user_subscriptions
organization_invitations
```

`admin_audit_logs` also gains:

```text
metadata
ip_address
request_id
```

## Important behavior change

Create Device now checks the user's current plan limit before creating the device.

If the user is over the limit, backend returns:

```json
{
  "code": "DEVICE_LIMIT_REACHED",
  "message": "Device limit reached for current plan (3/3)",
  "details": { ... }
}
```

## Report

After migrating, you can check plan and usage status:

```powershell
npm run report:commercial
```

