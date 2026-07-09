import fs from 'fs'
import path from 'path'

const root = process.cwd()
const migrationPath = path.join(
  root,
  'services',
  'backend',
  'migrations',
  '020_phase9f_required_nullability_normalization.sql'
)
const packagePath = path.join(root, 'package.json')

const requiredMarkers = [
  'Phase 9F: Required runtime nullability normalization',
  'Cannot set devices.secret_hash NOT NULL',
  'ALTER TABLE activity_logs',
  'ALTER TABLE devices',
  'ALTER TABLE users',
  'ALTER COLUMN secret_hash SET NOT NULL',
  'ALTER COLUMN updated_at SET NOT NULL',
]

function fail(message) {
  console.error(`Phase 9F verify failed: ${message}`)
  process.exit(1)
}

if (!fs.existsSync(migrationPath)) {
  fail(`missing ${migrationPath}`)
}

const migrationSql = fs.readFileSync(migrationPath, 'utf8')
for (const marker of requiredMarkers) {
  if (!migrationSql.includes(marker)) {
    fail(`migration is missing marker: ${marker}`)
  }
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
if (pkg.scripts?.['verify:phase9f:nullability'] !== 'node scripts/phase9f-nullability-verify.mjs') {
  fail('package.json is missing script verify:phase9f:nullability')
}

console.log('Phase 9F Nullability verify: OK')
