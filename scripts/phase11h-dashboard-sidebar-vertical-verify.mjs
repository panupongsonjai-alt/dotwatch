import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const required = [
  'apps/dashboard/src/styles.css',
  'apps/dashboard/src/styles/phase11h-dashboard-sidebar-vertical-restore.css',
]

function fail(message) {
  console.error(`Phase 11H Dashboard sidebar vertical verify: FAILED - ${message}`)
  process.exit(1)
}

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`missing ${file}`)
  }
}

const styles = fs.readFileSync(path.join(root, 'apps/dashboard/src/styles.css'), 'utf8')
if (!styles.includes("@import './styles/phase11h-dashboard-sidebar-vertical-restore.css';")) {
  fail('styles.css does not import phase11h dashboard sidebar restore CSS')
}

const css = fs.readFileSync(
  path.join(root, 'apps/dashboard/src/styles/phase11h-dashboard-sidebar-vertical-restore.css'),
  'utf8',
)

const checks = [
  '.sidebar.collapsed .menu',
  'margin-top: 12px',
]

for (const token of checks) {
  if (!css.includes(token)) {
    fail(`missing token: ${token}`)
  }
}

console.log('Phase 11H Dashboard sidebar vertical verify: OK')
