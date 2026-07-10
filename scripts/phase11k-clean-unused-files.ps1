param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot

$UnusedPaths = @(
  'AUDIT_LATEST_ZIP_20260708.md',
  'AUDIT_PHASE4B_MODEL_ADMIN.md',
  'AUDIT_REPORT.md',
  'CLEANUP_REPORT_20260710.md',
  'PHASE11D_ADMIN_SIDEBAR_ANALYSIS.md',
  'README_CLEANUP.md',
  'README_DEVICE_MAP_DASHBOARD_STYLE_V8.md',
  'README_FIX_PHASE3_INGEST_DIAGNOSTIC_V3.md',
  'README_LOCAL_RUN.md',
  'README_PHASE0_START_HERE.md',
  'README_PHASE1_START_HERE.md',
  'README_PHASE2_START_HERE.md',
  'README_PHASE3_AUDIT_NEXT_STEPS.md',
  'README_PHASE3_START_HERE.md',
  'README_PHASE4A_ESP32_ADD_ONLY.md',
  'README_PHASE4A_ESP32_BASELINE_FIX.md',
  'README_PHASE4B_MODEL_ADMIN.md',
  'README_PHASE4C_ESP32_E2E_VERIFY.md',
  'README_PHASE4E_ESP32_CONFIG_PORTAL.md',
  'README_PHASE4F_PLATFORMIO_FINAL.md',
  'README_PHASE4G_ESP32_COMMISSIONING.md',
  'README_PHASE4H_ESP32_LOCAL_ADMIN.md',
  'README_PHASE4K_PRODUCTION_RELEASE.md',
  'README_PHASE5A_ESP32_TLS_HARDENING.md',
  'README_PHASE5B_TLS_CA_HELPER.md',
  'README_PHASE5_START_HERE.md',
  'README_RASPBERRY_PI_DASHBOARD_UI_V7_2.md',
  'README_RASPBERRY_PI_UX_UI_V7.md',
  'README_RASPBERRY_PI_V6.md',
  'README_RENDER_500_FIX.md',
  'README_UI_PERFORMANCE_V5.md',
  'README_WHITE_SCREEN_FIX.md',
  'dotwatch_latest_audit_report.md',
  'dotwatch-phase5a-esp32-tls-hardening.ps1',
  'dotwatch-phase5b-fetch-tls-ca.v2.ps1',
  'dotwatch_esp32_dht3_tls_hardened.ino',
  'main.cpp',
  'platformio.ini',
  'pi-ingest-diagnostic.ps1',
  'pi_header_probe.py',
  'modbus_data_map_ready.csv',
  'apps/dashboard/docs',
  'pi/config-ui',
  'esp32/dotwatch_esp32_dht3',
  'esp32/dotwatch_esp32_dht3_config_portal',
  'esp32/dotwatch_esp32_dht3_hardened',
  'esp32/dotwatch_esp32_dht3_local_admin',
  'apps/admin/src/App.css',
  'apps/admin/src/index.css',
  'apps/admin/src/assets/hero.png',
  'apps/admin/src/assets/react.svg',
  'apps/admin/src/assets/vite.svg',
  'apps/admin/src/pages/AdminDashboard.jsx',
  'apps/admin/src/pages/Users.jsx'
)

Write-Host "dotWatch Phase 11K - unused file cleanup" -ForegroundColor Cyan
Write-Host "RepoRoot: $RepoRoot"
Write-Host "DryRun  : $DryRun"
Write-Host ""

$removed = 0
$missing = 0

foreach ($relativePath in $UnusedPaths) {
  $fullPath = Join-Path $RepoRoot $relativePath

  if (Test-Path -LiteralPath $fullPath) {
    if ($DryRun) {
      Write-Host "[DRY] remove $relativePath" -ForegroundColor Yellow
    } else {
      Remove-Item -LiteralPath $fullPath -Recurse -Force
      Write-Host "[REMOVED] $relativePath" -ForegroundColor Green
    }
    $removed++
  } else {
    $missing++
  }
}

Write-Host ""
Write-Host "Cleanup result:" -ForegroundColor Cyan
Write-Host "Removed/Matched : $removed"
Write-Host "Already missing : $missing"

if (-not $DryRun) {
  Write-Host ""
  Write-Host "Next:" -ForegroundColor Cyan
  Write-Host "npm run verify:phase11k:cleanup"
}
