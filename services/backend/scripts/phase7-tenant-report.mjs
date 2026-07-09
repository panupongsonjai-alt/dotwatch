import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const { Client } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')
const reportsDir = path.join(repoRoot, '_reports', 'phase7-tenant')

const databaseUrl = process.env.DATABASE_URL

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  return fallback
}

function getDatabaseSslConfig() {
  if (parseBoolean(process.env.DATABASE_SSL_DISABLED, false)) return false
  if (
    databaseUrl?.includes('render.com') ||
    databaseUrl?.includes('render.internal') ||
    databaseUrl?.includes('sslmode=require')
  ) {
    return {
      rejectUnauthorized: parseBoolean(
        process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
        false
      ),
    }
  }
  return false
}

async function query(client, sql, params = []) {
  const result = await client.query(sql, params)
  return result.rows
}

async function main() {
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL')
    process.exit(1)
  }

  fs.mkdirSync(reportsDir, { recursive: true })

  const client = new Client({
    connectionString: databaseUrl,
    ssl: getDatabaseSslConfig(),
  })

  await client.connect()

  try {
    const [target] = await query(client, `
      SELECT current_database() AS database_name, current_user AS database_user
    `)

    const organizations = await query(client, `
      SELECT
        o.id,
        o.name,
        o.slug,
        o.owner_user_id,
        COALESCE(owner.email, '-') AS owner_email,
        COALESCE(us.plan_key, owner.plan, 'free') AS plan_key,
        COUNT(DISTINCT d.id) FILTER (WHERE d.is_active = true)::int AS device_count,
        COUNT(DISTINCT s.id) FILTER (WHERE s.is_active = true)::int AS site_count,
        COUNT(DISTINCT om.user_id) FILTER (WHERE om.is_active = true)::int AS member_count,
        COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending' AND oi.expires_at > NOW())::int AS pending_invitation_count
      FROM organizations o
      LEFT JOIN users owner
        ON owner.id = o.owner_user_id
      LEFT JOIN user_subscriptions us
        ON us.user_id = o.owner_user_id
      LEFT JOIN devices d
        ON d.organization_id = o.id
      LEFT JOIN sites s
        ON s.organization_id = o.id
      LEFT JOIN organization_members om
        ON om.organization_id = o.id
      LEFT JOIN organization_invitations oi
        ON oi.organization_id = o.id
      WHERE o.is_active = true
      GROUP BY o.id, owner.email, owner.plan, us.plan_key
      ORDER BY o.created_at ASC
    `)

    const roleDistribution = await query(client, `
      SELECT
        role,
        COUNT(*)::int AS count
      FROM organization_members
      WHERE is_active = true
      GROUP BY role
      ORDER BY role
    `)

    const orphanDevices = await query(client, `
      SELECT COUNT(*)::int AS count
      FROM devices
      WHERE is_active = true
        AND organization_id IS NULL
    `)

    const staleInvitations = await query(client, `
      SELECT COUNT(*)::int AS count
      FROM organization_invitations
      WHERE status = 'pending'
        AND expires_at < NOW()
    `)

    const auditRows = await query(client, `
      SELECT COUNT(*)::int AS count
      FROM organization_audit_logs
    `)

    const report = {
      generatedAt: new Date().toISOString(),
      target,
      summary: {
        organizationCount: organizations.length,
        orphanActiveDeviceCount: Number(orphanDevices[0]?.count || 0),
        stalePendingInvitationCount: Number(staleInvitations[0]?.count || 0),
        organizationAuditLogCount: Number(auditRows[0]?.count || 0),
      },
      roleDistribution,
      organizations,
    }

    const fileName = `phase7-tenant-report-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`
    const fullPath = path.join(reportsDir, fileName)

    fs.writeFileSync(fullPath, JSON.stringify(report, null, 2))

    console.log('Phase 7 tenant report')
    console.log(`Database: ${target.database_name}`)
    console.log(`Organizations: ${report.summary.organizationCount}`)
    console.log(`Orphan active devices: ${report.summary.orphanActiveDeviceCount}`)
    console.log(`Stale pending invitations: ${report.summary.stalePendingInvitationCount}`)
    console.log(`Organization audit logs: ${report.summary.organizationAuditLogCount}`)
    console.log(`Report: ${fullPath}`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Phase 7 tenant report failed:')
  console.error(error)
  process.exit(1)
})
