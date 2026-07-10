dotWatch CORS Local -> Render fix v2

IMPORTANT
This ZIP has no extra outer folder. Extract its contents directly into:
D:\IoT Project\dotwatch

After extraction, verify with:
powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-cors-local-render-fix.ps1 -RepoRoot "D:\IoT Project\dotwatch"

Render environment variables:
ALLOW_LOCAL_CORS_IN_PRODUCTION=true
CORS_ORIGIN=https://<dashboard-domain>,https://<admin-domain>,http://localhost:5173,http://127.0.0.1:5173
DEV_AUTH_BYPASS=false
NODE_ENV=production
