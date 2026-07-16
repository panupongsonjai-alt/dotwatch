param(
  [string]$BackendUrl = "https://dotwatch-backend.onrender.com",
  [switch]$SkipRenderHealth,
  [switch]$SkipDashboardBuild,
  [switch]$SkipAdminBuild,
  [switch]$SkipEsp32Product,
  [switch]$SkipOtaChecks
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ReportRoot = Join-Path $RepoRoot "_reports\production-release-audit\$Timestamp"
New-Item -ItemType Directory -Path $ReportRoot -Force | Out-Null

$Summary = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param(
    [string]$Name,
    [string]$Status,
    [int]$ExitCode,
    [string]$LogFile
  )

  $Summary.Add([PSCustomObject]@{
    Check = $Name
    Status = $Status
    ExitCode = $ExitCode
    LogFile = $LogFile
  })
}

function Invoke-AuditCheck {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  $SafeName = ($Name -replace '[^a-zA-Z0-9._-]', '-').ToLowerInvariant()
  $LogFile = Join-Path $ReportRoot "$SafeName.log"

  Write-Host ""
  Write-Host "============================================================"
  Write-Host "CHECK: $Name"
  Write-Host "LOG  : $LogFile"
  Write-Host "============================================================"

  $ExitCode = 0
  $PreviousErrorActionPreference = $ErrorActionPreference

  try {
    # Native tools such as Vite may emit warnings on stderr while still
    # returning exit code 0. Keep those warnings in the log without turning
    # them into terminating PowerShell errors.
    $ErrorActionPreference = "Continue"
    $global:LASTEXITCODE = 0

    & $Command 2>&1 |
      Tee-Object -FilePath $LogFile

    if ($LASTEXITCODE -is [int]) {
      $ExitCode = [int]$LASTEXITCODE
    }

    if ($ExitCode -ne 0) {
      throw "Command exited with code $ExitCode"
    }

    Add-Result `
      -Name $Name `
      -Status "PASS" `
      -ExitCode 0 `
      -LogFile $LogFile

    Write-Host "PASS: $Name"
  }
  catch {
    if ($ExitCode -eq 0) {
      $ExitCode = 1
    }

    $_ |
      Out-String |
      Add-Content -LiteralPath $LogFile

    Add-Result `
      -Name $Name `
      -Status "FAIL" `
      -ExitCode $ExitCode `
      -LogFile $LogFile

    Write-Host "FAIL: $Name"
  }
  finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
}

Write-Host "dotWatch Production Release Audit"
Write-Host "Repository : $RepoRoot"
Write-Host "Backend URL: $BackendUrl"
Write-Host "Reports    : $ReportRoot"
Write-Host ""
Write-Host "Scope:"
Write-Host "- Excludes apps/mobile"
Write-Host "- Excludes local database tests"
Write-Host "- Does not provision irreversible ESP32 hardware security"
Write-Host "- Does not expose or print production secrets"

Invoke-AuditCheck "Git working tree" {
  $Status = git status --porcelain

  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  if ($Status) {
    Write-Host $Status
    throw "Working tree is not clean."
  }

  git status -sb
}

Invoke-AuditCheck "Secret scan" {
  npm run scan:secrets
}

Invoke-AuditCheck "Backend syntax checks" {
  npm run check:backend
}

if (-not $SkipDashboardBuild) {
  Invoke-AuditCheck "Dashboard build" {
    npm run check:dashboard
  }
}

if (-not $SkipAdminBuild) {
  Invoke-AuditCheck "Admin build" {
    npm run check:admin
  }
}

Invoke-AuditCheck "Phase 1" {
  npm run verify:phase1
}

Invoke-AuditCheck "Phase 2" {
  npm run verify:phase2
}

Invoke-AuditCheck "Phase 3" {
  npm run verify:phase3
}

Invoke-AuditCheck "Phase 4" {
  npm run verify:phase4
}

Invoke-AuditCheck "Phase 5" {
  npm run verify:phase5
}

Invoke-AuditCheck "Phase 6 operations" {
  npm run verify:phase6:ops
}

Invoke-AuditCheck "Phase 7 tenant" {
  npm run verify:phase7:tenant
}

Invoke-AuditCheck "Phase 7D database operations" {
  npm run verify:phase7d:dbops
}

Invoke-AuditCheck "Phase 8 release" {
  npm run verify:phase8:release
}

Invoke-AuditCheck "Phase 9 maintenance" {
  npm run verify:phase9:maintenance
}

Invoke-AuditCheck "Phase 9C core parity" {
  npm run verify:phase9c:core-parity
}

Invoke-AuditCheck "Phase 9D core parity" {
  npm run verify:phase9d:core-parity
}

Invoke-AuditCheck "Phase 9E compatibility parity" {
  npm run verify:phase9e:compat-parity
}

Invoke-AuditCheck "Phase 9F nullability" {
  npm run verify:phase9f:nullability
}

Invoke-AuditCheck "Phase 10E dashboard auth" {
  npm run verify:phase10e:dashboard-auth
}

Invoke-AuditCheck "Phase 11D admin sidebar" {
  npm run verify:phase11d:admin-sidebar
}

Invoke-AuditCheck "Phase 11G parity" {
  npm run verify:phase11g:admin-dashboard-parity
}

Invoke-AuditCheck "Phase 11H dashboard sidebar" {
  npm run verify:phase11h:dashboard-sidebar-vertical
}

Invoke-AuditCheck "Phase 11I admin comfort" {
  npm run verify:phase11i:admin-dashboard-comfort
}

Invoke-AuditCheck "Phase 11J dashboard spacing" {
  npm run verify:phase11j:dashboard-sidebar-spacing
}

if (-not $SkipEsp32Product) {
  Invoke-AuditCheck "ESP32 product software" {
    npm run verify:esp32:product
  }
}

Invoke-AuditCheck "Security Phase S1" {
  npm run verify:phase-s1:security
}

Invoke-AuditCheck "Security Phase S1 production env" {
  npm run test:phase-s1:prod-env
}

Invoke-AuditCheck "Security Phase S2" {
  npm run test:phase-s2
}

Invoke-AuditCheck "Security Phase S3 software" {
  npm run test:phase-s3:software
}

if (-not $SkipOtaChecks) {
  Invoke-AuditCheck "OTA server" {
    npm --prefix services/ota-server run check
  }
}

if (-not $SkipRenderHealth) {
  Invoke-AuditCheck "Render backend health" {
    npm run ops:health -- `
      -BackendUrl $BackendUrl `
      -AllowReady503
  }
}

$SummaryCsv = Join-Path $ReportRoot "summary.csv"
$SummaryJson = Join-Path $ReportRoot "summary.json"
$SummaryText = Join-Path $ReportRoot "summary.txt"

$Summary |
  Export-Csv `
    -LiteralPath $SummaryCsv `
    -NoTypeInformation `
    -Encoding UTF8

$Summary |
  ConvertTo-Json -Depth 4 |
  Set-Content `
    -LiteralPath $SummaryJson `
    -Encoding UTF8

$PassCount = @($Summary | Where-Object Status -eq "PASS").Count
$FailCount = @($Summary | Where-Object Status -eq "FAIL").Count
$TotalCount = $Summary.Count

@(
  "dotWatch Production Release Audit"
  "Timestamp: $Timestamp"
  "Total: $TotalCount"
  "Passed: $PassCount"
  "Failed: $FailCount"
  ""
  ($Summary | Format-Table -AutoSize | Out-String)
) |
  Set-Content `
    -LiteralPath $SummaryText `
    -Encoding UTF8

Write-Host ""
Write-Host "============================================================"
Write-Host "AUDIT SUMMARY"
Write-Host "============================================================"
$Summary | Format-Table -AutoSize
Write-Host "Total : $TotalCount"
Write-Host "Passed: $PassCount"
Write-Host "Failed: $FailCount"
Write-Host "Report: $SummaryText"

if ($FailCount -gt 0) {
  exit 1
}

exit 0
