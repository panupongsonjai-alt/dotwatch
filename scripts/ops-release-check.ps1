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

function Convert-StepOutput {
  param(
    [AllowNull()]
    [object[]]$InputObjects
  )

  return @(
    $InputObjects |
      ForEach-Object {
        if ($null -ne $_) {
          if ($_ -is [System.Management.Automation.ErrorRecord]) {
            [string]$_.Exception.Message
          }
          else {
            [string]$_
          }
        }
      }
  )
}

function Invoke-Step {
  param(
    [string]$Name,
    [string]$Command,
    [bool]$Required = $true
  )

  Write-Host "`n== $Name ==" -ForegroundColor Cyan
  Write-Host $Command -ForegroundColor DarkGray

  $started = Get-Date
  $output = @()
  $exitCode = 1
  $previousErrorActionPreference = $ErrorActionPreference

  try {
    # Build tools may write non-fatal diagnostics to stderr. Windows PowerShell
    # represents redirected native stderr as ErrorRecord objects. Keep those
    # diagnostics in the report, but decide pass/fail only from the child
    # process exit code.
    $ErrorActionPreference = 'Continue'

    $wrappedCommand = @"
& {
  $Command
  if (`$null -eq `$LASTEXITCODE) {
    exit 0
  }

  exit [int]`$LASTEXITCODE
}
"@

    $output = @(
      & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -Command $wrappedCommand `
        2>&1
    )

    $exitCode = [int]$LASTEXITCODE
  }
  catch {
    $output += $_
    $exitCode = 1
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  $textOutput = Convert-StepOutput -InputObjects $output
  $durationMs = [math]::Round(((Get-Date) - $started).TotalMilliseconds)

  if ($textOutput) {
    $textOutput | ForEach-Object { Write-Host $_ }
  }

  $ok = ($exitCode -eq 0)
  $color = if ($ok) { 'Green' } elseif ($Required) { 'Red' } else { 'Yellow' }

  Write-Host (
    "Step {0}: exitCode={1} duration={2}ms" -f (
      $(if ($ok) { 'OK' } else { 'FAILED' }),
      $exitCode,
      $durationMs
    )
  ) -ForegroundColor $color

  [pscustomobject]@{
    name = $Name
    command = $Command
    required = $Required
    ok = $ok
    exitCode = $exitCode
    durationMs = $durationMs
    output = $textOutput
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
$steps += Invoke-Step -Name 'Dashboard style audit' -Command 'npm run audit:dashboard-style'
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
