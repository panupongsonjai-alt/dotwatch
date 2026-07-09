param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$SkipNodeCheck
)

$ErrorActionPreference = 'Stop'
$script:Issues = @()

function Write-Section([string]$Message) {
  Write-Host "`n============================================================" -ForegroundColor DarkCyan
  Write-Host $Message -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkCyan
}

function Add-Issue([string]$Level, [string]$Area, [string]$Message) {
  $script:Issues += [pscustomobject]@{ Level = $Level; Area = $Area; Message = $Message }
}

function Test-FileExists([string]$RelativePath, [string]$Area) {
  $path = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) {
    Add-Issue 'BLOCK' $Area "Missing file: $RelativePath"
  }
}

function Read-Text([string]$RelativePath) {
  $path = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { return '' }
  return Get-Content -LiteralPath $path -Raw
}

function Read-JsonFile([string]$RelativePath) {
  $path = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}

$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd([char[]]@('\', '/'))

Write-Host 'dotWatch Phase 3 Database Reliability verify' -ForegroundColor Cyan
Write-Host "Root: $ProjectRoot"

Write-Section 'Required Phase 3 files'
$required = @(
  'services/backend/migrations/run.js',
  'services/backend/scripts/db-preflight.mjs',
  'services/backend/scripts/db-health-check.mjs',
  'services/backend/db/maintenance/db_health_report.sql',
  'scripts/db-backup.ps1',
  'scripts/db-restore.ps1',
  'docs/PHASE3_DATABASE_RELIABILITY.md'
)
foreach ($file in $required) { Test-FileExists $file 'Required files' }

Write-Section 'Migration safety checks'
$runner = Read-Text 'services/backend/migrations/run.js'
if ($runner -notmatch 'pg_try_advisory_lock') {
  Add-Issue 'BLOCK' 'Migration runner' 'Missing advisory lock protection.'
}
if ($runner -notmatch 'assertSafeDatabaseTarget') {
  Add-Issue 'BLOCK' 'Migration runner' 'Missing database target safety check.'
}
if ($runner -notmatch 'DROP VIEW public\.device_metric_latest') {
  Add-Issue 'BLOCK' 'Migration runner' 'Missing repair path for device_metric_latest view -> table.'
}
if ($runner -notmatch 'DOTWATCH_ALLOW_NON_DOTWATCH_DB') {
  Add-Issue 'WARN' 'Migration runner' 'Missing explicit override for non-dotwatch database names.'
}

Write-Section 'Backend npm scripts'
$backendPkg = Read-JsonFile 'services/backend/package.json'
if ($null -ne $backendPkg) {
  $names = @()
  if ($backendPkg.scripts) { $names = $backendPkg.scripts.PSObject.Properties.Name }
  foreach ($name in @('db:preflight', 'db:health', 'db:repair-latest')) {
    if ($names -notcontains $name) { Add-Issue 'BLOCK' 'Backend package' "Missing script: $name" }
  }
}

$rootPkg = Read-JsonFile 'package.json'
if ($null -ne $rootPkg) {
  $names = @()
  if ($rootPkg.scripts) { $names = $rootPkg.scripts.PSObject.Properties.Name }
  foreach ($name in @('db:preflight', 'db:health', 'db:backup', 'db:restore', 'verify:phase3:db')) {
    if ($names -notcontains $name) { Add-Issue 'BLOCK' 'Root package' "Missing script: $name" }
  }
}

Write-Section 'Backup/export hygiene'
$gitignore = Read-Text '.gitignore'
if ($gitignore -notmatch '_backups/') {
  Add-Issue 'BLOCK' '.gitignore' 'Missing _backups/ ignore rule.'
}
$exportClean = Read-Text 'scripts/export-clean.ps1'
if ($exportClean -notmatch "'_backups'") {
  Add-Issue 'BLOCK' 'export-clean' 'Clean export does not exclude _backups.'
}

Write-Section 'Syntax checks'
if (-not $SkipNodeCheck) {
  $nodeFiles = @(
    'services/backend/migrations/run.js',
    'services/backend/scripts/db-preflight.mjs',
    'services/backend/scripts/db-health-check.mjs',
    'services/backend/src/db/pool.js'
  )
  foreach ($relative in $nodeFiles) {
    $full = Join-Path $ProjectRoot $relative
    if (Test-Path -LiteralPath $full) {
      & node --check $full
      if ($LASTEXITCODE -ne 0) {
        Add-Issue 'BLOCK' 'Node syntax' "node --check failed: $relative"
      }
    }
  }
}

Write-Section 'Summary'
if ($Issues.Count -eq 0) {
  Write-Host 'Phase 3 database reliability verify: OK' -ForegroundColor Green
  exit 0
}

$Issues | Format-Table -AutoSize
$blocking = @($Issues | Where-Object { $_.Level -eq 'BLOCK' })
if ($blocking.Count -gt 0) {
  Write-Host "Phase 3 database reliability verify: FAILED ($($blocking.Count) blocking issue(s))" -ForegroundColor Red
  exit 1
}

Write-Host 'Phase 3 database reliability verify: OK with warnings' -ForegroundColor Yellow
exit 0
