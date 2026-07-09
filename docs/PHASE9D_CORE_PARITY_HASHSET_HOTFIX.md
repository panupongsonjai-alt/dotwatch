# Phase 9D - Core Parity HashSet Hotfix

## Purpose

Fixes the Phase 9C `db:parity:core` PowerShell error:

```text
New-Object : Cannot find an overload for "HashSet`1" and the argument count: "239".
```

## Cause

Windows PowerShell expands arrays passed to `New-Object -ArgumentList`. The Phase 9C script passed the full schema result array directly to the `HashSet[string]` constructor. When the schema contained hundreds of entries, PowerShell treated those entries as hundreds of constructor arguments.

## Fix

The script now creates an empty `HashSet[string]` and adds schema entries one-by-one.

Affected file:

```text
scripts/phase9-core-parity-check.ps1
```

New verify command:

```powershell
npm run verify:phase9d:core-parity
```

## After installing

Run:

```powershell
cd "D:\IoT Project\dotwatch"
$env:Path = "C:\Program Files\Docker\Docker\resources\bin;" + $env:Path
npm run verify:phase9d:core-parity
npm run db:parity:core -- `
  -LocalDatabaseUrl "$LocalDbUrl" `
  -RenderDatabaseUrl "$RenderDbUrl"
```

Expected outcome: the `HashSet` constructor error should be gone. The resulting parity may be `OK`, `DIFFERENT`, or `WARN` depending on real schema differences.
