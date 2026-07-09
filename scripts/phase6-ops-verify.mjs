import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const repoRoot = process.cwd()
const failures = []

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8')
}

function exists(file) {
  return fs.existsSync(path.join(repoRoot, file))
}

function expect(condition, message) {
  if (!condition) failures.push(message)
}

function expectFile(file) {
  expect(exists(file), `Missing file: ${file}`)
}

function expectContains(file, marker) {
  if (!exists(file)) {
    failures.push(`Cannot inspect missing file: ${file}`)
    return
  }
  expect(read(file).includes(marker), `Missing marker in ${file}: ${marker}`)
}

function nodeCheck(file) {
  try {
    execFileSync(process.execPath, ['--check', path.join(repoRoot, file)], {
      stdio: 'pipe',
    })
  } catch (error) {
    failures.push(`node --check failed: ${file}\n${error.stderr?.toString() || error.message}`)
  }
}

const requiredFiles = [
  'services/backend/src/utils/logger.js',
  'services/backend/scripts/ops-report.mjs',
  'scripts/ops-health-check.ps1',
  'scripts/ops-release-check.ps1',
  'scripts/phase6-ops-verify.mjs',
  'docs/PHASE6_OBSERVABILITY_OPERATIONS.md',
  'docs/OPERATIONS_RUNBOOK.md',
  'docs/ROLLBACK_CHECKLIST.md',
]

for (const file of requiredFiles) expectFile(file)

nodeCheck('services/backend/src/utils/logger.js')
nodeCheck('services/backend/scripts/ops-report.mjs')
nodeCheck('services/backend/src/server.js')
nodeCheck('services/backend/src/config/env.js')
nodeCheck('services/backend/src/utils/health.js')
nodeCheck('services/backend/src/middlewares/errorHandler.js')

const rootPackage = JSON.parse(read('package.json'))
const backendPackage = JSON.parse(read('services/backend/package.json'))

expect(rootPackage.scripts['verify:phase6:ops'] === 'node scripts/phase6-ops-verify.mjs', 'Root package missing verify:phase6:ops script')
expect(rootPackage.scripts['ops:health']?.includes('ops-health-check.ps1'), 'Root package missing ops:health script')
expect(rootPackage.scripts['ops:release-check']?.includes('ops-release-check.ps1'), 'Root package missing ops:release-check script')
expect(rootPackage.scripts['ops:backend-report'] === 'npm --prefix services/backend run ops:report', 'Root package missing ops:backend-report script')
expect(backendPackage.scripts['ops:report'] === 'node scripts/ops-report.mjs', 'Backend package missing ops:report script')

expectContains('services/backend/src/server.js', "import { createHttpLogger, logger, logStartupSummary, startOpsHeartbeat } from './utils/logger.js'")
expectContains('services/backend/src/server.js', 'app.use(createHttpLogger())')
expectContains('services/backend/src/server.js', 'startOpsHeartbeat')
expectContains('services/backend/src/server.js', 'unhandledRejection')
expectContains('services/backend/src/middlewares/errorHandler.js', "import { logger } from '../utils/logger.js'")
expectContains('services/backend/src/config/env.js', 'logLevel:')
expectContains('services/backend/src/config/env.js', 'httpLogEnabled:')
expectContains('services/backend/src/config/env.js', 'slowRequestMs:')
expectContains('services/backend/src/config/env.js', 'opsSummaryIntervalSeconds:')
expectContains('services/backend/src/utils/health.js', 'release: env.releaseVersion')
expectContains('services/backend/.env.example', 'LOG_LEVEL=')
expectContains('services/backend/.env.production.example', 'LOG_LEVEL=')
expectContains('.gitignore', '_reports/')
expectContains('scripts/ops-health-check.ps1', 'RetryCount')
expectContains('scripts/ops-health-check.ps1', 'attempts')
expectContains('scripts/ops-health-check.ps1', 'TimeoutSec = 35')

if (failures.length > 0) {
  console.error('Phase 6 Ops verify: FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Phase 6 Ops verify: OK')
