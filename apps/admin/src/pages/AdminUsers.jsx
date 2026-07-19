import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Database,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import LoadingState from '../components/common/LoadingState'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import StatusBadge from '../components/common/StatusBadge'
import UnifiedSelect from '../components/common/UnifiedSelect'
import UsageBar from '../components/common/UsageBar'
import { formatDatabaseUsageGb } from '../utils/formatters'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function formatPlanName(planKey, plans) {
  const plan = plans.find((item) => item.planKey === planKey)
  return plan?.planName || planKey || 'Unassigned'
}

function getInitials(user) {
  const source = user?.name || user?.email || 'User'
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function UserAvatar({ user }) {
  return (
    <span className="admin-user-avatar" aria-hidden="true">
      {getInitials(user)}
    </span>
  )
}

function UserIdentity({ user }) {
  return (
    <div className="admin-user-identity">
      <UserAvatar user={user} />
      <div>
        <strong>{user.name || 'Unnamed user'}</strong>
        <span>{user.email || 'No email address'}</span>
      </div>
    </div>
  )
}

function AdminUsers({
  users = [],
  plans = [],
  loading,
  onUpdateUserStatus,
  onUpdateUserPlan,
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [pendingPlan, setPendingPlan] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.isActive !== false),
    [plans]
  )

  const availablePlanKeys = useMemo(() => {
    const keys = new Set(activePlans.map((plan) => plan.planKey))
    users.forEach((user) => {
      if (user.plan) keys.add(user.plan)
    })
    return Array.from(keys).filter(Boolean).sort()
  }, [activePlans, users])

  const summary = useMemo(() => {
    return users.reduce(
      (result, user) => {
        result.total += 1
        if (user.status === 'active') result.active += 1
        if (user.status === 'suspended') result.suspended += 1
        if (user.status === 'overdue') result.overdue += 1
        result.databaseBytes += Number(user.databaseUsageBytes || 0)
        return result
      },
      {
        total: 0,
        active: 0,
        suspended: 0,
        overdue: 0,
        databaseBytes: 0,
      }
    )
  }, [users])

  const filteredUsers = useMemo(() => {
    const normalizedQuery = normalizeText(query)

    return users
      .filter((user) => {
        const matchedQuery = [
          user.name,
          user.email,
          user.plan,
          user.role,
          user.status,
        ]
          .map(normalizeText)
          .join(' ')
          .includes(normalizedQuery)

        const matchedStatus =
          statusFilter === 'all' || user.status === statusFilter
        const matchedPlan = planFilter === 'all' || user.plan === planFilter

        return matchedQuery && matchedStatus && matchedPlan
      })
      .sort((left, right) => {
        if (sortOrder === 'oldest') {
          return String(left.createdAt || '').localeCompare(
            String(right.createdAt || '')
          )
        }

        if (sortOrder === 'name') {
          return String(left.name || left.email || '').localeCompare(
            String(right.name || right.email || '')
          )
        }

        if (sortOrder === 'database') {
          return (
            Number(right.databaseUsageBytes || 0) -
            Number(left.databaseUsageBytes || 0)
          )
        }

        if (sortOrder === 'devices') {
          return Number(right.deviceCount || 0) - Number(left.deviceCount || 0)
        }

        return String(right.createdAt || '').localeCompare(
          String(left.createdAt || '')
        )
      })
  }, [planFilter, query, sortOrder, statusFilter, users])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const firstRecord = filteredUsers.length
    ? (safePage - 1) * pageSize + 1
    : 0
  const lastRecord = Math.min(safePage * pageSize, filteredUsers.length)
  const paginatedUsers = filteredUsers.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  )

  const selectedUser = useMemo(
    () =>
      users.find((user) => String(user.id) === String(selectedUserId)) || null,
    [selectedUserId, users]
  )

  useEffect(() => {
    if (!selectedUserId) return undefined

    function handleEscape(event) {
      if (event.key === 'Escape') setSelectedUserId(null)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [selectedUserId])

  function openUser(user) {
    setSelectedUserId(user.id)
    setPendingPlan(user.plan || '')
  }

  async function changeUserStatus(user, nextStatus) {
    if (!onUpdateUserStatus || savingStatus) return

    if (
      nextStatus === 'suspended' &&
      !window.confirm(
        `Suspend ${user.name || user.email}? The account will remain stored but access will be blocked.`
      )
    ) {
      return
    }

    try {
      setSavingStatus(true)
      await onUpdateUserStatus(user.id, nextStatus)
    } finally {
      setSavingStatus(false)
    }
  }

  async function applyPlan() {
    if (
      !selectedUser ||
      !onUpdateUserPlan ||
      !pendingPlan ||
      pendingPlan === selectedUser.plan ||
      savingPlan
    ) {
      return
    }

    const plan = activePlans.find((item) => item.planKey === pendingPlan)

    try {
      setSavingPlan(true)
      await onUpdateUserPlan(selectedUser.id, {
        plan: pendingPlan,
        deviceLimit: plan?.deviceLimit ?? selectedUser.deviceLimit,
        status: selectedUser.status || 'active',
      })
    } finally {
      setSavingPlan(false)
    }
  }

  return (
    <section className="admin-page admin-users-page">
      <PageHeader
        eyebrow="Account Control"
        title="Users"
        description="Search, review, and manage customer accounts, capacity, plans, and database usage."
        meta={`${filteredUsers.length} of ${users.length} accounts`}
      />

      <div className="admin-stat-grid admin-users-stat-grid">
        <StatCard
          label="Total Users"
          value={summary.total}
          hint="All registered accounts"
        />
        <StatCard
          label="Active"
          value={summary.active}
          hint="Accounts with access"
          tone="success"
        />
        <StatCard
          label="Needs Attention"
          value={summary.suspended + summary.overdue}
          hint={`${summary.suspended} suspended · ${summary.overdue} overdue`}
          tone={summary.suspended + summary.overdue > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Database Usage"
          value={formatDatabaseUsageGb(summary.databaseBytes)}
          hint="Logical usage across users"
          tone="info"
        />
      </div>

      <article className="admin-panel admin-users-workspace">
        <div className="admin-users-toolbar">
          <label className="admin-users-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search name, email, plan, role..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setCurrentPage(1)
              }}
              aria-label="Search users"
            />
          </label>

          <div className="admin-users-filters">
            <UnifiedSelect
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value)
                setCurrentPage(1)
              }}
              aria-label="Filter users by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="overdue">Overdue</option>
              <option value="suspended">Suspended</option>
            </UnifiedSelect>

            <UnifiedSelect
              value={planFilter}
              onChange={(event) => {
                setPlanFilter(event.target.value)
                setCurrentPage(1)
              }}
              aria-label="Filter users by plan"
            >
              <option value="all">All plans</option>
              {availablePlanKeys.map((planKey) => (
                <option key={planKey} value={planKey}>
                  {formatPlanName(planKey, activePlans)}
                </option>
              ))}
            </UnifiedSelect>

            <UnifiedSelect
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value)
                setCurrentPage(1)
              }}
              aria-label="Sort users"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
              <option value="devices">Most devices</option>
              <option value="database">Highest database usage</option>
            </UnifiedSelect>

            <UnifiedSelect
              value={String(pageSize)}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setCurrentPage(1)
              }}
              aria-label="Users per page"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} rows
                </option>
              ))}
            </UnifiedSelect>
          </div>
        </div>

        {loading ? (
          <LoadingState title="Loading users..." />
        ) : paginatedUsers.length === 0 ? (
          <div className="admin-users-empty">
            <UsersRound size={36} aria-hidden="true" />
            <strong>No users match the current filters</strong>
            <span>Clear the search or select a different status or plan.</span>
          </div>
        ) : (
          <>
            <div className="admin-users-table-wrap">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Status</th>
                    <th>Plan</th>
                    <th>Device Usage</th>
                    <th>Database Usage</th>
                    <th>Last Activity</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <UserIdentity user={user} />
                      </td>
                      <td>
                        <StatusBadge status={user.status} />
                      </td>
                      <td>
                        <strong className="admin-users-plan">
                          {formatPlanName(user.plan, activePlans)}
                        </strong>
                        <span>{user.role || 'user'}</span>
                      </td>
                      <td>
                        <UsageBar user={user} />
                      </td>
                      <td>
                        <strong className="admin-database-usage-value">
                          {user.databaseUsagePending
                            ? 'Calculating...'
                            : formatDatabaseUsageGb(user.databaseUsageBytes)}
                        </strong>
                        <span>
                          {user.databaseUsagePending
                            ? 'Snapshot pending'
                            : `Updated ${user.databaseUsageCalculatedAt || '-'}`}
                        </span>
                      </td>
                      <td>
                        <strong>{user.lastLoginAt || 'Never'}</strong>
                        <span>Created {user.createdAt || '-'}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="admin-users-view-button"
                          onClick={() => openUser(user)}
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-users-mobile-list">
              {paginatedUsers.map((user) => (
                <article className="admin-user-mobile-card" key={user.id}>
                  <div className="admin-user-mobile-header">
                    <UserIdentity user={user} />
                    <StatusBadge status={user.status} size="sm" />
                  </div>

                  <div className="admin-user-mobile-grid">
                    <div>
                      <span>Plan</span>
                      <strong>{formatPlanName(user.plan, activePlans)}</strong>
                    </div>
                    <div>
                      <span>Database</span>
                      <strong>
                        {user.databaseUsagePending
                          ? 'Calculating...'
                          : formatDatabaseUsageGb(user.databaseUsageBytes)}
                      </strong>
                    </div>
                  </div>

                  <UsageBar user={user} />

                  <button
                    type="button"
                    className="admin-users-view-button"
                    onClick={() => openUser(user)}
                  >
                    View details
                  </button>
                </article>
              ))}
            </div>

            <footer className="admin-users-pagination">
              <span>
                {firstRecord}-{lastRecord} of {filteredUsers.length}
              </span>
              <div>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <strong>
                  {safePage} / {totalPages}
                </strong>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                >
                  Next
                </button>
              </div>
            </footer>
          </>
        )}
      </article>

      {selectedUser ? (
        <div
          className="admin-user-drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedUserId(null)
          }}
        >
          <aside
            className="admin-user-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-user-drawer-title"
          >
            <header className="admin-user-drawer-header">
              <div className="admin-user-drawer-title">
                <UserAvatar user={selectedUser} />
                <div>
                  <span>USER DETAILS</span>
                  <h2 id="admin-user-drawer-title">
                    {selectedUser.name || selectedUser.email}
                  </h2>
                  <p>{selectedUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                className="admin-user-drawer-close"
                onClick={() => setSelectedUserId(null)}
                aria-label="Close user details"
              >
                <X size={20} />
              </button>
            </header>

            <div className="admin-user-drawer-body">
              <section className="admin-user-detail-status">
                <StatusBadge status={selectedUser.status} />
                <span>{selectedUser.role || 'user'}</span>
              </section>

              <section className="admin-user-detail-grid">
                <article>
                  <UserRound size={18} aria-hidden="true" />
                  <span>Account ID</span>
                  <strong>{selectedUser.id}</strong>
                </article>
                <article>
                  <CalendarDays size={18} aria-hidden="true" />
                  <span>Created</span>
                  <strong>{selectedUser.createdAt || '-'}</strong>
                </article>
                <article>
                  <ShieldCheck size={18} aria-hidden="true" />
                  <span>Last Login</span>
                  <strong>{selectedUser.lastLoginAt || 'Never'}</strong>
                </article>
                <article>
                  <Database size={18} aria-hidden="true" />
                  <span>Database Usage</span>
                  <strong>
                    {selectedUser.databaseUsagePending
                      ? 'Calculating...'
                      : formatDatabaseUsageGb(selectedUser.databaseUsageBytes)}
                  </strong>
                </article>
              </section>

              <section className="admin-user-detail-section">
                <div className="admin-user-detail-section-heading">
                  <div>
                    <span>CAPACITY</span>
                    <h3>Current usage</h3>
                  </div>
                </div>
                <UsageBar user={selectedUser} />
                <div className="admin-user-capacity-grid">
                  <div>
                    <span>Devices</span>
                    <strong>
                      {selectedUser.deviceCount || 0}/
                      {selectedUser.deviceLimit || '-'}
                    </strong>
                  </div>
                  <div>
                    <span>Sites</span>
                    <strong>
                      {selectedUser.siteCount || 0}/
                      {selectedUser.siteLimit || '-'}
                    </strong>
                  </div>
                  <div>
                    <span>Organizations</span>
                    <strong>{selectedUser.organizationCount || 0}</strong>
                  </div>
                  <div>
                    <span>Retention</span>
                    <strong>{selectedUser.retentionDays || '-'} days</strong>
                  </div>
                </div>
              </section>

              <section className="admin-user-detail-section">
                <div className="admin-user-detail-section-heading">
                  <div>
                    <span>SUBSCRIPTION</span>
                    <h3>Plan assignment</h3>
                  </div>
                </div>
                <div className="admin-user-plan-editor">
                  <UnifiedSelect
                    value={pendingPlan}
                    onChange={(event) => setPendingPlan(event.target.value)}
                    aria-label="User plan"
                  >
                    {availablePlanKeys.map((planKey) => (
                      <option key={planKey} value={planKey}>
                        {formatPlanName(planKey, activePlans)}
                      </option>
                    ))}
                  </UnifiedSelect>
                  <button
                    type="button"
                    disabled={
                      !pendingPlan ||
                      pendingPlan === selectedUser.plan ||
                      savingPlan
                    }
                    onClick={applyPlan}
                  >
                    {savingPlan ? 'Applying...' : 'Apply plan'}
                  </button>
                </div>
                <p>
                  Renewal: {selectedUser.renewalAt || '-'} · Database snapshot:{' '}
                  {selectedUser.databaseUsageCalculatedAt || 'pending'}
                </p>
              </section>
            </div>

            <footer className="admin-user-drawer-footer">
              {selectedUser.status === 'suspended' ? (
                <button
                  type="button"
                  className="success"
                  disabled={savingStatus}
                  onClick={() => changeUserStatus(selectedUser, 'active')}
                >
                  {savingStatus ? 'Updating...' : 'Activate account'}
                </button>
              ) : (
                <button
                  type="button"
                  className="danger"
                  disabled={savingStatus}
                  onClick={() => changeUserStatus(selectedUser, 'suspended')}
                >
                  {savingStatus ? 'Updating...' : 'Suspend account'}
                </button>
              )}
              <button type="button" onClick={() => setSelectedUserId(null)}>
                Close
              </button>
            </footer>
          </aside>
        </div>
      ) : null}
    </section>
  )
}

export default AdminUsers
