import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'scripts/phase9-core-compatibility-check.ps1',
  'scripts/phase9e-compat-parity-verify.mjs',
  'docs/PHASE9E_CORE_COMPATIBILITY_PARITY.md',
  'package.json',
]

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)))
if (missing.length) {
  console.error('Phase 9E verify failed. Missing files:')
  for (const file of missing) console.error(`- ${file}`)
  process.exit(1)
}

const script = fs.readFileSync(path.join(root, 'scripts/phase9-core-compatibility-check.ps1'), 'utf8')
const markers = [
  'dotWatch Phase 9E - Core compatibility parity check',
  'required core tables + required column type/nullability',
  'Core compatibility parity: OK',
  'StrictFullCoreColumns',
  'postgres:18-alpine',
]
const missingMarkers = markers.filter((marker) => !script.includes(marker))
if (missingMarkers.length) {
  console.error('Phase 9E verify failed. Missing script markers:')
  for (const marker of missingMarkers) console.error(`- ${marker}`)
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (!pkg.scripts?.['db:parity:compat']) {
  console.error('Phase 9E verify failed. Missing npm script: db:parity:compat')
  process.exit(1)
}
if (!pkg.scripts?.['verify:phase9e:compat-parity']) {
  console.error('Phase 9E verify failed. Missing npm script: verify:phase9e:compat-parity')
  process.exit(1)
}

console.log('Phase 9E Core Compatibility verify: OK')
