import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download } from 'lucide-react'
import { PageHeader } from '../components/common'

import {
  getDevices,
  getDeviceMetrics,
  getHistoryByDate,
} from '../services/api'
import '../styles/history.css'
import '../styles/page-system.css'

const TABLE_PAGE_SIZE = 100

const HISTORY_STATE_KEY = 'dotwatch.history.analytics.state'

function getSafeTablePage(value) {
  const page = Number(value)

  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

function getInitialHistoryState() {
  const fallback = {
    deviceId: '',
    date: todayInputValue(),
    metricKey: '',
    tablePage: 1,
    sortOrder: 'desc',
  }

  if (typeof window === 'undefined') return fallback

  try {
    const saved = JSON.parse(
      window.localStorage.getItem(HISTORY_STATE_KEY) || '{}'
    )

    const params = new URLSearchParams(window.location.search)

    return {
      deviceId:
        params.get('deviceId') ||
        params.get('device') ||
        saved.deviceId ||
        fallback.deviceId,
      date: params.get('date') || saved.date || fallback.date,
      metricKey:
        params.get('metricKey') ||
        params.get('metric') ||
        saved.metricKey ||
        fallback.metricKey,
      tablePage: getSafeTablePage(params.get('page') || saved.tablePage),
      sortOrder:
        params.get('sort') ||
        saved.sortOrder ||
        fallback.sortOrder,
    }
  } catch (error) {
    console.warn('History state restore failed:', error)
    return fallback
  }
}

function todayInputValue() {
  const now = new Date()
  const bangkokOffsetMs = 7 * 60 * 60 * 1000
  const bangkokDate = new Date(now.getTime() + bangkokOffsetMs)

  return bangkokDate.toISOString().slice(0, 10)
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.history)) return payload.history
  if (Array.isArray(payload?.readings)) return payload.readings

  return []
}

function getMetricIndex(metricKey = '') {
  return Number(String(metricKey).replace(/[^0-9]/g, '')) || 0
}

function getTime(item = {}) {
  return (
    item.time ||
    item.bucket_time ||
    item.bucketTime ||
    item.bucket ||
    item.created_at ||
    item.createdAt
  )
}

function getValue(item = {}) {
  const candidates = [
    item.value,
    item.avg_value,
    item.avgValue,
    item.max_value,
    item.maxValue,
    item.min_value,
    item.minValue,
  ]

  for (const candidate of candidates) {
    const numberValue = Number(candidate)

    if (
      candidate !== null &&
      candidate !== undefined &&
      candidate !== '' &&
      Number.isFinite(numberValue)
    ) {
      return numberValue
    }
  }

  return null
}

function formatDateTime(value) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) return '--'

  return date.toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

function formatChartLabel(value) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) return '--'

  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatNumber(value, unit = '') {
  if (value == null || !Number.isFinite(Number(value))) return '--'

  const numberValue = Number(value)
  const formatted = Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(2)

  return `${formatted}${unit ? ` ${unit}` : ''}`
}

function normalizeHistoryRows(payload) {
  return toArray(payload)
    .map((item, index) => {
      const time = getTime(item)
      const value = getValue(item)

      return {
        id: `${time || index}-${item.metric_key || item.metricKey || ''}`,
        time,
        label: formatChartLabel(time),
        metricKey: item.metric_key || item.metricKey,
        value,
        avgValue: Number(item.avg_value ?? item.avgValue ?? value),
        minValue: Number(item.min_value ?? item.minValue ?? value),
        maxValue: Number(item.max_value ?? item.maxValue ?? value),
        sampleCount: Number(item.sample_count ?? item.sampleCount ?? 1),
      }
    })
    .filter((row) => row.time && row.value != null)
    .sort((a, b) => new Date(a.time) - new Date(b.time))
}

function normalizeMetric(metric = {}) {
  const metricKey = metric.metric_key || metric.source_key || metric.key

  if (!metricKey) return null

  return {
    metricKey,
    metricName:
      metric.metric_name ||
      metric.name ||
      metric.label ||
      getFallbackMetricName(metricKey),
    unit: metric.unit || '',
    visible: metric.visible !== false,
    sortOrder: Number(metric.sort_order ?? 9999),
  }
}

function getFallbackMetricName(metricKey = '') {
  const index = getMetricIndex(metricKey)

  if (metricKey === 'temperature') return 'Temperature'
  if (metricKey === 'humidity') return 'Humidity'
  if (metricKey === 'rssi') return 'Signal'

  return index > 0 ? `Metric ${index}` : metricKey || 'Metric'
}

function getLatestMetrics(device = {}) {
  const latestMetrics = {
    ...(device.latest_metrics || device.metrics || {}),
  }

  if (device.temperature != null && latestMetrics.temperature == null) {
    latestMetrics.temperature = device.temperature
  }

  if (device.humidity != null && latestMetrics.humidity == null) {
    latestMetrics.humidity = device.humidity
  }

  if (device.rssi != null && latestMetrics.rssi == null) {
    latestMetrics.rssi = device.rssi
  }

  return latestMetrics
}

function metricsFromDeviceConfig(device = {}) {
  const metricLists = [
    device.metric_configs,
    device.metricConfigs,
    device.device_metrics,
    device.deviceMetrics,
    device.metrics_config,
    device.metricsConfig,
  ].filter(Array.isArray)

  if (!metricLists.length) return []

  return metricLists[0]
    .map(normalizeMetric)
    .filter(Boolean)
    .filter((metric) => metric.visible !== false)
}

function metricsFromLatest(device = {}) {
  return Object.keys(getLatestMetrics(device)).map((metricKey, index) => ({
    metricKey,
    metricName: getFallbackMetricName(metricKey),
    unit: '',
    visible: true,
    sortOrder: index,
  }))
}

function mergeMetrics(...groups) {
  const map = new Map()

  for (const group of groups) {
    for (const metric of group || []) {
      const normalized = normalizeMetric(metric) || metric

      if (!normalized?.metricKey || normalized.visible === false) continue

      const current = map.get(normalized.metricKey)

      map.set(normalized.metricKey, {
        ...normalized,
        metricName:
          current?.metricName && current.metricName !== normalized.metricKey
            ? current.metricName
            : normalized.metricName,
        unit: current?.unit || normalized.unit || '',
        sortOrder: Math.min(
          Number(current?.sortOrder ?? 9999),
          Number(normalized.sortOrder ?? 9999)
        ),
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return getMetricIndex(a.metricKey) - getMetricIndex(b.metricKey)
  })
}

function getStats(rows = []) {
  const values = rows
    .map((row) => row.value)
    .filter((value) => Number.isFinite(Number(value)))

  if (!values.length) {
    return {
      average: null,
      min: null,
      max: null,
    }
  }

  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

const HISTORY_CHART_COLORS = [
  '#06b6d4',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#84cc16',
  '#ec4899',
]

function getMetricColor(index = 0) {
  return HISTORY_CHART_COLORS[index % HISTORY_CHART_COLORS.length]
}

function buildChartData(rows = [], selectedMetricKey = '', metrics = []) {
  const sortedRows = [...rows].sort((a, b) => {
    const timeA = new Date(a.time).getTime()
    const timeB = new Date(b.time).getTime()

    if (Number.isNaN(timeA) || Number.isNaN(timeB)) return 0

    return timeA - timeB
  })

  if (selectedMetricKey !== 'all') {
    return sortedRows.map((row) => ({
      ...row,
      value: row.value,
    }))
  }

  const map = new Map()

  for (const row of sortedRows) {
    if (!row.time || !row.metricKey) continue

    const existing =
      map.get(row.time) ||
      {
        id: row.time,
        time: row.time,
        label: formatChartLabel(row.time),
      }

    existing[row.metricKey] = row.value
    map.set(row.time, existing)
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.time) - new Date(b.time)
  )
}

function getMetricName(metricMap, metricKey = '') {
  return metricMap.get(metricKey)?.metricName || getFallbackMetricName(metricKey)
}

function getMetricUnit(metricMap, metricKey = '') {
  return metricMap.get(metricKey)?.unit || ''
}


function normalizeHistoryTimeKey(value) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) return String(value || '')

  return date.toISOString()
}

function buildAllMetricsTableRows(rows = [], metrics = []) {
  const sortedRows = [...rows].sort((a, b) => {
    const timeA = new Date(a.time).getTime()
    const timeB = new Date(b.time).getTime()

    if (Number.isNaN(timeA) || Number.isNaN(timeB)) return 0

    return timeA - timeB
  })

  const map = new Map()

  for (const row of sortedRows) {
    const timeKey = normalizeHistoryTimeKey(row.time)

    if (!timeKey || !row.metricKey) continue

    const existing =
      map.get(timeKey) ||
      {
        id: timeKey,
        time: row.time,
        values: {},
      }

    existing.values[row.metricKey] = row.value
    map.set(timeKey, existing)
  }

  return Array.from(map.values())
}

function getHistoryTableRows(rows = [], selectedMetricKey = '', metrics = []) {
  if (selectedMetricKey === 'all') {
    return buildAllMetricsTableRows(rows, metrics)
  }

  return rows
}


function formatHistoryTableValue(row, metricMap, selectedUnit = '') {
  const unit = getMetricUnit(metricMap, row.metricKey) || selectedUnit
  const value = formatNumber(row.value, unit)

  return value
}

function HistoryStatCard({ label, value, hint }) {
  return (
    <article className="history-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  )
}

function HistoryTooltip({ active, payload, label, metricMap }) {
  if (!active || !payload?.length) return null

  return (
    <div className="history-tooltip">
      <strong>{label}</strong>

      {payload.map((item) => {
        const unit = getMetricUnit(metricMap, item.dataKey)
        const name = getMetricName(metricMap, item.dataKey)

        return (
          <span key={item.dataKey}>
            {name}: {formatNumber(item.value, unit)}
          </span>
        )
      })}
    </div>
  )
}

function History() {
  const initialHistoryState = useMemo(() => getInitialHistoryState(), [])
  const previousFilterSignatureRef = useRef('')
  const [devices, setDevices] = useState([])
  const [metrics, setMetrics] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(initialHistoryState.deviceId)
  const [selectedDate, setSelectedDate] = useState(initialHistoryState.date)
  const [selectedMetricKey, setSelectedMetricKey] = useState(initialHistoryState.metricKey)
  const [rows, setRows] = useState([])
  const [tablePage, setTablePage] = useState(initialHistoryState.tablePage)
  const [sortOrder, setSortOrder] = useState(initialHistoryState.sortOrder)
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState('')

  const selectedDevice = useMemo(
    () =>
      devices.find((device) => String(device.id) === String(selectedDeviceId)) ||
      null,
    [devices, selectedDeviceId]
  )

  const selectedMetric = useMemo(
    () =>
      selectedMetricKey === 'all'
        ? {
            metricKey: 'all',
            metricName: 'All Metrics',
            unit: '',
          }
        : metrics.find((metric) => metric.metricKey === selectedMetricKey) ||
          null,
    [metrics, selectedMetricKey]
  )

  const metricMap = useMemo(() => {
    return new Map(metrics.map((metric) => [metric.metricKey, metric]))
  }, [metrics])

  const chartRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const timeA = new Date(a.time).getTime()
      const timeB = new Date(b.time).getTime()

      if (Number.isNaN(timeA) || Number.isNaN(timeB)) return 0

      return timeA - timeB
    })
  }, [rows])

  const chartData = useMemo(
    () => buildChartData(chartRows, selectedMetricKey, metrics),
    [chartRows, selectedMetricKey, metrics]
  )

  const chartSeries = useMemo(() => {
    if (selectedMetricKey === 'all') {
      const availableMetricKeys = new Set(rows.map((row) => row.metricKey))

      return metrics
        .filter((metric) => availableMetricKeys.has(metric.metricKey))
        .map((metric, index) => ({
          dataKey: metric.metricKey,
          name: metric.metricName,
          unit: metric.unit || '',
          color: getMetricColor(index),
        }))
    }

    return [
      {
        dataKey: 'value',
        name: selectedMetric?.metricName || selectedMetricKey || 'Value',
        unit: selectedMetric?.unit || '',
        color: getMetricColor(0),
      },
    ]
  }, [metrics, rows, selectedMetric, selectedMetricKey])

  const filteredRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const timeA = new Date(a.time).getTime()
      const timeB = new Date(b.time).getTime()

      if (Number.isNaN(timeA) || Number.isNaN(timeB)) return 0

      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB
    })
  }, [rows, sortOrder])

  const totalTablePages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredRows.length / TABLE_PAGE_SIZE))
  }, [filteredRows.length])

  const paginatedRows = useMemo(() => {
    const safePage = Math.min(Math.max(tablePage, 1), totalTablePages)
    const startIndex = (safePage - 1) * TABLE_PAGE_SIZE

    return filteredRows.slice(startIndex, startIndex + TABLE_PAGE_SIZE)
  }, [filteredRows, tablePage, totalTablePages])

  const tableStartRow = filteredRows.length
    ? (Math.min(Math.max(tablePage, 1), totalTablePages) - 1) *
        TABLE_PAGE_SIZE +
      1
    : 0

  const tableEndRow = Math.min(
    tableStartRow + paginatedRows.length - 1,
    filteredRows.length
  )


  const historyTableRows = useMemo(() => {
    return getHistoryTableRows(filteredRows, selectedMetricKey, metrics)
  }, [filteredRows, selectedMetricKey, metrics])

  const totalHistoryTablePages = useMemo(() => {
    return Math.max(1, Math.ceil(historyTableRows.length / TABLE_PAGE_SIZE))
  }, [historyTableRows.length])

  const paginatedHistoryTableRows = useMemo(() => {
    const safePage = Math.min(Math.max(tablePage, 1), totalHistoryTablePages)
    const startIndex = (safePage - 1) * TABLE_PAGE_SIZE

    return historyTableRows.slice(startIndex, startIndex + TABLE_PAGE_SIZE)
  }, [historyTableRows, tablePage, totalHistoryTablePages])

  const historyTableStartRow = historyTableRows.length
    ? (Math.min(Math.max(tablePage, 1), totalHistoryTablePages) - 1) *
        TABLE_PAGE_SIZE +
      1
    : 0

  const historyTableEndRow = Math.min(
    historyTableStartRow + paginatedHistoryTableRows.length - 1,
    historyTableRows.length
  )

    const stats = useMemo(() => getStats(filteredRows), [filteredRows])

  async function loadDevices() {
    try {
      setLoadingDevices(true)
      setError('')

      const result = await getDevices()
      const list = toArray(result)

      setDevices(list)

      setSelectedDeviceId((current) => {
        const stillExists = list.some(
          (device) => String(device.id) === String(current)
        )

        if (current && stillExists) return current

        return list[0] ? String(list[0].id) : ''
      })
    } catch (err) {
      console.error('History loadDevices error:', err)
      setError(err.message || 'โหลดรายการ Device ไม่สำเร็จ')
    } finally {
      setLoadingDevices(false)
    }
  }

  async function loadMetrics(deviceId) {
    if (!deviceId) {
      setMetrics([])
      setSelectedMetricKey('')
      return
    }

    const device =
      devices.find((item) => String(item.id) === String(deviceId)) || {}

    let apiMetrics = []

    try {
      const result = await getDeviceMetrics(deviceId)

      apiMetrics = Array.isArray(result?.metrics)
        ? result.metrics
        : Array.isArray(result)
          ? result
          : []
    } catch (err) {
      console.warn('History metric config fallback:', err)
    }

    const nextMetrics = mergeMetrics(
      metricsFromDeviceConfig(device),
      apiMetrics,
      metricsFromLatest(device)
    )

    setMetrics(nextMetrics)

    setSelectedMetricKey((current) => {
      if (current === 'all' && nextMetrics.length) return 'all'

      const stillExists = nextMetrics.some(
        (metric) => metric.metricKey === current
      )

      if (current && stillExists) return current

      return nextMetrics.length ? 'all' : ''
    })
  }

  async function loadHistory() {
    if (!selectedDeviceId || !selectedMetricKey || !selectedDate) {
      setRows([])
      return
    }

    try {
      setLoadingHistory(true)
      setError('')

      if (selectedMetricKey === 'all') {
        const results = await Promise.all(
          metrics.map(async (metric) => {
            const result = await getHistoryByDate(
              selectedDeviceId,
              selectedDate,
              metric.metricKey
            )

            return normalizeHistoryRows(result).map((row) => ({
              ...row,
              metricKey: metric.metricKey,
            }))
          })
        )

        setRows(results.flat())
        return
      }

      const result = await getHistoryByDate(
        selectedDeviceId,
        selectedDate,
        selectedMetricKey
      )

      setRows(
        normalizeHistoryRows(result).map((row) => ({
          ...row,
          metricKey: row.metricKey || selectedMetricKey,
        }))
      )
    } catch (err) {
      console.error('History loadHistory error:', err)
      setRows([])
      setError(err.message || 'โหลดข้อมูลย้อนหลังไม่สำเร็จ')
    } finally {
      setLoadingHistory(false)
    }
  }

  function exportCSV() {
    if (!historyTableRows.length) return

    const csvRows =
      selectedMetricKey === 'all'
        ? [
            ['time', ...metrics.map((metric) => metric.metricName)].join(','),
            ...historyTableRows.map((row) =>
              [
                row.time,
                ...metrics.map((metric) => {
                  const value = row.values?.[metric.metricKey]

                  return value == null
                    ? ''
                    : `"${String(
                        formatNumber(value, metric.unit || '')
                      ).replaceAll('"', '""')}"`
                }),
              ].join(',')
            ),
          ]
        : [
            `time,"${String(selectedMetric?.metricName || 'value').replaceAll(
              '"',
              '""'
            )}"`,
            ...historyTableRows.map((row) =>
              [
                row.time,
                `"${String(
                  formatHistoryTableValue(row, metricMap, selectedUnit)
                ).replaceAll('"', '""')}"`,
              ].join(',')
            ),
          ]

    const csv = csvRows.join(String.fromCharCode(10))

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `dotwatch-history-${selectedDeviceId}-${selectedMetricKey}-${selectedDate}.csv`
    link.click()

    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    loadDevices()
  }, [])

  useEffect(() => {
    if (!selectedDeviceId || !devices.length) return

    setRows([])
    loadMetrics(selectedDeviceId)
  }, [selectedDeviceId, devices])

  useEffect(() => {
    loadHistory()
  }, [selectedDeviceId, selectedMetricKey, selectedDate])

  useEffect(() => {
    const filterSignature = `${selectedDeviceId}|${selectedMetricKey}|${selectedDate}`

    if (!previousFilterSignatureRef.current) {
      previousFilterSignatureRef.current = filterSignature
      return
    }

    if (previousFilterSignatureRef.current !== filterSignature) {
      previousFilterSignatureRef.current = filterSignature
      setTablePage(1)
    }
  }, [selectedDeviceId, selectedMetricKey, selectedDate])

  useEffect(() => {
    if (tablePage > totalHistoryTablePages) {
      setTablePage(totalHistoryTablePages)
    }
  }, [tablePage, totalHistoryTablePages])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const state = {
      deviceId: selectedDeviceId,
      date: selectedDate,
      metricKey: selectedMetricKey,
      tablePage,
      sortOrder,
    }

    try {
      window.localStorage.setItem(HISTORY_STATE_KEY, JSON.stringify(state))

      const params = new URLSearchParams(window.location.search)

      if (selectedDeviceId) params.set('deviceId', selectedDeviceId)
      else params.delete('deviceId')

      if (selectedDate) params.set('date', selectedDate)
      else params.delete('date')

      if (selectedMetricKey) params.set('metricKey', selectedMetricKey)
      else params.delete('metricKey')

      params.set('page', String(tablePage))
      params.set('sort', sortOrder)

      const query = params.toString()
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`

      window.history.replaceState(null, '', nextUrl)
    } catch (error) {
      console.warn('History state persist failed:', error)
    }
  }, [selectedDeviceId, selectedDate, selectedMetricKey, tablePage, sortOrder])

    const selectedUnit = selectedMetricKey === 'all' ? '' : selectedMetric?.unit || ''

  return (
    <div className="page app-page history-page-v2">
      <PageHeader
        eyebrow="Data Center"
        title="History Analytics"
        description="ตรวจสอบข้อมูลย้อนหลังตาม Device, วันที่ และ Metric พร้อมกราฟ ตาราง และ Export CSV"
      />

      <section className="history-stat-grid">
        <HistoryStatCard
          label="Records"
          value={loadingHistory ? '...' : filteredRows.length}
          hint="Filtered rows"
        />
        <HistoryStatCard
          label="Average"
          value={formatNumber(stats.average, selectedUnit)}
          hint={selectedMetricKey === 'all' ? 'All device metrics' : 'Selected metric'}
        />
        <HistoryStatCard
          label="Min"
          value={formatNumber(stats.min, selectedUnit)}
          hint="Lowest value"
        />
        <HistoryStatCard
          label="Max"
          value={formatNumber(stats.max, selectedUnit)}
          hint="Highest value"
        />
      </section>

      <section className="app-card history-filter-card">
        <div className="history-section-title">
          <div>
            <h2>Filter</h2>
            <p>เลือก Device, วันที่ และ Metric ที่ต้องการตรวจสอบ</p>
          </div>
        </div>

        <div className="history-filter-grid">
          <label>
            <span>Device</span>
            <select
              value={selectedDeviceId}
              onChange={(event) => setSelectedDeviceId(event.target.value)}
              disabled={loadingDevices}
            >
              {devices.length === 0 ? (
                <option value="">No device</option>
              ) : (
                devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name || device.device_code || `Device ${device.id}`}
                  </option>
                ))
              )}
            </select>
          </label>

          <label>
            <span>Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>

          <label>
            <span>Metric</span>
            <select
              value={selectedMetricKey}
              onChange={(event) => setSelectedMetricKey(event.target.value)}
              disabled={!metrics.length}
            >
              {metrics.length === 0 ? (
                <option value="">No metric</option>
              ) : (
                <>
                  <option value="all">All Metrics</option>
                  {metrics.map((metric) => (
                    <option key={metric.metricKey} value={metric.metricKey}>
                      {metric.metricName}
                      {metric.unit ? ` (${metric.unit})` : ''}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>

          <button
            type="button"
            className="history-export-btn"
            onClick={exportCSV}
            disabled={!filteredRows.length}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </section>

      {error && <section className="history-message error">{error}</section>}

      <section className="app-card history-chart-card history-chart-card-full">

          <div className="history-section-title">
            <div>
              <h2>Trend Graph</h2>
              <p>
                {selectedMetricKey === 'all' ? 'All Metrics' : selectedMetric?.metricName || 'Metric'} จาก{' '}
                {selectedDevice?.name || selectedDevice?.device_code || 'Device'}
              </p>
            </div>

            <span
              className={`history-device-status ${selectedDevice?.status || 'offline'}`}
            >
              {selectedDevice?.status || 'offline'}
            </span>
          </div>

          {loadingHistory ? (
            <div className="history-empty-box">กำลังโหลดข้อมูลย้อนหลัง...</div>
          ) : chartData.length === 0 ? (
            <div className="history-empty-box">
              <span />
              <strong>ยังไม่มีข้อมูลสำหรับกราฟ</strong>
              <p>
                ตรวจสอบว่า Device ส่งข้อมูลในวันที่เลือก และ Metric นี้มีข้อมูลใน
                device_metric_readings
              </p>
            </div>
          ) : (
            <div className="history-chart-box">
              <ResponsiveContainer width="100%" height={360}>
                <AreaChart
                  data={chartData}
                  margin={{
                    top: 18,
                    right: 18,
                    left: -6,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="historyMetricFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgba(148, 163, 184, 0.18)"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                    tick={{
                      fontSize: 12,
                      fill: '#94a3b8',
                      fontWeight: 700,
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    domain={['auto', 'auto']}
                    tick={{
                      fontSize: 12,
                      fill: '#94a3b8',
                      fontWeight: 700,
                    }}
                  />
                  <Tooltip
                    content={<HistoryTooltip metricMap={metricMap} />}
                    cursor={{
                      stroke: 'rgba(6, 182, 212, 0.7)',
                      strokeDasharray: '3 3',
                    }}
                  />
                  {chartSeries.map((series, index) => (
                    <Area
                      key={series.dataKey}
                      type="monotone"
                      dataKey={series.dataKey}
                      name={series.name}
                      stroke={series.color}
                      fill={index === 0 ? 'url(#historyMetricFill)' : 'transparent'}
                      strokeWidth={selectedMetricKey === 'all' ? 2 : 3}
                      dot={chartData.length <= 1}
                      activeDot={{ r: 5 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
      </section>

      <section className="app-card history-table-card">
        <div className="history-section-title">
          <div>
            <h2>History Table</h2>
            <p>รายการข้อมูลย้อนหลังตามตัวกรองที่เลือก</p>
          </div>

          <div className="history-table-actions">
            <span>
              {historyTableStartRow}-{historyTableEndRow} / {historyTableRows.length} rows
            </span>

            <label>
              <span>Sort</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              >
                <option value="desc">ล่าสุดก่อน</option>
                <option value="asc">เก่าสุดก่อน</option>
              </select>
            </label>
          </div>
        </div>

        <div className="history-table-wrap">
          <table
            className={`history-table ${
              selectedMetricKey === 'all' ? 'history-table-all-metrics' : ''
            }`}
          >
            <thead>
              {selectedMetricKey === 'all' ? (
                <tr>
                  <th>Time</th>
                  {metrics.map((metric) => (
                    <th key={metric.metricKey}>{metric.metricName}</th>
                  ))}
                </tr>
              ) : (
                <tr>
                  <th>Time</th>
                  <th>{selectedMetric?.metricName || 'Name'}</th>
                </tr>
              )}
            </thead>

            <tbody>
              {historyTableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      selectedMetricKey === 'all' ? metrics.length + 1 : 2
                    }
                  >
                    ยังไม่มีข้อมูลย้อนหลัง
                  </td>
                </tr>
              ) : selectedMetricKey === 'all' ? (
                paginatedHistoryTableRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.time)}</td>
                    {metrics.map((metric) => (
                      <td key={metric.metricKey}>
                        {row.values?.[metric.metricKey] == null
                          ? '--'
                          : formatNumber(row.values[metric.metricKey], metric.unit || '')}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                paginatedHistoryTableRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.time)}</td>
                    <td>
                      {formatHistoryTableValue(row, metricMap, selectedUnit)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {historyTableRows.length > TABLE_PAGE_SIZE && (
          <div className="history-table-pagination">
            <div>
              Showing {historyTableStartRow}-{historyTableEndRow} of {historyTableRows.length}
            </div>

            <div className="history-pagination-actions">
              <button
                type="button"
                onClick={() => setTablePage(1)}
                disabled={tablePage <= 1}
              >
                First
              </button>

              <button
                type="button"
                onClick={() => setTablePage((page) => Math.max(1, page - 1))}
                disabled={tablePage <= 1}
              >
                Previous
              </button>

              <span>
                Page {Math.min(tablePage, totalHistoryTablePages)} / {totalHistoryTablePages}
              </span>

              <button
                type="button"
                onClick={() =>
                  setTablePage((page) => Math.min(totalHistoryTablePages, page + 1))
                }
                disabled={tablePage >= totalHistoryTablePages}
              >
                Next
              </button>

              <button
                type="button"
                onClick={() => setTablePage(totalHistoryTablePages)}
                disabled={tablePage >= totalHistoryTablePages}
              >
                Last
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default History
