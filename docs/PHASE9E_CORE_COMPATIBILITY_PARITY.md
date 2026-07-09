# dotWatch Phase 9E - Core Compatibility Parity

Phase 9E adds a less brittle release gate for comparing Local and Render databases when they run different PostgreSQL / Timescale versions.

## Why this exists

`db:parity:core` is strict. It compares column order, defaults, constraints, indexes, optional Timescale objects, and legacy objects. That is useful for audit, but it can fail even when production is runtime-compatible.

Your current environment has:

- Local PostgreSQL 16.x
- Render PostgreSQL 18.x
- Render Timescale optional features skipped by license

So strict parity can remain different even after successful migration and healthy production checks.

## New release gate

Use:

```powershell
npm run db:parity:compat -- `
  -LocalDatabaseUrl "$LocalDbUrl" `
  -RenderDatabaseUrl "$RenderDbUrl"
```

This checks the production-critical compatibility set:

- required dotWatch core tables exist
- required dotWatch core columns exist
- core column data type / PostgreSQL type / nullability match

It reports, but does not fail on:

- column order differences
- default-expression differences
- index / constraint name differences
- optional Timescale continuous aggregates or policies
- legacy/dev non-core tables

## Strict mode

To make full column signatures release-blocking:

```powershell
npm run db:parity:compat -- `
  -LocalDatabaseUrl "$LocalDbUrl" `
  -RenderDatabaseUrl "$RenderDbUrl" `
  -StrictFullCoreColumns
```

## Report

Reports are written to:

```text
_reports\phase9-parity\phase9-core-compatibility-YYYYMMDD-HHMMSS.json
```

## Recommended decision rule

For production release:

- `report:tenant` must pass
- `ops:health` must pass
- `db:parity:compat` must pass

For audit:

- keep `db:parity` and `db:parity:core` reports as strict references
- do not force Render to match local legacy objects
- Render remains the production source of truth
