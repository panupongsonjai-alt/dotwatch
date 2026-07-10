import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

function exists(file) {
  return fs.existsSync(path.join(root, file))
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const requiredFiles = [
  'apps/admin/src/config/adminPages.js',
  'apps/admin/src/components/common/AppErrorBoundary.jsx',
  'apps/admin/src/components/common/EmptyState.jsx',
  'apps/admin/src/components/common/LoadingState.jsx',
  'apps/admin/src/components/common/NoticeBanner.jsx',
  'apps/admin/src/components/common/PageHeader.jsx',
  'apps/admin/src/components/common/SectionHeader.jsx',
  'apps/admin/src/components/common/StatCard.jsx',
  'apps/admin/src/components/common/StatusBadge.jsx',
  'apps/admin/src/components/common/index.js',
  'apps/admin/src/components/workspace/AdminCommandPalette.jsx',
  'apps/admin/src/components/workspace/AdminWorkspaceHelp.jsx',
  'apps/admin/src/components/workspace/AdminWorkspaceRouteBar.jsx',
  'apps/admin/src/components/layout/AdminLayout.jsx',
  'apps/admin/src/components/layout/AdminSidebar.jsx',
  'apps/admin/src/components/layout/AdminTopbar.jsx',
  'apps/admin/src/App.jsx',
  'apps/admin/src/services/firebase.js',
  'apps/admin/src/pages/LoginPage.jsx',
  'apps/admin/src/styles/admin.css',
]

for (const file of requiredFiles) {
  assert(exists(file), `Missing required Phase 11A file: ${file}`)
}

const app = read('apps/admin/src/App.jsx')
const sidebar = read('apps/admin/src/components/layout/AdminSidebar.jsx')
const topbar = read('apps/admin/src/components/layout/AdminTopbar.jsx')
const css = read('apps/admin/src/styles/admin.css')
const firebase = read('apps/admin/src/services/firebase.js')
const rootPackage = JSON.parse(read('package.json'))

const requiredAppSnippets = [
  'lazy(() => import',
  '<AdminWorkspaceRouteBar',
  '<AdminCommandPalette',
  '<AdminWorkspaceHelp',
  '<AppErrorBoundary',
  'document.documentElement.setAttribute',
  'dotwatchAdminOpenCommandPalette',
]

for (const snippet of requiredAppSnippets) {
  assert(app.includes(snippet), `Admin App missing dashboard-like structure: ${snippet}`)
}

const requiredSidebarSnippets = [
  'ADMIN_MENU_GROUPS',
  'collapse-btn',
  'sidebarOpen',
  'admin-menu-section',
]

for (const snippet of requiredSidebarSnippets) {
  assert(sidebar.includes(snippet), `Admin Sidebar missing grouped/collapsible structure: ${snippet}`)
}

const requiredTopbarSnippets = ['Moon', 'Sun', 'Toggle theme', 'Search admin pages']
for (const snippet of requiredTopbarSnippets) {
  assert(topbar.includes(snippet), `Admin Topbar missing dashboard-like action: ${snippet}`)
}

const requiredCssSnippets = [
  'Phase 11A - Admin structure aligned with Dashboard workspace',
  '.admin-layout',
  '.workspace-route-bar',
  '.command-palette',
  '.workspace-help-panel',
  '.dw-page-header',
  '.dw-stat-card',
  '.dw-status-badge',
  ':root[data-theme=\'light\']',
  ':root[data-theme=\'dark\']',
]

for (const snippet of requiredCssSnippets) {
  assert(css.includes(snippet), `Admin CSS missing dashboard-aligned style: ${snippet}`)
}

assert(firebase.includes('isFirebaseConfigured'), 'Admin Firebase config guard is missing')
assert(firebase.includes('apps/admin/.env.local'), 'Admin Firebase config help should point to admin env file')
assert(
  rootPackage.scripts?.['verify:phase11a:admin-structure'],
  'Root package.json missing verify:phase11a:admin-structure script'
)

const forbiddenAdminCrossImports = []
for (const file of fs.readdirSync(path.join(root, 'apps/admin/src'), { recursive: true })) {
  const fullPath = path.join(root, 'apps/admin/src', file)
  if (!fs.statSync(fullPath).isFile() || !/\.(jsx|js)$/.test(file)) continue

  const content = fs.readFileSync(fullPath, 'utf8')
  if (content.includes("../dashboard") || content.includes("apps/dashboard")) {
    forbiddenAdminCrossImports.push(file)
  }
}

assert(
  forbiddenAdminCrossImports.length === 0,
  `Admin should mirror dashboard structure but not import dashboard internals: ${forbiddenAdminCrossImports.join(', ')}`
)

console.log('Phase 11A Admin/Dashboard structure verify: OK')
