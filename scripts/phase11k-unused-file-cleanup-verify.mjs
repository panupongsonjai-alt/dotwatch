import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const removedPaths = [
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
  'apps/admin/src/pages/Users.jsx',

]

const requiredPaths = [
  'README.md',
  'package.json',
  'apps/dashboard/src/App.jsx',
  'apps/dashboard/src/styles.css',
  'apps/admin/src/App.jsx',
  'apps/admin/src/styles/admin.css',
  'apps/admin/src/styles/phase11i-admin-comfort-parity.css',
  'esp32/dotwatch_esp32_dht3_tls_hardened/platformio.ini',
  'esp32/dotwatch_esp32_dht3_tls_hardened/src/main.cpp',
  'pi/agent/main.py',
  'pi/agent/pi_config_web.py',
  'services/backend/src/server.js',
  'scripts/phase11k-clean-unused-files.ps1',
]

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

const failures = []

for (const removedPath of removedPaths) {
  if (exists(removedPath)) {
    failures.push(`unused path still exists: ${removedPath}`)
  }
}

for (const requiredPath of requiredPaths) {
  if (!exists(requiredPath)) {
    failures.push(`required path missing: ${requiredPath}`)
  }
}

const dashboardStyles = fs.readFileSync(path.join(root, 'apps/dashboard/src/styles.css'), 'utf8')
for (const expectedImport of [
  './styles/phase11i-dashboard-comfort-parity.css',
  './styles/phase11j-dashboard-sidebar-admin-spacing.css',
]) {
  if (!dashboardStyles.includes(expectedImport)) {
    failures.push(`dashboard missing style import: ${expectedImport}`)
  }
}

const adminMain = fs.readFileSync(path.join(root, 'apps/admin/src/main.jsx'), 'utf8')
for (const expectedImport of [
  './styles/admin.css',
  './styles/phase11g-admin-dashboard-parity.css',
  './styles/phase11i-admin-comfort-parity.css',
]) {
  if (!adminMain.includes(expectedImport)) {
    failures.push(`admin main missing style import: ${expectedImport}`)
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
for (const scriptName of ['cleanup:phase11k:unused', 'verify:phase11k:cleanup']) {
  if (!packageJson.scripts?.[scriptName]) {
    failures.push(`package.json missing script: ${scriptName}`)
  }
}

if (failures.length > 0) {
  console.error('Phase 11K unused file cleanup verify: FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Phase 11K unused file cleanup verify: OK')
console.log(`Checked removed paths: ${removedPaths.length}`)
console.log(`Checked required paths: ${requiredPaths.length}`)
