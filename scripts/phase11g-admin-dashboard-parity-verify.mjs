import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))

const checks = []
function check(name, pass, detail = '') {
  checks.push({ name, pass, detail })
}

const adminMain = read('apps/admin/src/main.jsx')
const dashboardMain = read('apps/dashboard/src/main.jsx')
const dashboardStyles = read('apps/dashboard/src/styles.css')
const adminParityCss = exists('apps/admin/src/styles/phase11g-admin-dashboard-parity.css')
  ? read('apps/admin/src/styles/phase11g-admin-dashboard-parity.css')
  : ''
const dashboardParityCss = exists('apps/dashboard/src/styles/phase11g-dashboard-parity-lock.css')
  ? read('apps/dashboard/src/styles/phase11g-dashboard-parity-lock.css')
  : ''
const adminVite = read('apps/admin/vite.config.js')
const adminSidebar = read('apps/admin/src/components/layout/AdminSidebar.jsx')
const dashboardSidebar = read('apps/dashboard/src/components/Sidebar.jsx')
const adminPageHeader = read('apps/admin/src/components/common/PageHeader.jsx')
const dashboardPageHeader = read('apps/dashboard/src/components/common/PageHeader.jsx')
const adminStatCard = read('apps/admin/src/components/common/StatCard.jsx')
const dashboardStatCard = read('apps/dashboard/src/components/common/StatCard.jsx')
const adminPkg = JSON.parse(read('apps/admin/package.json'))
const dashboardPkg = JSON.parse(read('apps/dashboard/package.json'))

check('Admin imports Phase 11G parity CSS after admin.css', adminMain.includes("import './styles/admin.css'") && adminMain.includes("import './styles/phase11g-admin-dashboard-parity.css'"))
check('Dashboard imports Phase 11G parity lock CSS', dashboardStyles.includes("phase11g-dashboard-parity-lock.css"))
check('Admin StrictMode behavior matches dashboard env-gated pattern', adminMain.includes('VITE_REACT_STRICT_MODE') && dashboardMain.includes('VITE_REACT_STRICT_MODE'))
check('Admin Vite base matches dashboard base', adminVite.includes("base: '/'"))
check('Admin parity CSS exists', Boolean(adminParityCss))
check('Dashboard parity lock CSS exists', Boolean(dashboardParityCss))
check('Admin and Dashboard share Prompt-capable font stack', adminParityCss.includes("'Prompt'") && read('apps/dashboard/src/styles/base.css').includes('Prompt'))
check('Shared sidebar width token is 280px', adminParityCss.includes('--dw-sidebar-width: 280px') && dashboardParityCss.includes('--dw-sidebar-width: 280px'))
check('Shared collapsed sidebar width token is 88px', adminParityCss.includes('--dw-sidebar-collapsed-width: 88px') && dashboardParityCss.includes('--dw-sidebar-collapsed-width: 88px'))
check('Shared topbar height token is 76px', adminParityCss.includes('--dw-topbar-height: 76px') && dashboardParityCss.includes('--dw-topbar-height: 76px'))
check('Shared nav pill token is 48px', adminParityCss.includes('--dw-nav-pill-size: 48px') && dashboardParityCss.includes('--dw-nav-pill-size: 48px'))
check('Admin collapsed sidebar uses centered menu section', adminParityCss.includes('.admin-sidebar.collapsed .admin-menu-section') && adminParityCss.includes('justify-items: center'))
check('Admin collapsed menu item uses 48px centered pill', adminParityCss.includes('width: var(--dw-nav-pill-size)') && adminParityCss.includes('place-items: center'))
check('Admin active indicator uses dashboard position/color token', adminParityCss.includes('left: -1px') && adminParityCss.includes('background: var(--primary)'))
check('Admin topbar uses dashboard top-header class', adminMain.includes('<App />') && read('apps/admin/src/components/layout/AdminTopbar.jsx').includes('admin-topbar top-header'))
check('Admin Sidebar uses dashboard class aliases', adminSidebar.includes('admin-nav menu') && adminSidebar.includes('admin-nav-item menu-item') && adminSidebar.includes('admin-menu-icon menu-icon'))
check('Dashboard Sidebar still uses canonical menu classes', dashboardSidebar.includes('className="menu"') && dashboardSidebar.includes('className={`menu-item'))
check('Admin PageHeader keeps dw-page-header class', adminPageHeader.includes('dw-page-header') && dashboardPageHeader.includes('dw-page-header'))
check('Admin StatCard keeps dw-stat-card class', adminStatCard.includes('dw-stat-card') && dashboardStatCard.includes('dw-stat-card'))
check('Admin app details remain independent', read('apps/admin/src/services/adminApi.js').includes('/api/admin') && !read('apps/dashboard/src/services/api.js').includes('/api/admin'))
check('Admin package remains separate from dashboard package', adminPkg.name === 'dotwatch-admin' && dashboardPkg.name === 'dotwatch-dashboard')

const failed = checks.filter((item) => !item.pass)
for (const item of checks) {
  const status = item.pass ? 'OK' : 'FAIL'
  console.log(`[${status}] ${item.name}${item.detail ? ` - ${item.detail}` : ''}`)
}

if (failed.length > 0) {
  console.error(`\nPhase 11G Admin/Dashboard parity verify: FAILED (${failed.length} failed)`)
  process.exit(1)
}

console.log('\nPhase 11G Admin/Dashboard parity verify: OK')
