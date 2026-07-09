import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'scripts/phase8-render-release.ps1',
  'scripts/db-backup.ps1',
  'scripts/db-restore.ps1',
  'docs/PHASE8_PRODUCTION_RELEASE.md',
  'docs/PRODUCTION_RELEASE_RUNBOOK.md',
  'docs/SECRETS_ROTATION_AFTER_EXPOSURE.md',
  'package.json',
]

const checks = []
function ok(name, pass, detail = '') {
  checks.push({ name, pass, detail })
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

for (const file of requiredFiles) {
  ok(`required file: ${file}`, fs.existsSync(path.join(root, file)))
}

const pkg = JSON.parse(read('package.json'))
ok('package has verify:phase8:release', pkg.scripts?.['verify:phase8:release'] === 'node scripts/phase8-production-verify.mjs')
ok('package has release:render', pkg.scripts?.['release:render'] === 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/phase8-render-release.ps1')

const backup = read('scripts/db-backup.ps1')
ok('db-backup default uses PostgreSQL 18 Docker image', backup.includes("[string]$DockerImage = 'postgres:18-alpine'"))
ok('db-backup keeps Docker exec fallback', backup.includes('Invoke-DockerExecPgDump'))
ok('db-backup explains server version mismatch', backup.includes('server-major'))

const restore = read('scripts/db-restore.ps1')
ok('db-restore default uses PostgreSQL 18 Docker image', restore.includes("[string]$DockerImage = 'postgres:18-alpine'"))
ok('db-restore keeps dry-run default', restore.includes('Dry run only. Add -Apply to perform restore.'))

const release = read('scripts/phase8-render-release.ps1')
ok('release script verifies Render DATABASE_URL', release.includes('-RequireDockerOrPgDump -RequireRender'))
ok('release script backs up before migration', release.indexOf('Render database backup') < release.indexOf('Render migration'))
ok('release script supports postgres image override', release.includes('PostgresDockerImage'))
ok('release script masks database URL in report', release.includes('Protect-DatabaseUrlForReport'))

const docs = read('docs/PHASE8_PRODUCTION_RELEASE.md')
ok('phase8 docs mention backup before migrate', /backup[\s\S]{0,80}migrate|migrate[\s\S]{0,80}backup/i.test(docs))
ok('phase8 docs mention rotate database password', docs.toLowerCase().includes('rotate') && docs.toLowerCase().includes('database password'))

const failed = checks.filter((check) => !check.pass)
if (failed.length > 0) {
  console.error('Phase 8 Production verify: FAILED')
  for (const check of failed) {
    console.error(`- ${check.name}${check.detail ? `: ${check.detail}` : ''}`)
  }
  process.exit(1)
}

console.log('Phase 8 Production verify: OK')
