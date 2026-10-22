import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { showUiToast } from '../utils/uiFeedback'
import { formatMetricValue } from '../utils/metricDisplayConfig'

const AlarmContext = createContext()

export function AlarmProvider({ children }) {
  const [alarms, setAlarms] = useState([])

  const addAlarm = useCallback((alarm) => {
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
  }, [])

  const clearAlarms = useCallback(() => {
    setAlarms([])
  }, [])

  const removeAlarm = useCallback((id) => {
    setAlarms((prev) => prev.filter((alarm) => alarm.id !== id))
  }, [])

  const acknowledgeAlarmLocal = useCallback((id) => {
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
  }, [])

  const activeAlarmCount = useMemo(() => {
    return alarms.filter((alarm) => alarm.status !== 'acknowledged').length
  }, [alarms])

  // Stable value: consumers re-render only when alarms actually change,
  // not every time a parent (AuthProvider) re-renders.
  const value = useMemo(
    () => ({
      alarms,
      addAlarm,
      clearAlarms,
      removeAlarm,
      acknowledgeAlarmLocal,
      activeAlarmCount,
    }),
    [alarms, addAlarm, clearAlarms, removeAlarm, acknowledgeAlarmLocal, activeAlarmCount]
  )

  return (
    <AlarmContext.Provider value={value}>
      {children}
    </AlarmContext.Provider>
  )
}

export function useAlarm() {
  return useContext(AlarmContext)
}
