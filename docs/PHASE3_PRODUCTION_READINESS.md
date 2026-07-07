# dotWatch Phase 3 Production Readiness

Phase 3 focuses on making dotWatch easier to operate after Phase 2 verification passes.

## Added commands

```powershell
npm run verify:phase3
npm run check:render
npm run check:pi
```

## What Phase 3 checks

- Required backend, dashboard, Raspberry Pi, and script files exist.
- Root `package.json` has operational scripts.
- Backend package has `start` and `migrate` scripts.
- Dashboard package has `dev` and `build` scripts.
- No real `.env` files are inside the project folder.
- PowerShell scripts do not use `.NET` APIs that break on Windows PowerShell 5.1.
- Backend `/health` and dashboard URL are reachable.
- Existing sensitive-file scan still passes.

## Render check

```powershell
npm run check:render
```

Optional custom URLs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/render-health-check.ps1 `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -DashboardUrl "https://dotwatch.onrender.com"
```

## Raspberry Pi check

```powershell
npm run check:pi
```

Optional custom target:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pi-agent-health-check.ps1 `
  -PiHost "192.168.1.154" `
  -PiUser "pi" `
  -RemoteDir "/home/pi/dotwatch-pi-agent"
```

The Pi checker masks secret-like values and only prints non-secret config keys.

## Recommended Phase 3 workflow

1. Run Phase 2 check.
2. Run Phase 3 check.
3. Check Render health.
4. Check Raspberry Pi agent health.
5. Export a clean zip.

```powershell
npm run verify:phase2
npm run verify:phase3
npm run check:render
npm run check:pi
npm run export:clean
```