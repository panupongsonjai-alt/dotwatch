import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const sansVariable = '--dw-font-sans:'
const monoVariable = '--dw-font-mono:'
const expectedStack =
  '"Inter", "Prompt", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const expectedCompactStack =
  "'Inter','Prompt',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
const googleFontQuery =
  'family=Inter:wght@400;500;600;700;800;900&family=Prompt:wght@400;500;600;700;800;900&display=swap'

const dashboardMain = read('apps/dashboard/src/main.jsx')
const adminMain = read('apps/admin/src/main.jsx')

assert(
  dashboardMain.includes("import './styles/typography-system.css'"),
  'Dashboard does not import typography-system.css.'
)
assert(
  adminMain.includes("import './styles/typography-system.css'"),
  'Admin does not import typography-system.css.'
)
assert(
  dashboardMain.indexOf("import './styles/typography-system.css'") >
    dashboardMain.indexOf("import './styles/button-shadow-reset.css'"),
  'Dashboard typography system must be imported after existing style overrides.'
)
assert(
  adminMain.indexOf("import './styles/typography-system.css'") >
    adminMain.indexOf("import './styles/button-shadow-reset.css'"),
  'Admin typography system must be imported after existing style overrides.'
)

for (const relativePath of [
  'apps/dashboard/src/styles/typography-system.css',
  'apps/admin/src/styles/typography-system.css',
]) {
  const css = read(relativePath)
  assert(css.includes(sansVariable), `${relativePath} is missing ${sansVariable}`)
  assert(css.includes(monoVariable), `${relativePath} is missing ${monoVariable}`)
  assert(css.includes(expectedStack), `${relativePath} has a different sans-serif stack.`)
  assert(
    css.includes('font-family: var(--dw-font-sans) !important;'),
    `${relativePath} does not enforce the shared UI font.`
  )
  assert(
    css.includes('font-family: var(--dw-font-mono) !important;'),
    `${relativePath} does not preserve the technical monospace font.`
  )
}

const dashboardBase = read('apps/dashboard/src/styles/base.css')
const adminBase = read('apps/admin/src/styles/admin.css')

for (const [label, css] of [
  ['Dashboard base', dashboardBase],
  ['Admin base', adminBase],
]) {
  assert(css.includes(googleFontQuery), `${label} does not load matching Inter/Prompt weights.`)
  assert(css.includes(sansVariable), `${label} does not define the shared sans variable.`)
  assert(css.includes(monoVariable), `${label} does not define the shared mono variable.`)
  assert(
    css.includes('font-family: var(--dw-font-sans);'),
    `${label} root does not use the shared sans variable.`
  )
}

for (const relativePath of [
  'apps/dashboard/src/styles/pages/notifications.css',
  'apps/dashboard/src/styles/pages/alarms.css',
  'apps/dashboard/src/styles/shared-ui.css',
  'apps/dashboard/src/styles/dashboard.css',
  'apps/admin/src/styles/phase11g-admin-dashboard-parity.css',
]) {
  const css = read(relativePath)
  assert(
    css.includes('var(--dw-font-sans)'),
    `${relativePath} is not connected to the shared typography variable.`
  )
}

for (const relativePath of [
  'apps/dashboard/src/styles/phase10c-device-ux.css',
  'apps/dashboard/src/styles/phase10e-dashboard-auth-env.css',
  'apps/dashboard/src/styles/devices.css',
  'apps/admin/src/styles/admin-device-models-dashboard-parity.css',
]) {
  const css = read(relativePath)
  assert(
    css.includes('var(--dw-font-mono)'),
    `${relativePath} does not use the shared monospace variable.`
  )
}

for (const relativePath of [
  'apps/dashboard/src/pages/CompareGraph.jsx',
  'apps/dashboard/src/pages/History.jsx',
  'apps/dashboard/src/utils/tableExport.js',
]) {
  const source = read(relativePath)
  assert(
    source.includes(googleFontQuery),
    `${relativePath} printable output does not load the shared font weights.`
  )
}

for (const relativePath of [
  'esp32/dotwatch_esp32_product/src/portal/PortalAssets.h',
  'esp32/dotwatch_esp32_product/portal-preview/src/styles/02-base.css',
  'esp8266/dotwatch_esp8266_product/src/portal/PortalAssets.h',
  'esp8266/dotwatch_esp8266_product/portal-preview/src/styles/02-base.css',
]) {
  const source = read(relativePath)
  assert(
    source.includes(expectedCompactStack),
    `${relativePath} does not use the browser UI font stack.`
  )
  assert(
    source.includes('button,input,select,textarea{font:inherit}'),
    `${relativePath} form controls do not inherit the shared font.`
  )
}

const piUi = read('pi/agent/pi_config_web.py')
assert(
  piUi.includes(
    'font-family:"Inter","Prompt",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
  ),
  'Raspberry Pi configuration UI has a different font stack.'
)
assert(
  piUi.includes('button,input,select,textarea{font:inherit}'),
  'Raspberry Pi configuration UI controls do not inherit the shared font.'
)

const cssRoots = [
  'apps/dashboard/src/styles',
  'apps/admin/src/styles',
]
const forbiddenFamilies = /font-family\s*:[^;]*(Arial|Helvetica|Roboto|Poppins|Tahoma|Verdana)/i

for (const cssRoot of cssRoots) {
  const absoluteRoot = path.join(repoRoot, cssRoot)
  const stack = [absoluteRoot]

  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(absolutePath)
        continue
      }
      if (!entry.name.endsWith('.css')) continue

      const source = fs.readFileSync(absolutePath, 'utf8')
      assert(
        !forbiddenFamilies.test(source),
        `${path.relative(repoRoot, absolutePath)} contains a non-standard font family.`
      )
    }
  }
}

console.log('PASS: Dashboard and Admin use one Inter/Prompt typography system.')
console.log('PASS: Form controls, tables, charts, maps, and printable reports use the shared font stack.')
console.log('PASS: ESP32, ESP8266, and Raspberry Pi browser interfaces use the same fallback stack.')
console.log('PASS: Technical code and identifiers retain the shared monospace stack.')
