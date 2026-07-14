import { createContext, useContext, useMemo, useState } from 'react'
import { showUiToast } from '../utils/uiFeedback'
import { formatMetricValue } from '../utils/metricDisplayConfig'

const AlarmContext = createContext()

export function AlarmProvider({ children }) {
  const [alarms, setAlarms] = useState([])

  function addAlarm(alarm) {
    if (alarm.severity === 'critical') {
      const notificationMessage = String(
        alarm.notification_message || ''
      ).trim()
      showUiToast({
        type: 'critical',
        title: 'Critical Alarm',
        message:
          notificationMessage ||
          `${alarm.metric || 'Value'} • Value: ${formatMetricValue(
            alarm.value,
            alarm.unit,
            alarm.decimal_places
          )}`,
        duration: 8000,
        dedupeKey: `critical|${alarm.id || alarm.metric}|${alarm.value}`,
      })
    }

    setAlarms((prev) =>
      [
        {
          id: alarm.id || Date.now() + Math.random(),
          ...alarm,
        },
        ...prev,
      ].slice(0, 50)
    )
  }

  function clearAlarms() {
    setAlarms([])
  }

  function removeAlarm(id) {
    setAlarms((prev) => prev.filter((alarm) => alarm.id !== id))
  }

  function acknowledgeAlarmLocal(id) {
    setAlarms((prev) =>
      prev.map((alarm) =>
        alarm.id === id
          ? {
              ...alarm,
              status: 'acknowledged',
              acknowledged_at: new Date().toISOString(),
            }
          : alarm
      )
    )
  }

  const activeAlarmCount = useMemo(() => {
    return alarms.filter((alarm) => alarm.status !== 'acknowledged').length
  }, [alarms])

  return (
    <AlarmContext.Provider
      value={{
        alarms,
        addAlarm,
        clearAlarms,
        removeAlarm,
        acknowledgeAlarmLocal,
        activeAlarmCount,
      }}
    >
      {children}
    </AlarmContext.Provider>
  )
}

export function useAlarm() {
  return useContext(AlarmContext)
}
