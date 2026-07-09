import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const required = [
  'scripts/phase9-core-parity-check.ps1',
  'package.json',
  'docs/PHASE9C_CORE_PARITY.md',
]

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)))
if (missing.length) {
  console.error('Phase 9C verify failed. Missing files:')
  for (const file of missing) console.error(`- ${file}`)
  process.exit(1)
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const scripts = packageJson.scripts || {}
const expectedScripts = [
  'db:parity:core',
  'verify:phase9c:core-parity',
]
for (const name of expectedScripts) {
  if (!scripts[name]) {
    console.error(`Phase 9C verify failed. Missing package script: ${name}`)
    process.exit(1)
  }
}

const scriptText = fs.readFileSync(path.join(root, 'scripts/phase9-core-parity-check.ps1'), 'utf8')
const markers = [
  'Core schema parity: OK',
  'Strict all-public parity: DIFFERENT',
  'postgres:18-alpine',
  'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
  'organization_quota_overrides',
  'optional_relation_patterns',
]
for (const marker of markers) {
  if (!scriptText.includes(marker)) {
    console.error(`Phase 9C verify failed. Missing marker in parity script: ${marker}`)
    process.exit(1)
  }
}

console.log('Phase 9C Core Parity verify: OK')
