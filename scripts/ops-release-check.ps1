param(
  [switch]$SkipBuild,
  [switch]$SkipDatabase,
  [switch]$SkipDevice,
  [switch]$NoReport
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$reportDir = Join-Path $repoRoot '_reports\ops'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Invoke-Step {
  param(
    [string]$Name,
    [string]$Command,
    [bool]$Required = $true
  )

  Write-Host "`n== $Name ==" -ForegroundColor Cyan
  Write-Host $Command -ForegroundColor DarkGray

  $started = Get-Date
  $output = & powershell -NoProfile -ExecutionPolicy Bypass -Command $Command 2>&1
  $exitCode = $LASTEXITCODE
  $durationMs = [math]::Round(((Get-Date) - $started).TotalMilliseconds)

  if ($output) { $output | ForEach-Object { Write-Host $_ } }

  $ok = ($exitCode -eq 0)
  $color = if ($ok) { 'Green' } elseif ($Required) { 'Red' } else { 'Yellow' }
  Write-Host ("Step {0}: exitCode={1} duration={2}ms" -f ($(if ($ok) { 'OK' } else { 'FAILED' }), $exitCode, $durationMs)) -ForegroundColor $color

  [pscustomobject]@{
    name = $Name
    command = $Command
    required = $Required
    ok = $ok
    exitCode = $exitCode
    durationMs = $durationMs
    output = @($output | ForEach-Object { [string]$_ })
  }
}

$steps = @()
$steps += Invoke-Step -Name 'Phase 2 security static verify' -Command 'npm run verify:phase2:security'
if (-not $SkipDatabase) {
  $steps += Invoke-Step -Name 'Phase 3 database static verify' -Command 'npm run verify:phase3:db'
}
if (-not $SkipDevice) {
  $steps += Invoke-Step -Name 'Phase 4 device static verify' -Command 'npm run verify:phase4:device'
}
$steps += Invoke-Step -Name 'Phase 5 UX static verify' -Command 'npm run verify:phase5:ux'
$steps += Invoke-Step -Name 'Phase 6 ops static verify' -Command 'npm run verify:phase6:ops'
$steps += Invoke-Step -Name 'Secret scan' -Command 'npm run scan:secrets'
$steps += Invoke-Step -Name 'Backend syntax' -Command 'npm run check:backend'

if (-not $SkipBuild) {
  $steps += Invoke-Step -Name 'Dashboard build' -Command 'npm run dashboard:build'
  $steps += Invoke-Step -Name 'Admin build' -Command 'npm run admin:build'
}

$failedRequired = @($steps | Where-Object { $_.required -and -not $_.ok })
$summary = [pscustomobject]@{
  ok = ($failedRequired.Count -eq 0)
  timestamp = (Get-Date).ToUniversalTime().ToString('o')
  failedRequiredCount = $failedRequired.Count
  skipBuild = [bool]$SkipBuild
  skipDatabase = [bool]$SkipDatabase
  skipDevice = [bool]$SkipDevice
  steps = $steps
}

if (-not $NoReport) {
  New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
  $reportPath = Join-Path $reportDir "ops-release-check-$timestamp.json"
  $summary | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -Path $reportPath
  Write-Host "`nReport: $reportPath" -ForegroundColor Cyan
}

if ($summary.ok) {
  Write-Host "`nRelease check: OK" -ForegroundColor Green
  exit 0
}

Write-Host "`nRelease check: FAILED" -ForegroundColor Red
exit 1
