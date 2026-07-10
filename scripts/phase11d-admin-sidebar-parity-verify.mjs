import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'apps/admin/src/config/adminPages.js',
  'apps/admin/src/styles/admin.css',
  'docs/PHASE11D_ADMIN_SIDEBAR_DASHBOARD_PARITY.md',
]

function fail(message) {
  console.error(`Phase 11D Admin sidebar verify failed: ${message}`)
  process.exit(1)
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`Missing required file: ${file}`)
  }
}

const adminPages = fs.readFileSync(path.join(root, 'apps/admin/src/config/adminPages.js'), 'utf8')
const css = fs.readFileSync(path.join(root, 'apps/admin/src/styles/admin.css'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const expectedGroups = [
  "section: 'Admin Workspace'",
  "{ id: 'overview', label: 'Overview'",
  "{ id: 'users', label: 'Users'",
  "{ id: 'devices', label: 'Devices'",
  "section: 'Operations'",
  "{ id: 'models', label: 'Device Models'",
  "{ id: 'subscriptions', label: 'Subscriptions'",
  "{ id: 'audit', label: 'Audit Logs'",
  "section: 'System'",
  "section: 'Account'",
]

for (const snippet of expectedGroups) {
  if (!adminPages.includes(snippet)) {
    fail(`Admin page config missing expected sidebar snippet: ${snippet}`)
  }
}

const expectedCss = [
  'Phase 11D - Admin sidebar visual parity with Dashboard',
  '.admin-sidebar .admin-menu-section + .admin-menu-section',
  'border-top: 1px solid rgba(148, 163, 184, 0.12)',
  '.admin-sidebar .admin-nav-item.menu-item.active::before',
  'background: var(--primary)',
  '.admin-sidebar.collapsed .admin-menu-section-label',
  'display: none',
  '.admin-sidebar.collapsed .admin-nav-item.menu-item.active::before',
  'left: 5px',
]

for (const snippet of expectedCss) {
  if (!css.includes(snippet)) {
    fail(`Admin CSS missing expected sidebar parity snippet: ${snippet}`)
  }
}

if (packageJson.scripts?.['verify:phase11d:admin-sidebar'] !== 'node scripts/phase11d-admin-sidebar-parity-verify.mjs') {
  fail('package.json missing verify:phase11d:admin-sidebar script')
}

console.log('Phase 11D Admin sidebar verify: OK')
