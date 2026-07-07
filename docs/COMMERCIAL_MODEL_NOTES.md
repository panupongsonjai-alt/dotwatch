# dotWatch Commercial Model Notes

## Current internal model

```text
users
  └─ user_subscriptions
       └─ plan_definitions

organizations
  ├─ organization_members
  ├─ organization_invitations
  ├─ sites
  │   └─ device_groups
  │       └─ devices
```

## Why keep `users.plan`?

`users.plan` remains for backward compatibility with the existing Admin UI and earlier code.

`user_subscriptions.plan_key` is the commercial source of truth going forward.

During Phase 5, both are kept in sync by admin plan updates.

## Recommended future billing integration

Do not connect payment provider directly to `users.plan`.

Recommended flow:

1. Payment provider webhook received
2. Verify webhook signature
3. Update `user_subscriptions`
4. Sync `users.plan`, `users.status`, `users.device_limit`
5. Write `admin_audit_logs`

## Suggested production plans

The seeded plan limits are intentionally conservative:

- Free: demo/testing
- Basic: small site
- Pro: commercial customer
- Enterprise: manual contract

Adjust prices and limits in `plan_definitions` before selling.
