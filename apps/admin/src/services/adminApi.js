import { auth } from './firebase'
import {
  MOCK_ADMIN_DEVICES,
  MOCK_ADMIN_PLANS,
  MOCK_ADMIN_USERS,
  MOCK_AUDIT_LOGS,
} from '../data/adminMockData'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const USE_MOCK_ADMIN_API = import.meta.env.VITE_USE_MOCK_ADMIN_API === 'true'

async function delay(ms = 200) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function getToken() {
  const user = auth.currentUser

  if (!user) {
    throw new Error('Admin user not logged in')
  }

  return user.getIdToken()
}

async function adminFetch(path, options = {}) {
  const token = await getToken()

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })

  const text = await response.text()

  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { message: text }
  }

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || `Admin API failed: ${response.status}`
    )
  }

  return data
}

export async function getAdminMe() {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)

    return {
      id: 999,
      email: auth.currentUser?.email || 'admin@dotwatch.local',
      name: 'Super Admin',
      role: 'super_admin',
      status: 'active',
    }
  }

  return adminFetch('/api/admin/me')
}

export async function getAdminStats() {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)

    const totalUsers = MOCK_ADMIN_USERS.length
    const activeUsers = MOCK_ADMIN_USERS.filter(
      (user) => user.status === 'active'
    ).length
    const overdueUsers = MOCK_ADMIN_USERS.filter(
      (user) => user.status === 'overdue'
    ).length
    const suspendedUsers = MOCK_ADMIN_USERS.filter(
      (user) => user.status === 'suspended'
    ).length
    const totalDevices = MOCK_ADMIN_DEVICES.length
    const onlineDevices = MOCK_ADMIN_DEVICES.filter(
      (device) => device.status === 'online'
    ).length
    const offlineDevices = MOCK_ADMIN_DEVICES.filter(
      (device) => device.status === 'offline'
    ).length

    return {
      totalUsers,
      activeUsers,
      overdueUsers,
      suspendedUsers,
      totalDevices,
      onlineDevices,
      offlineDevices,
    }
  }

  return adminFetch('/api/admin/stats')
}

export async function getAdminCommercialSummary() {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)

    return {
      plans: MOCK_ADMIN_PLANS.map((plan) => ({
        ...plan,
        subscriberCount: MOCK_ADMIN_USERS.filter(
          (user) => user.plan === plan.planKey
        ).length,
      })),
      usage: {
        usersAtDeviceLimit: 0,
        usersNearDeviceLimit: 1,
        totalAssignedDevices: MOCK_ADMIN_USERS.reduce(
          (sum, user) => sum + Number(user.deviceCount || 0),
          0
        ),
        totalDeviceCapacity: MOCK_ADMIN_USERS.reduce(
          (sum, user) => sum + Number(user.deviceLimit || 0),
          0
        ),
      },
      subscriptionsByStatus: [{ status: 'active', count: MOCK_ADMIN_USERS.length }],
    }
  }

  return adminFetch('/api/admin/commercial-summary')
}

export async function getAdminPlans() {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)
    return MOCK_ADMIN_PLANS
  }

  return adminFetch('/api/admin/plans')
}

export async function getAdminUsers() {
  if (USE_MOCK_ADMIN_API) {
    await delay()
    return MOCK_ADMIN_USERS
  }

  return adminFetch('/api/admin/users')
}

export async function getAdminDevices() {
  if (USE_MOCK_ADMIN_API) {
    await delay()
    return MOCK_ADMIN_DEVICES
  }

  return adminFetch('/api/admin/devices')
}

export async function getAdminAuditLogs() {
  if (USE_MOCK_ADMIN_API) {
    await delay()
    return MOCK_AUDIT_LOGS
  }

  return adminFetch('/api/admin/audit-logs')
}

export async function updateAdminUserStatus(userId, status) {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)

    const user = MOCK_ADMIN_USERS.find(
      (item) => String(item.id) === String(userId)
    )

    return {
      ...user,
      status,
    }
  }

  return adminFetch(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function updateAdminUserPlan(userId, data) {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)

    const user = MOCK_ADMIN_USERS.find(
      (item) => String(item.id) === String(userId)
    )
    const plan = MOCK_ADMIN_PLANS.find((item) => item.planKey === data.plan)

    return {
      ...user,
      ...data,
      plan: data.plan,
      deviceLimit: data.deviceLimit ?? plan?.deviceLimit ?? user?.deviceLimit,
      siteLimit: plan?.siteLimit ?? user?.siteLimit,
      userLimit: plan?.userLimit ?? user?.userLimit,
      retentionDays: plan?.retentionDays ?? user?.retentionDays,
    }
  }

  return adminFetch(`/api/admin/users/${userId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
