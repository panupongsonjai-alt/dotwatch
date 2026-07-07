# Phase 5: Admin & Commercial Foundation

## Goal

Phase 5 prepares dotWatch for customer accounts, plans, team roles, organizations, and plan-based device limits.

This phase intentionally avoids building a full payment integration. It creates the internal model needed before connecting Stripe/Omise/2C2P or manual invoicing later.

## What changed

### 1. Plan Definitions

Added `plan_definitions` with default plans:

| Plan | Devices | Sites | Users | Retention |
|---|---:|---:|---:|---:|
| Free | 3 | 1 | 1 | 30 days |
| Basic | 10 | 3 | 3 | 180 days |
| Pro | 30 | 10 | 10 | 365 days |
| Enterprise | 100 | 50 | 50 | 730 days |

### 2. User Subscriptions

Added `user_subscriptions` and backfilled all existing users from `users.plan`.

This lets the system separate:

- Account profile (`users`)
- Commercial subscription (`user_subscriptions`)
- Plan limits (`plan_definitions`)

### 3. Device Limit Enforcement

`POST /api/devices` now checks current device usage before creating a new device.

The old dashboard/API still works. The only new restriction is that users cannot create more active devices than their plan allows.

### 4. Organization Routes Mounted

The project already had organization/site/group route files, but they were not mounted in `server.js`.

Phase 5 mounts:

```text
/api/organizations
/api/sites
/api/device-groups
```

### 5. Team Member Foundation

Added organization member endpoints:

- List members
- Add existing user by email
- Create pending invitation when the email does not exist yet
- Update role / active state
- Cancel pending invitation

No email delivery is implemented yet. The invitation table is ready for a future email job.

### 6. Admin Commercial APIs

Added:

```text
GET /api/admin/plans
GET /api/admin/commercial-summary
PATCH /api/admin/users/:userId/plan
PATCH /api/admin/users/:userId/role
```

`PATCH /api/admin/users/:userId/role` requires `super_admin`.

### 7. Admin Audit Metadata

`admin_audit_logs` now stores:

- structured `metadata`
- `ip_address`
- `request_id`

This makes later compliance/debugging easier.

## Next recommended phase

Phase 6 should focus on notifications and reports:

- LINE Notify / Telegram / Email alerts
- Alarm notification delivery log
- CSV/PDF reports
- Scheduled daily/weekly reports
- Notification channel settings per organization/site/device
