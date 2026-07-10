import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'apps/dashboard/src/styles.css',
  'apps/dashboard/src/styles/phase11i-dashboard-comfort-parity.css',
  'apps/admin/src/main.jsx',
  'apps/admin/src/styles/phase11i-admin-comfort-parity.css',
  'docs/PHASE11I_ADMIN_DASHBOARD_COMFORT_AUDIT.md',
  'docs/PHASE11I_ADMIN_DASHBOARD_COMFORT_PARITY.md',
]

const requiredChecks = [
  {
    file: 'apps/dashboard/src/styles.css',
    snippets: ["phase11i-dashboard-comfort-parity.css"],
  },
  {
    file: 'apps/admin/src/main.jsx',
    snippets: ["phase11i-admin-comfort-parity.css"],
  },
  {
    file: 'apps/dashboard/src/styles/phase11i-dashboard-comfort-parity.css',
    snippets: [
      '--dw-shell-sidebar-width: 280px',
      '--dw-shell-sidebar-collapsed-width: 88px',
      '--dw-shell-topbar-height: 76px',
      '--dw-shell-nav-item: 48px',
      '.sidebar.collapsed .menu',
      'margin-top: 12px',
      'place-items: center',
    ],
  },
  {
    file: 'apps/admin/src/styles/phase11i-admin-comfort-parity.css',
    snippets: [
      '--dw-shell-sidebar-width: 280px',
      '--dw-shell-sidebar-collapsed-width: 88px',
      '--dw-shell-topbar-height: 76px',
      '--dw-shell-nav-item: 48px',
      '.admin-sidebar.collapsed .admin-nav.menu',
      'margin-top: 12px',
      'place-items: center',
    ],
  },
]

function fail(message) {
  console.error(`Phase 11I Admin/Dashboard comfort verify: FAILED - ${message}`)
  process.exit(1)
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`missing ${file}`)
  }
}

for (const check of requiredChecks) {
  const body = fs.readFileSync(path.join(root, check.file), 'utf8')
  for (const snippet of check.snippets) {
    if (!body.includes(snippet)) {
      fail(`${check.file} missing snippet: ${snippet}`)
    }
  }
}

const dashboardCss = fs.readFileSync(path.join(root, 'apps/dashboard/src/styles/phase11i-dashboard-comfort-parity.css'), 'utf8')
const adminCss = fs.readFileSync(path.join(root, 'apps/admin/src/styles/phase11i-admin-comfort-parity.css'), 'utf8')

const tokenNames = [
  '--dw-shell-sidebar-width',
  '--dw-shell-sidebar-collapsed-width',
  '--dw-shell-topbar-height',
  '--dw-shell-page-x',
  '--dw-shell-gap',
  '--dw-shell-nav-item',
  '--dw-shell-card-radius',
  '--dw-shell-control-radius',
]

for (const token of tokenNames) {
  if (!dashboardCss.includes(token) || !adminCss.includes(token)) {
    fail(`shared token not present in both apps: ${token}`)
  }
}

console.log('Phase 11I Admin/Dashboard comfort verify: OK')
