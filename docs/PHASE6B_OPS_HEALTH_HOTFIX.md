# Phase 6B - Ops Health Cold Start Hotfix

This hotfix improves `scripts/ops-health-check.ps1` so Render cold starts do not incorrectly fail the whole ops check.

## Problem observed

A first request to Render may time out while the service wakes up, while the next requests pass:

```text
[FAIL] backend-live - The operation has timed out.
[OK] backend-ready status=200
[OK] backend-root-health status=200
```

This means the backend is healthy after waking, but the first health probe timed out.

## Changes

- Default timeout increased from 20 seconds to 35 seconds.
- Added retry support:
  - `-RetryCount` default: `2`
  - `-RetryDelaySec` default: `3`
- Each check result now includes `attempts`.
- The JSON report now records timeout/retry settings.

## Recommended command for Render

```powershell
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -AllowReady503
```

If Render is very slow to wake, use:

```powershell
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -AllowReady503 `
  -TimeoutSec 60 `
  -RetryCount 3 `
  -RetryDelaySec 5
```

After the backend is awake, the same command should normally complete quickly.
