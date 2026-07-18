import { useMemo, useState } from 'react'
import LoadingState from '../components/common/LoadingState'
import StatCard from '../components/common/StatCard'
import StatusBadge from '../components/common/StatusBadge'
import UsageBar from '../components/common/UsageBar'
import UnifiedSelect from '../components/common/UnifiedSelect'

function getPlanLimit(plans, planKey) {
  return plans.find((plan) => plan.planKey === planKey)?.deviceLimit
}

function AdminSubscriptions({
  users,
  loading,
  plans = [],
  commercialSummary,
  onUpdateUserPlan,
}) {
  const [pendingPlans, setPendingPlans] = useState({})

  const activePlans = useMemo(() => {
    return plans.filter((plan) => plan.isActive !== false)
  }, [plans])

  function updatePendingPlan(userId, planKey) {
    setPendingPlans((current) => ({
      ...current,
      [userId]: planKey,
    }))
  }

  async function applyPlan(user) {
    const nextPlan = pendingPlans[user.id] || user.plan
    const deviceLimit = getPlanLimit(activePlans, nextPlan)

    await onUpdateUserPlan?.(user.id, {
      plan: nextPlan,
      deviceLimit,
      status: user.status || 'active',
    })

    setPendingPlans((current) => {
      const next = { ...current }
      delete next[user.id]
      return next
    })
  }

  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Billing control</p>
          <h2>Subscriptions</h2>
          <span>Manage commercial plans, limits, and customer capacity.</span>
        </div>
      </div>

      {commercialSummary?.usage ? (
        <div className="admin-stat-grid compact">
          <StatCard
            label="Assigned Devices"
            value={commercialSummary.usage.totalAssignedDevices || 0}
            hint="Currently assigned"
          />
          <StatCard
            label="Device Capacity"
            value={commercialSummary.usage.totalDeviceCapacity || 0}
            hint="Available plan capacity"
          />
          <StatCard
            label="Near Limit"
            value={commercialSummary.usage.usersNearDeviceLimit || 0}
            hint="Accounts approaching limit"
            tone="warning"
          />
          <StatCard
            label="At Limit"
            value={commercialSummary.usage.usersAtDeviceLimit || 0}
            hint="Accounts at capacity"
            tone="danger"
          />
        </div>
      ) : null}

      <article className="admin-panel">
        {loading ? (
          <LoadingState title="Loading subscriptions..." />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Device Usage</th>
                  <th>Site Usage</th>
                  <th>Renewal</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => {
                  const selectedPlan = pendingPlans[user.id] || user.plan
                  const changed = selectedPlan !== user.plan

                  return (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </td>
                      <td>
                        <UnifiedSelect
                          value={selectedPlan}
                          onChange={(event) =>
                            updatePendingPlan(user.id, event.target.value)
                          }
                        >
                          {activePlans.map((plan) => (
                            <option key={plan.planKey} value={plan.planKey}>
                              {plan.planName || plan.planKey}
                            </option>
                          ))}
                        </UnifiedSelect>
                      </td>
                      <td>
                        <StatusBadge status={user.status} />
                      </td>
                      <td>
                        <UsageBar user={user} />
                      </td>
                      <td>
                        {user.siteCount || 0}/{user.siteLimit || '-'}
                      </td>
                      <td>{user.renewalAt}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            disabled={!changed}
                            onClick={() => applyPlan(user)}
                          >
                            Apply
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}

export default AdminSubscriptions
