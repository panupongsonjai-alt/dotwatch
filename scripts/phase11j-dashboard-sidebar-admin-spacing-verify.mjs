import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const required = [
  'apps/dashboard/src/styles/phase11j-dashboard-sidebar-admin-spacing.css',
  'apps/dashboard/src/styles.css',
]

for (const file of required) {
  const fullPath = path.join(root, file)
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${file}`)
  }
}

const stylesCss = fs.readFileSync(path.join(root, 'apps/dashboard/src/styles.css'), 'utf8')
const phaseCss = fs.readFileSync(path.join(root, 'apps/dashboard/src/styles/phase11j-dashboard-sidebar-admin-spacing.css'), 'utf8')

const importLine = "@import './styles/phase11j-dashboard-sidebar-admin-spacing.css';"
if (!stylesCss.includes(importLine)) {
  throw new Error('Dashboard styles.css does not import phase11j dashboard spacing CSS')
}

const checks = [
  '.sidebar.collapsed .brand',
  'margin: 0 0 26px',
  '.sidebar.collapsed .menu',
  'gap: 10px',
  'margin-top: 12px',
  '.sidebar.collapsed .menu-section + .menu-section',
  'padding-top: 10px',
  '.sidebar.collapsed .menu-item',
  'width: 48px',
  '.sidebar.collapsed .menu-item.active::before',
  'left: 5px',
]

for (const token of checks) {
  if (!phaseCss.includes(token)) {
    throw new Error(`Phase 11J CSS missing expected token: ${token}`)
  }
}

const forbidden = [
  'apps/admin/src/',
  'services/backend/',
  'esp32/',
  'pi/',
]

for (const token of forbidden) {
  if (phaseCss.includes(token)) {
    throw new Error(`Phase 11J CSS should not reference ${token}`)
  }
}

console.log('Phase 11J Dashboard sidebar admin spacing verify: OK')
