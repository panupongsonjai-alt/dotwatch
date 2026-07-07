import { createContext, useContext, useMemo, useState } from 'react'

const AlarmContext = createContext()

export function AlarmProvider({ children }) {
  const [alarms, setAlarms] = useState([])

  function addAlarm(alarm) {
    if (alarm.severity === 'critical') {
      alert(`🚨 Critical Alarm\n\n${alarm.metric}\nValue: ${alarm.value}`)
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
