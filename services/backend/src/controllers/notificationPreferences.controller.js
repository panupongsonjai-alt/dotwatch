import { z } from 'zod'

import { pool } from '../db/pool.js'
import {
  getNotificationProviderStatus,
  sendTestChannelNotification,
} from '../services/alarmNotification.service.js'

const preferenceSchema = z.object({
  lineEnabled: z.boolean().default(false),
  lineTargetId: z.string().trim().max(128).default(''),
  emailEnabled: z.boolean().default(false),
  emailAddress: z.union([z.string().trim().email(), z.literal('')]).default(''),
  notifyOnTrigger: z.boolean().default(true),
  notifyOnRecovery: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.lineEnabled && !value.lineTargetId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lineTargetId'], message: 'LINE target ID is required' })
  }
})

export async function getNotificationPreferences(req, res) {
  const result = await pool.query(
    `SELECT
      COALESCE(np.line_enabled, FALSE) AS line_enabled,
      COALESCE(np.line_target_id, '') AS line_target_id,
      COALESCE(np.email_enabled, FALSE) AS email_enabled,
      COALESCE(np.email_address, '') AS email_address,
      COALESCE(np.notify_on_trigger, TRUE) AS notify_on_trigger,
      COALESCE(np.notify_on_recovery, TRUE) AS notify_on_recovery,
      COALESCE(u.email, '') AS account_email
    FROM users u
    LEFT JOIN notification_preferences np ON np.user_id = u.id
    WHERE u.id = $1`,
    [req.dbUser.id]
  )
  const row = result.rows[0]
  res.json({
    lineEnabled: row.line_enabled,
    lineTargetId: row.line_target_id,
    emailEnabled: row.email_enabled,
    emailAddress: row.email_address,
    accountEmail: row.account_email,
    notifyOnTrigger: row.notify_on_trigger,
    notifyOnRecovery: row.notify_on_recovery,
    providers: getNotificationProviderStatus(),
  })
}

export async function updateNotificationPreferences(req, res) {
  const input = preferenceSchema.parse(req.body || {})
  await pool.query(
    `INSERT INTO notification_preferences (
      user_id, line_enabled, line_target_id, email_enabled, email_address,
      notify_on_trigger, notify_on_recovery, updated_at
    ) VALUES ($1, $2, NULLIF($3, ''), $4, NULLIF($5, ''), $6, $7, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      line_enabled = EXCLUDED.line_enabled,
      line_target_id = EXCLUDED.line_target_id,
      email_enabled = EXCLUDED.email_enabled,
      email_address = EXCLUDED.email_address,
      notify_on_trigger = EXCLUDED.notify_on_trigger,
      notify_on_recovery = EXCLUDED.notify_on_recovery,
      updated_at = NOW()`,
    [req.dbUser.id, input.lineEnabled, input.lineTargetId, input.emailEnabled,
      input.emailAddress, input.notifyOnTrigger, input.notifyOnRecovery]
  )
  res.json({ saved: true })
}

export async function testNotificationChannel(req, res) {
  const { channel } = z.object({ channel: z.enum(['line', 'email']) }).parse(req.body || {})
  res.json(await sendTestChannelNotification({ userId: req.dbUser.id, channel }))
}
