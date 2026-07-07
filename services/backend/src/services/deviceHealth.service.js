export function getDeviceHealthStatus(device = {}) {
  const currentStatus = device.status || 'offline'
  const criticalCount = Number(device.alarm_critical_count || 0)
  const warningCount = Number(device.alarm_warning_count || 0)

  if (currentStatus === 'offline') {
    return {
      health_status: 'offline',
      health_reason: 'No recent data',
    }
  }

  if (criticalCount > 0) {
    return {
      health_status: 'critical',
      health_reason: `${criticalCount} critical alarm${criticalCount > 1 ? 's' : ''}`,
    }
  }

  if (warningCount > 0 || currentStatus === 'warning') {
    return {
      health_status: 'warning',
      health_reason:
        warningCount > 0
          ? `${warningCount} warning alarm${warningCount > 1 ? 's' : ''}`
          : 'Device requires attention',
    }
  }

  return {
    health_status: 'healthy',
    health_reason: 'Operating normally',
  }
}

export function getHealthRank(healthStatus = 'offline') {
  if (healthStatus === 'critical') return 3
  if (healthStatus === 'warning') return 2
  if (healthStatus === 'healthy') return 1
  return 0
}
