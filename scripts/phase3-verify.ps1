param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$BackendUrl = 'https://dotwatch-backend.onrender.com',
  [string]$DashboardUrl = 'https://dotwatch.onrender.com',
  [int]$TimeoutSec = 20
)

$ErrorActionPreference = 'Stop'

function Write-Section($Message) { Write-Host "`n$Message" -ForegroundColor Cyan }
function Add-Issue([string]$Level, [string]$Area, [string]$Message) {
  $script:Issues += [pscustomobject]@{ Level = $Level; Area = $Area; Message = $Message }
}
function Test-FileExists([string]$RelativePath, [string]$Area) {
  $path = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { Add-Issue 'BLOCK' $Area "Missing file: $RelativePath" }
}
function Test-DirExists([string]$RelativePath, [string]$Area) {
  $path = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { Add-Issue 'BLOCK' $Area "Missing directory: $RelativePath" }
}
function Read-JsonFile([string]$RelativePath) {
  $path = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}
function Test-HttpUrl([string]$Name, [string]$Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
      Write-Host "[OK] $Name reachable: HTTP $($response.StatusCode)"
    } else {
      Add-Issue 'WARN' $Name "Unexpected HTTP status $($response.StatusCode): $Url"
    }
  } catch {
    Add-Issue 'WARN' $Name "Not reachable during check: $Url ($($_.Exception.Message))"
  }
}
function Get-RelativePathCompat([string]$BasePath, [string]$TargetPath) {
  $base = [System.IO.Path]::GetFullPath($BasePath).TrimEnd([char[]]@('\', '/'))
  $target = [System.IO.Path]::GetFullPath($TargetPath)
  if ($target.Length -le $base.Length) { return $target }
  return $target.Substring($base.Length + 1).Replace('\', '/')
}

$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd([char[]]@('\', '/'))
$script:Issues = @()

Write-Host 'dotWatch Phase 3 verify' -ForegroundColor Cyan
Write-Host "Root: $ProjectRoot"

Write-Section 'Required production files'
$requiredFiles = @(
  'package.json',
  'scripts/export-clean.ps1',
  'scripts/scan-sensitive-files.ps1',
  'scripts/phase2-verify.ps1',
  'services/backend/package.json',
  'apps/dashboard/package.json',
  'pi/agent/main.py'
)
foreach ($file in $requiredFiles) { Test-FileExists $file 'Required files' }
Test-DirExists 'services/backend' 'Backend'
Test-DirExists 'apps/dashboard' 'Dashboard'
Test-DirExists 'pi' 'Raspberry Pi'

Write-Section 'Root npm scripts'
$rootPkg = Read-JsonFile 'package.json'
if ($null -ne $rootPkg) {
  $scriptNames = @()
  if ($rootPkg.scripts) { $scriptNames = $rootPkg.scripts.PSObject.Properties.Name }
  foreach ($name in @('verify:phase2', 'export:clean', 'verify:phase3', 'check:render', 'check:pi')) {
    if ($scriptNames -notcontains $name) { Add-Issue 'WARN' 'package.json' "Missing recommended npm script: $name" }
  }
}

Write-Section 'Backend readiness'
$backendPkg = Read-JsonFile 'services/backend/package.json'
if ($null -ne $backendPkg) {
  $names = @()
  if ($backendPkg.scripts) { $names = $backendPkg.scripts.PSObject.Properties.Name }
  foreach ($name in @('start', 'migrate')) {
    if ($names -notcontains $name) { Add-Issue 'WARN' 'Backend package' "Missing recommended backend script: $name" }
  }
}

Write-Section 'Dashboard readiness'
$dashboardPkg = Read-JsonFile 'apps/dashboard/package.json'
if ($null -ne $dashboardPkg) {
  $names = @()
  if ($dashboardPkg.scripts) { $names = $dashboardPkg.scripts.PSObject.Properties.Name }
  foreach ($name in @('build', 'dev')) {
    if ($names -notcontains $name) { Add-Issue 'WARN' 'Dashboard package' "Missing recommended dashboard script: $name" }
  }
}

Write-Section 'Local secret hygiene'
$forbiddenEnvFiles = @(
  '.env',
  '.env.local',
  '.env.production',
  'apps/dashboard/.env',
  'apps/dashboard/.env.local',
  'apps/dashboard/.env.production',
  'services/backend/.env',
  'services/backend/.env.local',
  'services/backend/.env.production',
  'pi/agent/.env'
)
foreach ($relative in $forbiddenEnvFiles) {
  if (Test-Path -LiteralPath (Join-Path $ProjectRoot $relative)) {
    Add-Issue 'BLOCK' 'Secrets' "Real env file exists in project: $relative"
  }
}

Write-Section 'PowerShell compatibility'
$psFiles = Get-ChildItem -Path (Join-Path $ProjectRoot 'scripts') -Filter '*.ps1' -File -Recurse -Force -ErrorAction SilentlyContinue
foreach ($file in $psFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw
  if ($content -match '::GetRelativePath\s*\(') {
    Add-Issue 'BLOCK' 'PowerShell 5.1' "Uses unsupported GetRelativePath(): $(Get-RelativePathCompat $ProjectRoot $file.FullName)"
  }
}

Write-Section 'Network smoke checks'
Test-HttpUrl 'Backend health' ($BackendUrl.TrimEnd('/') + '/health')
Test-HttpUrl 'Dashboard' $DashboardUrl

Write-Section 'Sensitive scan'
$scanPath = Join-Path $ProjectRoot 'scripts/scan-sensitive-files.ps1'
if (Test-Path -LiteralPath $scanPath) {
  try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $scanPath
    if ($LASTEXITCODE -ne 0) { Add-Issue 'BLOCK' 'Sensitive scan' "scan-sensitive-files.ps1 returned exit code $LASTEXITCODE" }
  } catch {
    Add-Issue 'BLOCK' 'Sensitive scan' $_.Exception.Message
  }
} else {
  Add-Issue 'BLOCK' 'Sensitive scan' 'Missing scripts/scan-sensitive-files.ps1'
}

Write-Section 'Summary'
if ($Issues.Count -eq 0) {
  Write-Host 'Phase 3 readiness: OK' -ForegroundColor Green
  exit 0
}

$Issues | Format-Table -AutoSize
$blocking = @($Issues | Where-Object { $_.Level -eq 'BLOCK' })
if ($blocking.Count -gt 0) {
  Write-Host "Phase 3 readiness: FAILED ($($blocking.Count) blocking issue(s))" -ForegroundColor Red
  exit 1
}

Write-Host 'Phase 3 readiness: OK with warnings' -ForegroundColor Yellow
exit 0