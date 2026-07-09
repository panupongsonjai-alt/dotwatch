import fs from 'fs'
import path from 'path'

const root = process.cwd()

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8')
}

function assertFile(relPath) {
  if (!fs.existsSync(path.join(root, relPath))) {
    throw new Error(`Missing required file: ${relPath}`)
  }
}

function assertIncludes(relPath, markers) {
  const content = read(relPath)
  for (const marker of markers) {
    if (!content.includes(marker)) {
      throw new Error(`${relPath} is missing marker: ${marker}`)
    }
  }
}

assertFile('scripts/db-backup.ps1')
assertFile('scripts/db-restore.ps1')
assertFile('scripts/db-env-check.ps1')
assertFile('services/backend/migrations/run.js')
assertFile('docs/PHASE7B_DB_OPS_HOTFIX.md')

assertIncludes('scripts/db-backup.ps1', [
  'DATABASE_URL still looks like a placeholder',
  'Docker fallback',
  'postgres:16-alpine',
  'Get-MaskedDatabaseUrl',
])

assertIncludes('scripts/db-restore.ps1', [
  'Dry run only',
  'Docker fallback',
  'DATABASE_URL still looks like a placeholder',
])

assertIncludes('scripts/db-env-check.ps1', [
  'dotWatch DB environment check',
  'RequireDockerOrPgDump',
  'DB environment check: OK',
])

assertIncludes('services/backend/migrations/run.js', [
  'dotWatch migration blocked',
  'DATABASE_URL still looks like a placeholder',
  'maskDatabaseUrl',
  "looks like a placeholder. Use the real Render PostgreSQL host",
])

const pkg = JSON.parse(read('package.json'))
for (const scriptName of ['db:env:check', 'verify:phase7b:dbops']) {
  if (!pkg.scripts?.[scriptName]) {
    throw new Error(`package.json missing script: ${scriptName}`)
  }
}

console.log('Phase 7B DB Ops verify: OK')
