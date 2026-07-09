import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'scripts/db-backup.ps1',
  'scripts/db-restore.ps1',
  'scripts/db-env-check.ps1',
  'docs/PHASE7D_DBOPS_DOCKER_EXEC_HOTFIX.md',
  'package.json',
]

const requiredMarkers = new Map([
  ['scripts/db-backup.ps1', [
    'DockerContainerName',
    'NoDockerExecFallback',
    'Find-PostgresContainer',
    'Invoke-DockerExecPgDump',
    'This bypasses host.docker.internal',
  ]],
  ['scripts/db-restore.ps1', [
    'DockerContainerName',
    'NoDockerExecFallback',
    'Find-PostgresContainer',
    'Invoke-DockerExecRestore',
    'This restores from inside the PostgreSQL container',
  ]],
  ['scripts/db-env-check.ps1', [
    'postgres container fallback',
    'Docker exec fallback',
    'Find-PostgresContainer',
  ]],
  ['package.json', ['verify:phase7d:dbops']],
])

function fail(message) {
  console.error(`Phase 7D DB Ops verify: FAILED - ${message}`)
  process.exit(1)
}

for (const file of requiredFiles) {
  const full = path.join(root, file)
  if (!fs.existsSync(full)) fail(`missing ${file}`)
}

for (const [file, markers] of requiredMarkers) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  for (const marker of markers) {
    if (!text.includes(marker)) fail(`${file} missing marker: ${marker}`)
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (pkg.scripts?.['verify:phase7d:dbops'] !== 'node scripts/phase7d-dbops-verify.mjs') {
  fail('package.json verify:phase7d:dbops script is incorrect')
}

console.log('Phase 7D DB Ops verify: OK')
