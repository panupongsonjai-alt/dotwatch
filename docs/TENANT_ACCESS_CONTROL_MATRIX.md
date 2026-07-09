# dotWatch Tenant Access Control Matrix

This matrix defines Phase 7 organization/device permissions.

| Action | owner | admin | operator | viewer |
|---|---:|---:|---:|---:|
| View organization list/context | Yes | Yes | Yes | Yes |
| View organization overview | Yes | Yes | Yes | Yes |
| View organization usage | Yes | Yes | Yes | Yes |
| View organization audit logs | Yes | Yes | No | No |
| Create organization | Yes* | Yes* | Yes* | No |
| Add member | Yes | Yes | No | No |
| Add owner | Yes | No | No | No |
| Update owner | Yes | No | No | No |
| Update admin/operator/viewer | Yes | Yes | No | No |
| Cancel invitation | Yes | Yes | No | No |
| Create site | Yes | Yes | No | No |
| Update site | Yes | Yes | No | No |
| Create device group | Yes | Yes | No | No |
| Update device group | Yes | Yes | No | No |
| View devices | Yes | Yes | Yes | Yes |
| View device history | Yes | Yes | Yes | Yes |
| Update device metadata/placement | Yes | Yes | Yes | No |
| Create device in organization | Yes | Yes | Yes | No |
| View/reset Device Secret | Yes | Yes | No | No |
| Delete device | Yes | Yes | No | No |

`*` Organization creation is still controlled by authenticated user flow and plan/quota logic. In Phase 7, it remains backward compatible with the previous single-user flow.

## Important implementation notes

- `devices.user_id` remains valid for backward compatibility.
- Organization access is granted when the user has an active row in `organization_members`.
- A direct device owner is treated as an owner-level actor for that device.
- Device Secret operations intentionally require owner/admin role.
- Viewer can read but cannot mutate.
- Operator can operate/update devices but cannot access secrets or delete devices.

## Future hardening

Recommended follow-up work:

1. Add automated API tests for every role.
2. Move Device Delete to a soft-delete/decommission endpoint.
3. Add owner transfer workflow.
4. Add invitation acceptance endpoint with token verification and email flow.
5. Add admin UI for quota overrides.
