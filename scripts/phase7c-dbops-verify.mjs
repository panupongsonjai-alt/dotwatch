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
assertFile('docs/PHASE7C_DB_BACKUP_LOCALHOST_DOCKER_HOTFIX.md')

assertIncludes('scripts/db-backup.ps1', [
  'Get-DockerSafeDatabaseUrl',
  'host.docker.internal',
  'DB Target   : LOCAL database, not Render production',
  'Docker DB URL',
  'Docker fallback troubleshooting',
])

assertIncludes('scripts/db-restore.ps1', [
  'Get-DockerSafeDatabaseUrl',
  'host.docker.internal',
  'DB Target  : LOCAL database, not Render production',
  'Docker fallback troubleshooting',
])

assertIncludes('scripts/db-env-check.ps1', [
  'RequireRender',
  'Docker URL',
  'host.docker.internal',
  'RequireRender was set, but DATABASE_URL points to localhost',
])

const pkg = JSON.parse(read('package.json'))
if (!pkg.scripts?.['verify:phase7c:dbops']) {
  throw new Error('package.json missing script: verify:phase7c:dbops')
}

console.log('Phase 7C DB Ops verify: OK')
