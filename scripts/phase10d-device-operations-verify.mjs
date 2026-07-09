import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const checks = [
  {
    file: 'apps/dashboard/src/components/devices/SelectedDevicePanel.jsx',
    markers: [
      "{ key: 'ops', label: 'Operations' }",
      'function DeviceOperationsPanel',
      'getProductionReadiness',
      'devices-v5-ops-panel',
      'Production Operations',
    ],
  },
  {
    file: 'apps/dashboard/src/styles/phase10d-device-operations.css',
    markers: [
      'Phase 10D - Production Device Operations UX',
      '.devices-v5-ops-panel',
      '.devices-v5-check-grid',
      '.devices-v5-live-strip',
    ],
  },
  {
    file: 'apps/dashboard/src/styles.css',
    markers: ["@import './styles/phase10d-device-operations.css';"],
  },
  {
    file: 'docs/PHASE10D_DEVICE_OPERATIONS_UX.md',
    markers: ['Phase 10D', 'Production Device Operations UX'],
  },
]

const failures = []

for (const check of checks) {
  const absolutePath = path.join(root, check.file)

  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing file: ${check.file}`)
    continue
  }

  const content = fs.readFileSync(absolutePath, 'utf8')

  for (const marker of check.markers) {
    if (!content.includes(marker)) {
      failures.push(`Missing marker in ${check.file}: ${marker}`)
    }
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

if (!packageJson.scripts?.['verify:phase10d:device-ops']) {
  failures.push('Missing package script: verify:phase10d:device-ops')
}

const selectedPanel = fs.readFileSync(
  path.join(root, 'apps/dashboard/src/components/devices/SelectedDevicePanel.jsx'),
  'utf8'
)

const openBraces = (selectedPanel.match(/{/g) || []).length
const closeBraces = (selectedPanel.match(/}/g) || []).length

if (openBraces !== closeBraces) {
  failures.push(`SelectedDevicePanel brace balance mismatch: {=${openBraces}, }=${closeBraces}`)
}

if (failures.length) {
  console.error('Phase 10D Device Operations verify: FAILED')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Phase 10D Device Operations verify: OK')
