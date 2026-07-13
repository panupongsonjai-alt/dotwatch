import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDeviceMetrics,
  saveDeviceMetrics,
  resetDeviceMetrics,
} from '../services/metricDisplayApi'
import { showErrorToast, showSuccessToast } from '../utils/uiFeedback'

import {
  DEFAULT_METRICS,
  normalizeMetrics,
  prepareMetricsForSave,
} from '../utils/metricDisplayConfig'

export function useDeviceMetrics(deviceId) {
  const hookInstanceIdRef = useRef(
    `metric-hook-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  const requestVersionRef = useRef(0)
  const [metrics, setMetrics] = useState([])
  const [draftMetrics, setDraftMetrics] = useState([])
  const [settings, setSettings] = useState({ record_interval_seconds: 10 })
  const [draftSettings, setDraftSettings] = useState({
    record_interval_seconds: 10,
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadMetrics = useCallback(async () => {
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion

    if (!deviceId) {
      setMetrics([])
      setDraftMetrics([])
      setSettings({ record_interval_seconds: 10 })
      setDraftSettings({ record_interval_seconds: 10 })
      return
    }

    try {
      setLoading(true)
      setMessage('')
      setMetrics([])
      setDraftMetrics([])

      const data = await getDeviceMetrics(deviceId)

      if (requestVersion !== requestVersionRef.current) return

      const nextMetrics = normalizeMetrics(
        data?.metrics || data || DEFAULT_METRICS
      )
      const nextSettings = {
        record_interval_seconds: Number(
          data?.settings?.record_interval_seconds || 10
        ),
      }

      setMetrics(nextMetrics)
      setDraftMetrics(nextMetrics)
      setSettings(nextSettings)
      setDraftSettings(nextSettings)
    } catch (error) {
      if (requestVersion !== requestVersionRef.current) return

      console.error(error)
      const errorMessage = error.message || 'Load metrics failed'
      setMessage(errorMessage)
      showErrorToast(errorMessage)
      setMetrics([])
      setDraftMetrics([])
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false)
      }
    }
  }, [deviceId])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    function handleMetricConfigChanged(event) {
      const changedDeviceId = event?.detail?.deviceId
      const eventSource = event?.detail?.source

      if (eventSource === hookInstanceIdRef.current) return

      if (
        changedDeviceId != null &&
        String(changedDeviceId) !== String(deviceId)
      ) {
        return
      }

      loadMetrics()
    }

    window.addEventListener(
      'dotwatchMetricConfigChanged',
      handleMetricConfigChanged
    )

    return () => {
      window.removeEventListener(
        'dotwatchMetricConfigChanged',
        handleMetricConfigChanged
      )
    }
  }, [deviceId, loadMetrics])

  async function saveDraftMetrics(nextDraft = draftMetrics) {
    if (!deviceId) return false

    try {
      setSaving(true)
      setMessage('')

      const normalized = prepareMetricsForSave(nextDraft)

      const data = await saveDeviceMetrics(deviceId, normalized)

      const savedMetrics = normalizeMetrics(data?.metrics || normalized)
      const savedSettings = {
        record_interval_seconds: Number(
          data?.settings?.record_interval_seconds ||
            settings.record_interval_seconds ||
            10
        ),
      }

      setMetrics(savedMetrics)
      setDraftMetrics(savedMetrics)
      setSettings(savedSettings)
      setDraftSettings(savedSettings)

      setMessage('Saved')

      window.dispatchEvent(
        new CustomEvent('dotwatchMetricConfigChanged', {
          detail: {
            deviceId,
            source: hookInstanceIdRef.current,
          },
        })
      )

      return true
    } catch (error) {
      console.error(error)

      const errorMessage = error.message || 'Save metrics failed'
      setMessage(errorMessage)
      showErrorToast(errorMessage)

      return false
    } finally {
      setSaving(false)
    }
  }

  async function resetMetrics() {
    if (!deviceId) return

    try {
      setSaving(true)

      const data = await resetDeviceMetrics(deviceId)

      const nextMetrics = normalizeMetrics(data?.metrics || DEFAULT_METRICS)
      const nextSettings = {
        record_interval_seconds: Number(
          data?.settings?.record_interval_seconds ||
            draftSettings.record_interval_seconds ||
            10
        ),
      }

      setMetrics(nextMetrics)
      setDraftMetrics(nextMetrics)
      setSettings(nextSettings)
      setDraftSettings(nextSettings)

      setMessage('Reset complete')
      showSuccessToast('Metric settings reset complete')

      window.dispatchEvent(
        new CustomEvent('dotwatchMetricConfigChanged', {
          detail: {
            deviceId,
            source: hookInstanceIdRef.current,
          },
        })
      )
    } catch (error) {
      console.error(error)

      const errorMessage = error.message || 'Reset metrics failed'
      setMessage(errorMessage)
      showErrorToast(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  return {
    metrics,
    draftMetrics,
    setDraftMetrics,
    settings,
    draftSettings,
    setDraftSettings,
    loading,
    saving,
    message,
    loadMetrics,
    saveDraftMetrics,
    resetMetrics,
  }
}
