import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Client } = pg
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const isRenderDb =
  databaseUrl.includes('render.com') || databaseUrl.includes('render.internal')

const client = new Client({
  connectionString: databaseUrl,
  ssl: isRenderDb ? { rejectUnauthorized: false } : false,
})

async function query(label, sql) {
  try {
    const result = await client.query(sql)
    console.log(`\n=== ${label} ===`)
    console.table(result.rows)
  } catch (error) {
    console.log(`\n=== ${label} ===`)
    console.warn(`Skipped: ${error.message}`)
  }
}

try {
  await client.connect()

  await query(
    'Plans',
    `
    SELECT
      pd.plan_key,
      pd.plan_name,
      pd.device_limit,
      pd.site_limit,
      pd.user_limit,
      pd.retention_days,
      COUNT(us.user_id)::int AS subscribers
    FROM plan_definitions pd
    LEFT JOIN user_subscriptions us ON us.plan_key = pd.plan_key
    GROUP BY pd.plan_key
    ORDER BY pd.sort_order ASC, pd.plan_key ASC
    `
  )

  await query(
    'Subscription Status',
    `
    SELECT status, COUNT(*)::int AS count
    FROM user_subscriptions
    GROUP BY status
    ORDER BY status ASC
    `
  )

  await query(
    'Device Limit Usage',
    `
    SELECT
      u.id,
      u.email,
      COALESCE(us.plan_key, u.plan, 'free') AS plan,
      COALESCE(pd.device_limit, u.device_limit, 3)::int AS device_limit,
      COUNT(d.id)::int AS device_count,
      ROUND(
        CASE
          WHEN COALESCE(pd.device_limit, u.device_limit, 3) > 0
          THEN COUNT(d.id)::numeric / COALESCE(pd.device_limit, u.device_limit, 3)::numeric * 100
          ELSE 0
        END,
        1
      ) AS usage_percent
    FROM users u
    LEFT JOIN user_subscriptions us ON us.user_id = u.id
    LEFT JOIN plan_definitions pd ON pd.plan_key = COALESCE(us.plan_key, u.plan, 'free')
    LEFT JOIN devices d ON d.user_id = u.id AND d.is_active = true
    GROUP BY u.id, us.plan_key, pd.device_limit
    ORDER BY usage_percent DESC, device_count DESC
    LIMIT 25
    `
  )

  await query(
    'Organization Summary',
    `
    SELECT
      COUNT(*)::int AS organizations,
      COALESCE(SUM(site_count), 0)::int AS sites,
      COALESCE(SUM(member_count), 0)::int AS members
    FROM (
      SELECT
        o.id,
        COUNT(DISTINCT s.id)::int AS site_count,
        COUNT(DISTINCT om.user_id)::int AS member_count
      FROM organizations o
      LEFT JOIN sites s ON s.organization_id = o.id AND s.is_active = true
      LEFT JOIN organization_members om ON om.organization_id = o.id AND om.is_active = true
      WHERE o.is_active = true
      GROUP BY o.id
    ) summary
    `
  )

  await query(
    'Pending Invitations',
    `
    SELECT
      o.name AS organization,
      oi.email,
      oi.role,
      oi.expires_at
    FROM organization_invitations oi
    JOIN organizations o ON o.id = oi.organization_id
    WHERE oi.status = 'pending'
    ORDER BY oi.created_at DESC
    LIMIT 25
    `
  )
} finally {
  await client.end()
}
