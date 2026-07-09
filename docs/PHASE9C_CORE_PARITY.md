# dotWatch Phase 9C - Core Schema Parity

Phase 9C adds a second parity check for production safety.

The existing `npm run db:parity` is intentionally strict and compares all public objects. It can show `DIFFERENT` even when the production system is healthy, especially when local PostgreSQL has optional TimescaleDB continuous aggregates or legacy/dev objects that Render cannot create under its current TimescaleDB license.

Use the new command for release decisions:

```powershell
npm run db:parity:core -- `
  -LocalDatabaseUrl "$LocalDbUrl" `
  -RenderDatabaseUrl "$RenderDbUrl"
```

It compares required dotWatch tables, columns, constraints, and indexes. It also reports optional or legacy differences separately.

## Expected outcomes

### Core OK, strict different

This is acceptable for production when the differences are optional TimescaleDB objects, local-only legacy objects, or local test artifacts.

### Core different

Stop the release. Run migrations on the target that is behind, then re-run the core parity check.

### Need local to look exactly like Render

Use Render backup -> restore local. Do not push local schema/data into Render unless it is an intentional production restore from a trusted production backup.
