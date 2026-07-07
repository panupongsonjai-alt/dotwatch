$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Step "Checking backend JavaScript syntax"
node --check services/backend/src/controllers/ingest.controller.js
node --check services/backend/src/controllers/devices.controller.js
node --check services/backend/src/config/env.js
node --check services/backend/migrations/run.js
node --check services/backend/scripts/phase4-performance-report.mjs

Write-Step "Checking Phase 4 files"
$RequiredFiles = @(
  "services/backend/migrations/016_phase4_data_scale_performance.sql",
  "services/backend/scripts/phase4-performance-report.mjs",
  "scripts/backend-ingest-batch-test.ps1",
  "docs/PHASE_4_DATA_SCALE_PERFORMANCE.md",
  "README_PHASE4_START_HERE.md"
)

foreach ($File in $RequiredFiles) {
  if (-not (Test-Path $File)) {
    throw "Missing required Phase 4 file: $File"
  }
  Write-Host "OK $File" -ForegroundColor Green
}

Write-Step "Checking expected backend changes"
$Ingest = Get-Content "services/backend/src/controllers/ingest.controller.js" -Raw
$Devices = Get-Content "services/backend/src/controllers/devices.controller.js" -Raw
$Migration = Get-Content "services/backend/migrations/run.js" -Raw

if ($Ingest -notmatch "ingestBatch") { throw "ingestBatch endpoint handler is missing" }
if ($Ingest -notmatch "device_metric_latest") { throw "latest metric upsert is missing" }
if ($Devices -notmatch "x-dotwatch-history-source") { throw "history source header is missing" }
if ($Devices -notmatch "device_metric_readings_1m") { throw "continuous aggregate history query is missing" }
if ($Migration -notmatch "createMetricLatestTable") { throw "migration latest table creation is missing" }

Write-Host "`nPhase 4 verification passed." -ForegroundColor Green
