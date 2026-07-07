param(
  [switch]$RunBuild
)

$ErrorActionPreference = 'Stop'

function Write-Ok($Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Step($Message) {
  Write-Host "`n== $Message ==" -ForegroundColor Cyan
}

function Assert-File($Path) {
  if (!(Test-Path $Path)) {
    throw "Missing required file: $Path"
  }
  Write-Ok "Found $Path"
}

Write-Step "Phase 5 required files"
$requiredFiles = @(
  'services/backend/migrations/017_phase5_commercial_foundation.sql',
  'services/backend/src/services/commercial.service.js',
  'services/backend/src/services/adminAudit.service.js',
  'services/backend/src/controllers/billing.controller.js',
  'services/backend/src/routes/billing.routes.js',
  'services/backend/src/controllers/organizations.controller.js',
  'services/backend/src/routes/organizations.routes.js',
  'services/backend/scripts/phase5-commercial-report.mjs',
  'apps/admin/src/data/adminMockData.js',
  'scripts/phase5-verify.ps1'
)

foreach ($file in $requiredFiles) {
  Assert-File $file
}

Write-Step "Backend syntax checks"
$nodeFiles = @(
  'services/backend/migrations/run.js',
  'services/backend/src/server.js',
  'services/backend/src/services/commercial.service.js',
  'services/backend/src/services/adminAudit.service.js',
  'services/backend/src/services/user.service.js',
  'services/backend/src/controllers/admin.controller.js',
  'services/backend/src/controllers/billing.controller.js',
  'services/backend/src/controllers/devices.controller.js',
  'services/backend/src/controllers/organizations.controller.js',
  'services/backend/src/routes/admin.routes.js',
  'services/backend/src/routes/billing.routes.js',
  'services/backend/src/routes/organizations.routes.js',
  'services/backend/scripts/phase5-commercial-report.mjs'
)

foreach ($file in $nodeFiles) {
  node --check $file
  Write-Ok "node --check $file"
}

Write-Step "Phase 5 source markers"
$server = Get-Content 'services/backend/src/server.js' -Raw
if ($server -notmatch "/api/billing" -or $server -notmatch "/api/organizations" -or $server -notmatch "/api/sites" -or $server -notmatch "/api/device-groups") {
  throw 'server.js does not mount all Phase 5 routes'
}
Write-Ok 'Phase 5 API routes are mounted'

$migration = Get-Content 'services/backend/migrations/017_phase5_commercial_foundation.sql' -Raw
if ($migration -notmatch 'plan_definitions' -or $migration -notmatch 'user_subscriptions' -or $migration -notmatch 'organization_invitations') {
  throw 'Phase 5 migration does not include expected commercial tables'
}
Write-Ok 'Phase 5 migration includes commercial foundation tables'

if ($RunBuild) {
  Write-Step "Optional frontend builds"
  npm run dashboard:build
  npm run admin:build
}

Write-Step "Result"
Write-Ok 'Phase 5 verification completed'
