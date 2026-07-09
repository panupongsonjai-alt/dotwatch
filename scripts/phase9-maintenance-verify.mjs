import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'scripts/phase9-db-parity-check.ps1',
  'scripts/phase9-security-rotation-check.ps1',
  'scripts/phase9-maintenance-verify.mjs',
  'docs/PHASE9_POST_RELEASE_MAINTENANCE.md',
  'docs/LOCAL_RENDER_PARITY_RUNBOOK.md',
  'docs/POST_RELEASE_SECRET_ROTATION_RUNBOOK.md',
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
ok('package has db:parity', pkg.scripts?.['db:parity'] === 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/phase9-db-parity-check.ps1')
ok('package has security:rotation:check', pkg.scripts?.['security:rotation:check'] === 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/phase9-security-rotation-check.ps1')
ok('package has verify:phase9:maintenance', pkg.scripts?.['verify:phase9:maintenance'] === 'node scripts/phase9-maintenance-verify.mjs')

const parity = read('scripts/phase9-db-parity-check.ps1')
ok('parity script uses postgres 18 by default', parity.includes("[string]$DockerImage = 'postgres:18-alpine'"))
ok('parity script masks database URLs', parity.includes('Get-MaskedDatabaseUrl'))
ok('parity script supports local docker exec', parity.includes('LocalDockerContainerName') && parity.includes('Invoke-PsqlWithDockerExec'))
ok('parity script writes reports', parity.includes('_reports\\phase9-parity'))
ok('parity script compares schema hashes', parity.includes('schemaHash') && parity.includes('schema_match'))

const security = read('scripts/phase9-security-rotation-check.ps1')
ok('security script has RequireAll gate', security.includes('RequireAll'))
ok('security script checks rotation flags', security.includes('DatabasePasswordRotated') && security.includes('OldConnectionInvalidated'))
ok('security script scans risky repo files', security.includes('Test-RepoRiskFiles'))

const phase9Doc = read('docs/PHASE9_POST_RELEASE_MAINTENANCE.md')
ok('phase9 docs explain local/render separation', phase9Doc.includes('Local') && phase9Doc.includes('Render') && phase9Doc.includes('schema'))
ok('phase9 docs mention secret rotation', phase9Doc.toLowerCase().includes('rotate') || phase9Doc.toLowerCase().includes('rotation'))

const failed = checks.filter((check) => !check.pass)
if (failed.length > 0) {
  console.error('Phase 9 Maintenance verify: FAILED')
  for (const check of failed) {
    console.error(`- ${check.name}${check.detail ? `: ${check.detail}` : ''}`)
  }
  process.exit(1)
}

console.log('Phase 9 Maintenance verify: OK')
