// Add these functions to dotwatch-dashboard/src/services/api.js

export function getOrganizations() {
  return apiFetch('/api/organizations')
}

export function createOrganization(data) {
  return apiFetch('/api/organizations', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function getOrganizationOverview(organizationId) {
  return apiFetch(`/api/organizations/${organizationId}/overview`)
}

export function getSites(organizationId) {
  const params = new URLSearchParams()

  if (organizationId) params.set('organizationId', String(organizationId))

  const query = params.toString()

  return apiFetch(`/api/sites${query ? `?${query}` : ''}`)
}

export function createSite(data) {
  return apiFetch('/api/sites', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateSite(id, data) {
  return apiFetch(`/api/sites/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function getDeviceGroups({ organizationId, siteId } = {}) {
  const params = new URLSearchParams()

  if (organizationId) params.set('organizationId', String(organizationId))
  if (siteId) params.set('siteId', String(siteId))

  const query = params.toString()

  return apiFetch(`/api/device-groups${query ? `?${query}` : ''}`)
}

export function createDeviceGroup(data) {
  return apiFetch('/api/device-groups', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateDeviceGroup(id, data) {
  return apiFetch(`/api/device-groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}
