import { useCallback, useEffect, useState } from 'react'
import {
  getDeviceMetrics,
  saveDeviceMetrics,
  resetDeviceMetrics,
} from '../services/metricDisplayApi'

import {
  DEFAULT_METRICS,
  normalizeMetrics,
  prepareMetricsForSave,
} from '../utils/metricDisplayConfig'

export function useDeviceMetrics(deviceId) {
  const [metrics, setMetrics] = useState(DEFAULT_METRICS)
  const [draftMetrics, setDraftMetrics] = useState(DEFAULT_METRICS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadMetrics = useCallback(async () => {
    if (!deviceId) return

    try {
      setLoading(true)
      setMessage('')

      const data = await getDeviceMetrics(deviceId)

      const nextMetrics = normalizeMetrics(
        data?.metrics || data || DEFAULT_METRICS
      )

      setMetrics(nextMetrics)
      setDraftMetrics(nextMetrics)
    } catch (error) {
      console.error(error)

      setMessage(error.message || 'Load metrics failed')

      setMetrics(DEFAULT_METRICS)
      setDraftMetrics(DEFAULT_METRICS)
    } finally {
      setLoading(false)
    }
  }, [deviceId])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  async function saveDraftMetrics(nextDraft = draftMetrics) {
    if (!deviceId) return false

    try {
      setSaving(true)
      setMessage('')

      const normalized = prepareMetricsForSave(nextDraft)

      const data = await saveDeviceMetrics(deviceId, normalized)

      const savedMetrics = normalizeMetrics(data?.metrics || normalized)

      setMetrics(savedMetrics)
      setDraftMetrics(savedMetrics)

      setMessage('Saved')

      window.dispatchEvent(new CustomEvent('dotwatchMetricConfigChanged'))

      return true
    } catch (error) {
      console.error(error)

      setMessage(error.message || 'Save metrics failed')

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

      setMetrics(nextMetrics)
      setDraftMetrics(nextMetrics)

      setMessage('Reset complete')

      window.dispatchEvent(new CustomEvent('dotwatchMetricConfigChanged'))
    } catch (error) {
      console.error(error)

      setMessage(error.message || 'Reset metrics failed')
    } finally {
      setSaving(false)
    }
  }

  return {
    metrics,
    draftMetrics,
    setDraftMetrics,
    loading,
    saving,
    message,
    loadMetrics,
    saveDraftMetrics,
    resetMetrics,
  }
}
