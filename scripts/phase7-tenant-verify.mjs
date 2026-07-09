import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

const repoRoot = process.cwd()
const requiredFiles = [
  'services/backend/migrations/019_phase7_multi_tenant_access_control.sql',
  'services/backend/src/services/organizationAccess.service.js',
  'services/backend/src/services/organizationAudit.service.js',
  'services/backend/src/services/organizationUsage.service.js',
  'services/backend/src/controllers/tenant.controller.js',
  'services/backend/src/routes/tenant.routes.js',
  'services/backend/scripts/phase7-tenant-report.mjs',
  'docs/PHASE7_MULTI_TENANT_COMMERCIAL_READINESS.md',
  'docs/TENANT_ACCESS_CONTROL_MATRIX.md',
]

const syntaxFiles = [
  'services/backend/src/server.js',
  'services/backend/migrations/run.js',
  'services/backend/src/controllers/devices.controller.js',
  'services/backend/src/controllers/organizations.controller.js',
  'services/backend/src/controllers/tenant.controller.js',
  'services/backend/src/routes/organizations.routes.js',
  'services/backend/src/routes/tenant.routes.js',
  'services/backend/src/services/organizationAccess.service.js',
  'services/backend/src/services/organizationAudit.service.js',
  'services/backend/src/services/organizationUsage.service.js',
  'services/backend/scripts/phase7-tenant-report.mjs',
]

function read(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(repoRoot, file)), `Missing required file: ${file}`)
}

for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(repoRoot, file)], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    process.stderr.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    throw new Error(`Syntax check failed: ${file}`)
  }
}

const runJs = read('services/backend/migrations/run.js')
assert(
  runJs.includes("019_phase7_multi_tenant_access_control.sql"),
  'Migration runner does not include Phase 7 migration'
)

const serverJs = read('services/backend/src/server.js')
assert(serverJs.includes("/api/tenant"), 'Backend server does not mount /api/tenant')
assert(serverJs.includes('tenantRouter'), 'Backend server does not import/use tenantRouter')

const devicesController = read('services/backend/src/controllers/devices.controller.js')
assert(
  devicesController.includes('buildTenantDeviceAccessWhere'),
  'Devices controller is missing tenant device access where guard'
)
assert(
  devicesController.includes('requireDeviceAccess'),
  'Devices controller is missing per-device tenant access guard'
)
assert(
  devicesController.includes('ORG_SECRET_ROLES'),
  'Device secret endpoints are missing stricter role guard marker'
)

const organizationsController = read('services/backend/src/controllers/organizations.controller.js')
assert(
  organizationsController.includes('getOrganizationUsageReport'),
  'Organizations controller is missing organization usage endpoint support'
)
assert(
  organizationsController.includes('listTenantAuditLogs'),
  'Organizations controller is missing tenant audit endpoint support'
)

const migrationSql = read('services/backend/migrations/019_phase7_multi_tenant_access_control.sql')
for (const marker of [
  'organization_quota_overrides',
  'organization_audit_logs',
  'idx_devices_org_active_created',
  'idx_organization_members_org_active_role',
]) {
  assert(migrationSql.includes(marker), `Phase 7 migration missing marker: ${marker}`)
}

const rootPackage = JSON.parse(read('package.json'))
assert(
  rootPackage.scripts['verify:phase7:tenant'],
  'Root package.json missing verify:phase7:tenant'
)
assert(rootPackage.scripts['report:tenant'], 'Root package.json missing report:tenant')

const backendPackage = JSON.parse(read('services/backend/package.json'))
assert(
  backendPackage.scripts['tenant:report'],
  'Backend package.json missing tenant:report'
)

console.log('Phase 7 Tenant verify: OK')
