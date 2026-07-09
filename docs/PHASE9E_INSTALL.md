# Install Phase 9E Core Compatibility Parity

1. Copy this patch over your dotWatch repo.
2. Run:

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase9e:compat-parity
```

3. Run compatibility parity:

```powershell
$env:Path = "C:\Program Files\Docker\Docker\resources\bin;" + $env:Path
npm run db:parity:compat -- `
  -LocalDatabaseUrl "$LocalDbUrl" `
  -RenderDatabaseUrl "$RenderDbUrl"
```
