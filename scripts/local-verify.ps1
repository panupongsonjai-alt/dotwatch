<#
.SYNOPSIS
  One-command local verification for dotWatch (Windows PowerShell 5.1 or PowerShell 7).

.DESCRIPTION
  1. Checks Node/npm/Docker
  2. Installs dependencies for apps that have no node_modules
  3. Creates services/backend/.env from the example if missing (local DB only)
  4. Starts the Docker database and waits until it is healthy
  5. Runs migrations
  6. Static checks: backend syntax, dashboard/admin build, mobile typecheck,
     Pi agent compile, existing phase/security verify scripts
  7. Starts a temporary backend on port 4100 (dev auth bypass) and runs the
     end-to-end smoke test (ingest under load, alarms, history, settings,
     secret reset), plus dry runs of the index and retention maintenance scripts
  8. Prints a PASS/FAIL summary and saves it under _reports/

  It never touches a non-local database: it stops if DATABASE_URL is not local.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-verify.ps1
  npm run verify:local
  npm run verify:local -- -SkipMobile -SkipInstall
#>
param(
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$SkipMobile,
  [switch]$SkipDocker,
  [int]$BackendPort = 4100
)

$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

$results = New-Object System.Collections.Generic.List[object]
$reportDir = Join-Path $root '_reports'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logDir = Join-Path $reportDir "local-verify-$timestamp"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Add-Result([string]$Name, [bool]$Ok, [string]$Detail = '') {
  $results.Add([pscustomobject]@{ Check = $Name; Result = $(if ($Ok) { 'PASS' } else { 'FAIL' }); Detail = $Detail })
  $color = if ($Ok) { 'Green' } else { 'Red' }
  Write-Host ("[{0}] {1} {2}" -f $(if ($Ok) { 'PASS' } else { 'FAIL' }), $Name, $Detail) -ForegroundColor $color
}

$onWindows = ($PSVersionTable.PSEdition -eq 'Desktop') -or $IsWindows

function Invoke-Native([string]$Command) {
  if ($onWindows) { cmd /c "$Command 2>&1" } else { bash -c "$Command 2>&1" }
}

function Invoke-Step([string]$Name, [string]$Command, [string]$WorkingDirectory = $root) {
  $safeName = ($Name -replace '[^A-Za-z0-9]+', '-').Trim('-').ToLower()
  $logFile = Join-Path $logDir "$safeName.log"
  Write-Host "`n>> $Name" -ForegroundColor Cyan
  Push-Location $WorkingDirectory
  try {
    $output = Invoke-Native $Command
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $output | Out-File -FilePath $logFile -Encoding utf8
  Add-Result $Name ($exitCode -eq 0) $(if ($exitCode -eq 0) { '' } else { "exit $exitCode, see $logFile" })
  return ($exitCode -eq 0)
}

function Test-Command([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Host "dotWatch local verification ($timestamp)" -ForegroundColor Cyan
Write-Host "Project: $root"

# 1. Tools ---------------------------------------------------------------
$nodeVersion = if (Test-Command 'node') { (node -v) } else { '' }
Add-Result 'Node.js installed' ([bool]$nodeVersion) $nodeVersion
if (-not $nodeVersion) { Write-Host 'Install Node.js 22 LTS first.' -ForegroundColor Red; exit 1 }
$major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
Add-Result 'Node.js version >= 20' ($major -ge 20) $nodeVersion

if (-not $SkipDocker) {
  Add-Result 'Docker available' (Test-Command 'docker') ''
}

# 2. Dependencies ---------------------------------------------------------
$apps = @('services/backend', 'apps/dashboard', 'apps/admin')
if (-not $SkipMobile) { $apps += 'apps/mobile' }

if (-not $SkipInstall) {
  foreach ($app in $apps) {
    # npm writes node_modules/.package-lock.json only after a complete install,
    # so a partial/copied node_modules (e.g. missing .bin shims) is reinstalled.
    if (Test-Path (Join-Path $root "$app/node_modules/.package-lock.json")) {
      Write-Host "skip install: $app (node_modules exists)" -ForegroundColor DarkGray
      continue
    }
    $extra = if ($app -eq 'apps/mobile') { ' --ignore-scripts' } else { '' }
    [void](Invoke-Step "npm ci $app" "npm ci --no-audit --no-fund$extra" (Join-Path $root $app))
  }
}

# 3. Backend .env (local only) -------------------------------------------
$envFile = Join-Path $root 'services/backend/.env'
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $root 'services/backend/.env.example') $envFile
  Write-Host 'Created services/backend/.env from .env.example' -ForegroundColor Yellow
}
$databaseLine = Select-String -Path $envFile -Pattern '^\s*DATABASE_URL\s*=' | Select-Object -First 1
$databaseUrl = if ($databaseLine) { ($databaseLine.Line -split '=', 2)[1].Trim().Trim('"').Trim("'") } else { '' }
$isLocalDb = $databaseUrl -match '@(localhost|127\.0\.0\.1|\[::1\]|db)(:\d+)?/'
Add-Result 'DATABASE_URL points to local database' $isLocalDb ($databaseUrl -replace '//[^@]*@', '//***@')
if (-not $isLocalDb) {
  Write-Host 'Stopping: this script only runs against the local Docker database.' -ForegroundColor Red
  exit 1
}

# Device creation fails with "Missing DEVICE_SECRET_ENCRYPTION_KEY" when the
# key is empty (the example file leaves it blank). Generate a local key once.
$envLines = [System.IO.File]::ReadAllLines($envFile)
$keyIndex = -1
for ($i = 0; $i -lt $envLines.Length; $i++) {
  if ($envLines[$i] -match '^\s*DEVICE_SECRET_ENCRYPTION_KEY\s*=') { $keyIndex = $i; break }
}
$keyValue = if ($keyIndex -ge 0) { ($envLines[$keyIndex] -split '=', 2)[1].Trim().Trim('"').Trim("'") } else { '' }
if (-not $keyValue) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $newLine = 'DEVICE_SECRET_ENCRYPTION_KEY=' + [Convert]::ToBase64String($bytes)
  if ($keyIndex -ge 0) { $envLines[$keyIndex] = $newLine } else { $envLines += $newLine }
  [System.IO.File]::WriteAllLines($envFile, $envLines, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'Generated a local DEVICE_SECRET_ENCRYPTION_KEY in services/backend/.env' -ForegroundColor Yellow
}
Add-Result 'DEVICE_SECRET_ENCRYPTION_KEY set (local)' $true ''

# 4. Database --------------------------------------------------------------
if (-not $SkipDocker) {
  [void](Invoke-Step 'docker compose up db' 'docker compose up -d db')
  $healthy = $false
  for ($i = 0; $i -lt 40; $i++) {
    $state = (docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' dotwatch-db 2>$null)
    if ($state -eq 'healthy' -or $state -eq 'running') { $healthy = $true; break }
    Start-Sleep -Seconds 3
  }
  Add-Result 'Database container ready' $healthy $state
}

# 5. Migrations -------------------------------------------------------------
$migrationsOk = Invoke-Step 'migrations' 'npm run migrate' (Join-Path $root 'services/backend')

# 6. Static checks ------------------------------------------------------------
[void](Invoke-Step 'backend syntax' 'npm run check:syntax' (Join-Path $root 'services/backend'))
if (-not $SkipBuild) {
  $env:VITE_API_URL = if ($env:VITE_API_URL) { $env:VITE_API_URL } else { 'http://localhost:4000' }
  [void](Invoke-Step 'dashboard build' 'npm run build' (Join-Path $root 'apps/dashboard'))
  [void](Invoke-Step 'admin build' 'npm run build' (Join-Path $root 'apps/admin'))
}
if (-not $SkipMobile) {
  [void](Invoke-Step 'mobile typecheck' 'npm run typecheck' (Join-Path $root 'apps/mobile'))
}
$python = if (Test-Command 'python') { 'python' } elseif (Test-Command 'py') { 'py' } else { '' }
if ($python) {
  [void](Invoke-Step 'pi agent compile' "$python -m compileall -q pi/agent")
} else {
  Add-Result 'pi agent compile' $true 'skipped (python not found)'
}

$verifyScripts = @(Get-ChildItem (Join-Path $root 'scripts') -Filter '*.mjs' |
  Where-Object { $_.Name -match '^(verify-phase-|test-phase-|phase.*-verify)' } |
  Sort-Object Name)
$failedVerify = @()
foreach ($script in $verifyScripts) {
  $null = Invoke-Native "node `"$($script.FullName)`""
  if ($LASTEXITCODE -ne 0) { $failedVerify += $script.Name }
}
Add-Result "existing verify scripts ($($verifyScripts.Count))" ($failedVerify.Count -eq 0) ($failedVerify -join ', ')

# 7. Temporary backend + smoke test ----------------------------------------
$backendDir = Join-Path $root 'services/backend'
$backendLog = Join-Path $logDir 'backend.log'
$backendErr = Join-Path $logDir 'backend.err.log'
$saved = @{}
$overrides = @{
  PORT = "$BackendPort"
  NODE_ENV = 'development'
  DEV_AUTH_BYPASS = 'true'
  INGEST_MIN_INTERVAL_SECONDS = '0'
  API_RATE_LIMIT_PER_MINUTE = '100000'
  INGEST_DEVICE_RATE_LIMIT_PER_MINUTE = '10000'
  WEATHER_SCHEDULER_ENABLED = 'false'
}
foreach ($key in $overrides.Keys) {
  $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
  [Environment]::SetEnvironmentVariable($key, $overrides[$key], 'Process')
}

$backend = $null
if (-not $migrationsOk) {
  Add-Result 'end-to-end tests' $false 'skipped because migrations failed (see migrations log)'
}
try {
  if (-not $migrationsOk) { throw 'skip' }

  $startArgs = @{
    FilePath = 'node'
    ArgumentList = 'src/server.js'
    WorkingDirectory = $backendDir
    RedirectStandardOutput = $backendLog
    RedirectStandardError = $backendErr
    PassThru = $true
  }
  if ($onWindows) { $startArgs.WindowStyle = 'Hidden' }
  $backend = Start-Process @startArgs

  $up = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
      $live = Invoke-RestMethod -Uri "http://localhost:$BackendPort/health/live" -TimeoutSec 3
      if ($live.ok) { $up = $true; break }
    } catch { }
  }
  Add-Result "temporary backend on port $BackendPort" $up $(if ($up) { '' } else { "see $backendLog" })

  if ($up) {
    $env:SMOKE_API_URL = "http://localhost:$BackendPort"
    [void](Invoke-Step 'end-to-end smoke test' 'node scripts/local-smoke-test.mjs' $backendDir)
    [void](Invoke-Step 'index dedupe (dry run)' 'node scripts/db-dedupe-indexes.mjs' $backendDir)
    [void](Invoke-Step 'retention (dry run)' 'node scripts/db-retention.mjs' $backendDir)
    Get-Content (Join-Path $logDir 'end-to-end-smoke-test.log') -ErrorAction SilentlyContinue |
      Where-Object { $_ -match '^(PASS|FAIL)' } | ForEach-Object { Write-Host "   $_" }
  }
} catch {
  if ("$_" -ne 'skip') { Add-Result 'end-to-end tests' $false "$_" }
} finally {
  if ($backend -and -not $backend.HasExited) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue }
  foreach ($key in $overrides.Keys) {
    [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process')
  }
  Remove-Item Env:SMOKE_API_URL -ErrorAction SilentlyContinue
}

# 8. Summary ------------------------------------------------------------------
$failed = @($results | Where-Object { $_.Result -eq 'FAIL' })
$summaryFile = Join-Path $logDir 'summary.txt'
$results | Format-Table -AutoSize | Out-String -Width 200 | Tee-Object -FilePath $summaryFile
Write-Host ("Summary: {0} passed, {1} failed. Logs: {2}" -f ($results.Count - $failed.Count), $failed.Count, $logDir) `
  -ForegroundColor $(if ($failed.Count -eq 0) { 'Green' } else { 'Red' })

if ($failed.Count -gt 0) { exit 1 }
exit 0
