param(
  [string]$BackendUrl = 'https://dotwatch-backend.onrender.com',
  [string]$DashboardUrl = '',
  [string]$AdminUrl = '',
  [string]$PostgresDockerImage = 'postgres:18-alpine',
  [switch]$SkipBackup,
  [switch]$SkipMigrate,
  [switch]$SkipTenantReport,
  [switch]$SkipHealth,
  [switch]$SkipBuild,
  [switch]$SkipSecretScan,
  [switch]$NoReport
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportDir = Join-Path $repoRoot '_reports\phase8-release'

function Write-Section([string]$Message) {
  Write-Host "`n============================================================" -ForegroundColor DarkCyan
  Write-Host $Message -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkCyan
}

function Invoke-ReleaseStep {
  param(
    [string]$Name,
    [string]$Command,
    [bool]$Required = $true
  )

  Write-Host "`n== $Name ==" -ForegroundColor Cyan
  Write-Host $Command -ForegroundColor DarkGray

  $started = Get-Date
  $output = & powershell -NoProfile -ExecutionPolicy Bypass -Command $Command 2>&1
  $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
  $durationMs = [math]::Round(((Get-Date) - $started).TotalMilliseconds)
  if ($output) { $output | ForEach-Object { Write-Host $_ } }

  $ok = $exitCode -eq 0
  $color = if ($ok) { 'Green' } elseif ($Required) { 'Red' } else { 'Yellow' }
  Write-Host ("Step {0}: exitCode={1} duration={2}ms" -f ($(if ($ok) { 'OK' } else { 'FAILED' }), $exitCode, $durationMs)) -ForegroundColor $color

  return [pscustomobject]@{
    name = $Name
    command = $Command
    required = $Required
    ok = $ok
    exitCode = $exitCode
    durationMs = $durationMs
    output = @($output | ForEach-Object { [string]$_ })
  }
}

function Protect-DatabaseUrlForReport([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  try {
    $uri = [System.Uri]$Value
    $auth = if ($uri.UserInfo) { '***:***@' } else { '' }
    $port = if ($uri.IsDefaultPort) { '' } else { ":$($uri.Port)" }
    $query = if ($uri.Query) { '?***' } else { '' }
    return "$($uri.Scheme)://$auth$($uri.Host)$port$($uri.AbsolutePath)$query"
  } catch {
    return '***invalid DATABASE_URL***'
  }
}

Set-Location $repoRoot
Write-Section 'dotWatch Phase 8 Render release'
Write-Host "RepoRoot           : $repoRoot"
Write-Host "BackendUrl         : $BackendUrl"
Write-Host "DashboardUrl       : $(if ($DashboardUrl) { $DashboardUrl } else { '(skipped)' })"
Write-Host "AdminUrl           : $(if ($AdminUrl) { $AdminUrl } else { '(skipped)' })"
Write-Host "PostgresDockerImage: $PostgresDockerImage"
Write-Host "DATABASE_URL       : $(Protect-DatabaseUrlForReport $env:DATABASE_URL)"

$steps = @()
$steps += Invoke-ReleaseStep -Name 'Phase 8 static verify' -Command 'npm run verify:phase8:release'
$steps += Invoke-ReleaseStep -Name 'Render DB env check' -Command 'npm run db:env:check -- -RequireDockerOrPgDump -RequireRender'

if (-not $SkipSecretScan) {
  $steps += Invoke-ReleaseStep -Name 'Secret scan' -Command 'npm run scan:secrets'
}

if (-not $SkipBuild) {
  $steps += Invoke-ReleaseStep -Name 'Backend syntax check' -Command 'npm run check:backend'
  $steps += Invoke-ReleaseStep -Name 'Dashboard build' -Command 'npm run dashboard:build'
  $steps += Invoke-ReleaseStep -Name 'Admin build' -Command 'npm run admin:build'
}

if (-not $SkipBackup) {
  $steps += Invoke-ReleaseStep -Name 'Render database backup' -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/db-backup.ps1 -DockerImage '$PostgresDockerImage'"
} else {
  Write-Host "`nSkipping backup by request. Use this only when a verified backup already exists." -ForegroundColor Yellow
}

if (-not $SkipMigrate) {
  $steps += Invoke-ReleaseStep -Name 'Render migration' -Command 'npm run backend:migrate'
}

if (-not $SkipTenantReport) {
  $steps += Invoke-ReleaseStep -Name 'Tenant report' -Command 'npm run report:tenant'
}

if (-not $SkipHealth) {
  $healthCommand = "npm run ops:health -- -BackendUrl '$BackendUrl' -AllowReady503"
  if (-not [string]::IsNullOrWhiteSpace($DashboardUrl)) { $healthCommand += " -DashboardUrl '$DashboardUrl'" }
  if (-not [string]::IsNullOrWhiteSpace($AdminUrl)) { $healthCommand += " -AdminUrl '$AdminUrl'" }
  $steps += Invoke-ReleaseStep -Name 'Post-release health check' -Command $healthCommand
}

$failedRequired = @($steps | Where-Object { $_.required -and -not $_.ok })
$summary = [pscustomobject]@{
  ok = ($failedRequired.Count -eq 0)
  timestamp = (Get-Date).ToUniversalTime().ToString('o')
  repoRoot = $repoRoot
  backendUrl = $BackendUrl
  dashboardUrl = $DashboardUrl
  adminUrl = $AdminUrl
  postgresDockerImage = $PostgresDockerImage
  databaseUrl = Protect-DatabaseUrlForReport $env:DATABASE_URL
  failedRequiredCount = $failedRequired.Count
  skipped = [pscustomobject]@{
    backup = [bool]$SkipBackup
    migrate = [bool]$SkipMigrate
    tenantReport = [bool]$SkipTenantReport
    health = [bool]$SkipHealth
    build = [bool]$SkipBuild
    secretScan = [bool]$SkipSecretScan
  }
  steps = $steps
}

if (-not $NoReport) {
  New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
  $reportPath = Join-Path $reportDir "phase8-render-release-$timestamp.json"
  $summary | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -Path $reportPath
  Write-Host "`nReport: $reportPath" -ForegroundColor Cyan
}

if ($summary.ok) {
  Write-Host "`nPhase 8 Render release: OK" -ForegroundColor Green
  exit 0
}

Write-Host "`nPhase 8 Render release: FAILED" -ForegroundColor Red
exit 1
