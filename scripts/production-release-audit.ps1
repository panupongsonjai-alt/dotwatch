param(
  [string]$BackendUrl = "https://dotwatch-backend.onrender.com",
  [switch]$SkipRenderHealth,
  [switch]$SkipEsp32Product
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ReportRoot = Join-Path $RepoRoot "_reports\production-release-audit\$Timestamp"
New-Item -ItemType Directory -Path $ReportRoot -Force | Out-Null

$Results = New-Object System.Collections.Generic.List[object]

function Invoke-Check {
  param([string]$Name, [scriptblock]$Command)

  $SafeName = ($Name -replace '[^a-zA-Z0-9._-]', '-').ToLowerInvariant()
  $LogFile = Join-Path $ReportRoot "$SafeName.log"
  $ExitCode = 0

  Write-Host ""
  Write-Host "=== $Name ==="

  try {
    & $Command *>&1 | Tee-Object -FilePath $LogFile
    if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) {
      $ExitCode = $LASTEXITCODE
      throw "Command exited with code $ExitCode"
    }
    $Status = "PASS"
  }
  catch {
    if ($ExitCode -eq 0) { $ExitCode = 1 }
    $_ | Out-String | Add-Content -LiteralPath $LogFile
    $Status = "FAIL"
  }

  $Results.Add([PSCustomObject]@{
    Check = $Name
    Status = $Status
    ExitCode = $ExitCode
    LogFile = $LogFile
  })

  Write-Host "$Status: $Name"
}

Write-Host "dotWatch Production Release Audit"
Write-Host "Scope: backend, dashboard, admin, ESP32 software, OTA, security, Render"
Write-Host "Excluded: mobile, local database, irreversible hardware provisioning"
Write-Host "Report: $ReportRoot"

Invoke-Check "Git working tree" {
  $Status = git status --porcelain
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if ($Status) {
    Write-Host $Status
    throw "Working tree is not clean."
  }
  git status -sb
}

$Checks = @(
  @{ Name = "Secret scan"; Command = { npm run scan:secrets } },
  @{ Name = "Backend syntax"; Command = { npm run check:backend } },
  @{ Name = "Dashboard build"; Command = { npm run check:dashboard } },
  @{ Name = "Admin build"; Command = { npm run check:admin } },
  @{ Name = "Phase 1"; Command = { npm run verify:phase1 } },
  @{ Name = "Phase 2"; Command = { npm run verify:phase2 } },
  @{ Name = "Phase 3"; Command = { npm run verify:phase3 } },
  @{ Name = "Phase 4"; Command = { npm run verify:phase4 } },
  @{ Name = "Phase 5"; Command = { npm run verify:phase5 } },
  @{ Name = "Phase 6 operations"; Command = { npm run verify:phase6:ops } },
  @{ Name = "Phase 7 tenant"; Command = { npm run verify:phase7:tenant } },
  @{ Name = "Phase 7D DB operations"; Command = { npm run verify:phase7d:dbops } },
  @{ Name = "Phase 8 release"; Command = { npm run verify:phase8:release } },
  @{ Name = "Phase 9 maintenance"; Command = { npm run verify:phase9:maintenance } },
  @{ Name = "Phase 9C parity"; Command = { npm run verify:phase9c:core-parity } },
  @{ Name = "Phase 9D parity"; Command = { npm run verify:phase9d:core-parity } },
  @{ Name = "Phase 9E compatibility"; Command = { npm run verify:phase9e:compat-parity } },
  @{ Name = "Phase 9F nullability"; Command = { npm run verify:phase9f:nullability } },
  @{ Name = "Phase 10E dashboard auth"; Command = { npm run verify:phase10e:dashboard-auth } },
  @{ Name = "Phase 11D admin sidebar"; Command = { npm run verify:phase11d:admin-sidebar } },
  @{ Name = "Phase 11G parity"; Command = { npm run verify:phase11g:admin-dashboard-parity } },
  @{ Name = "Phase 11H sidebar"; Command = { npm run verify:phase11h:dashboard-sidebar-vertical } },
  @{ Name = "Phase 11I comfort"; Command = { npm run verify:phase11i:admin-dashboard-comfort } },
  @{ Name = "Phase 11J spacing"; Command = { npm run verify:phase11j:dashboard-sidebar-spacing } },
  @{ Name = "Security S1"; Command = { npm run verify:phase-s1:security } },
  @{ Name = "Security S1 production env"; Command = { npm run test:phase-s1:prod-env } },
  @{ Name = "Security S2"; Command = { npm run test:phase-s2 } },
  @{ Name = "Security S3 software"; Command = { npm run test:phase-s3:software } },
  @{ Name = "OTA server"; Command = { npm --prefix services/ota-server run check } }
)

foreach ($Check in $Checks) {
  Invoke-Check -Name $Check.Name -Command $Check.Command
}

if (-not $SkipEsp32Product) {
  Invoke-Check "ESP32 product software" { npm run verify:esp32:product }
}

if (-not $SkipRenderHealth) {
  Invoke-Check "Render backend health" {
    npm run ops:health -- -BackendUrl $BackendUrl -AllowReady503
  }
}

$SummaryCsv = Join-Path $ReportRoot "summary.csv"
$SummaryJson = Join-Path $ReportRoot "summary.json"
$SummaryText = Join-Path $ReportRoot "summary.txt"

$Results | Export-Csv -LiteralPath $SummaryCsv -NoTypeInformation -Encoding UTF8
$Results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $SummaryJson -Encoding UTF8

$PassCount = @($Results | Where-Object Status -eq "PASS").Count
$FailCount = @($Results | Where-Object Status -eq "FAIL").Count
$TotalCount = $Results.Count

@(
  "dotWatch Production Release Audit",
  "Timestamp: $Timestamp",
  "Total: $TotalCount",
  "Passed: $PassCount",
  "Failed: $FailCount",
  "",
  ($Results | Format-Table -AutoSize | Out-String)
) | Set-Content -LiteralPath $SummaryText -Encoding UTF8

Write-Host ""
Write-Host "=== AUDIT SUMMARY ==="
$Results | Format-Table -AutoSize
Write-Host "Total : $TotalCount"
Write-Host "Passed: $PassCount"
Write-Host "Failed: $FailCount"
Write-Host "Report: $SummaryText"

if ($FailCount -gt 0) { exit 1 }
exit 0
