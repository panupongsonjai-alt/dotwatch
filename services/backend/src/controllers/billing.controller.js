import {
  ensureUserSubscription,
  getPlanDefinitions,
  getUserUsage,
} from '../services/commercial.service.js'

export async function listPlans(req, res) {
  const plans = await getPlanDefinitions({
    includeInactive: false,
  })

  res.json(plans)
}

export async function getMyBillingSummary(req, res) {
  const user = req.dbUser

  await ensureUserSubscription({
    userId: user.id,
    planKey: user.plan || 'free',
  })

  const usage = await getUserUsage({ userId: user.id })
  const plans = await getPlanDefinitions({ includeInactive: false })

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.display_name || user.email || 'User',
      role: user.role || 'user',
      status: user.status || 'active',
      plan: user.plan || 'free',
    },
    usage,
    plans,
  })
}
