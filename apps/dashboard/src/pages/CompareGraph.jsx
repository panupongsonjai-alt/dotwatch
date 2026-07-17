import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CalendarDays,
  Check,
  Download,
  RefreshCw,
  Search,
} from 'lucide-react'
import {
  PageHeader,
  TablePagination,
  UnifiedSelect,
} from '../components/common'
import { getDeviceMetrics, getDevices, getHistory } from '../services/api'
import { isWifiRssiMetricConfig } from '../utils/metricDisplayConfig'
import { TABLE_PAGE_SIZE_OPTIONS } from '../utils/tablePageSizePreference'
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from '../utils/uiFeedback'
import '../styles/history.css'

const COMPARE_GRAPH_STATE_KEY = 'dotwatch.compare.graph.state'
const DEFAULT_TABLE_PAGE_SIZE = 20
const MAX_SELECTED_DEVICES = 8
const DEFAULT_CHART_RESOLUTION = '5m'
const TABLE_PAGE_SIZES = TABLE_PAGE_SIZE_OPTIONS

const CHART_RESOLUTION_OPTIONS = [
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '10m', label: '10 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
]

const COMPARE_CHART_COLORS = [
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
  '#a855f7',
  '#0ea5e9',
]

const COMPARE_DASH_PATTERNS = ['', '7 4', '3 3', '10 4 2 4']

function todayInputValue() {
  const now = new Date()
  const bangkokOffsetMs = 7 * 60 * 60 * 1000
  const bangkokDate = new Date(now.getTime() + bangkokOffsetMs)

  return bangkokDate.toISOString().slice(0, 10)
}

function getSafeChartResolution(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return CHART_RESOLUTION_OPTIONS.some(
    (option) => option.value === normalized
  )
    ? normalized
    : DEFAULT_CHART_RESOLUTION
}

function getSafeTablePageSize(value) {
  const numericValue = Number(value)

  return TABLE_PAGE_SIZES.includes(numericValue)
    ? numericValue
    : DEFAULT_TABLE_PAGE_SIZE
}

function getSafeSortOrder(value) {
  return String(value || '').toLowerCase() === 'asc' ? 'asc' : 'desc'
}

function getInitialState() {
  const fallback = {
    deviceIds: [],
    startDate: todayInputValue(),
    endDate: todayInputValue(),
    metricKey: 'all',
    chartResolution: DEFAULT_CHART_RESOLUTION,
    sortOrder: 'desc',
    tablePageSize: DEFAULT_TABLE_PAGE_SIZE,
  }

  if (typeof window === 'undefined') return fallback

  try {
    const saved = JSON.parse(
      window.localStorage.getItem(COMPARE_GRAPH_STATE_KEY) || '{}'
    )

    return {
      deviceIds: Array.isArray(saved.deviceIds)
        ? saved.deviceIds.slice(0, MAX_SELECTED_DEVICES).map(String)
        : fallback.deviceIds,
      startDate: saved.startDate || fallback.startDate,
      endDate: saved.endDate || fallback.endDate,
      metricKey: saved.metricKey || fallback.metricKey,
      chartResolution: getSafeChartResolution(saved.chartResolution),
      sortOrder: getSafeSortOrder(saved.sortOrder),
      tablePageSize: getSafeTablePageSize(saved.tablePageSize),
    }
  } catch (error) {
    console.warn('Compare Graph state restore failed:', error)
    return fallback
  }
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.history)) return payload.history
  if (Array.isArray(payload?.readings)) return payload.readings

  return []
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
    const numericValue = Number(candidate)

    if (
      candidate !== null &&
      candidate !== undefined &&
      candidate !== '' &&
      Number.isFinite(numericValue)
    ) {
      return numericValue
    }
  }

  return null
}

function normalizeDecimalPlaces(value, fallback = 2) {
  const decimalPlaces = Number(value)

  if (!Number.isInteger(decimalPlaces)) return fallback

  return Math.min(6, Math.max(0, decimalPlaces))
}

function getFallbackMetricName(metricKey = '') {
  if (metricKey === 'temperature') return 'Temperature'
  if (metricKey === 'humidity') return 'Humidity'
  if (metricKey === 'rssi') return 'Signal'

  const index = Number(String(metricKey).replace(/[^0-9]/g, '')) || 0

  return index > 0 ? `Value ${index}` : metricKey || 'Value'
}

function normalizeMetric(metric = {}) {
  const metricKey = metric.metric_key || metric.source_key || metric.key

  if (!metricKey || isWifiRssiMetricConfig(metric)) return null

  return {
    metricKey: String(metricKey),
    metricName:
      metric.metric_name ||
      metric.name ||
      metric.label ||
      getFallbackMetricName(metricKey),
    unit: metric.unit || '',
    visible: metric.visible !== false,
    sortOrder: Number(metric.sort_order ?? metric.sortOrder ?? 9999),
    decimalPlaces: normalizeDecimalPlaces(
      metric.decimal_places ?? metric.decimalPlaces
    ),
  }
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

function mergeMetrics(...groups) {
  const metricMap = new Map()

  for (const group of groups) {
    for (const metric of group || []) {
      const normalized = normalizeMetric(metric) || metric

      if (!normalized?.metricKey || normalized.visible === false) continue

      const current = metricMap.get(normalized.metricKey)

      metricMap.set(normalized.metricKey, {
        ...normalized,
        metricName:
          current?.metricName && current.metricName !== normalized.metricKey
            ? current.metricName
            : normalized.metricName,
        unit: current?.unit || normalized.unit || '',
        decimalPlaces: normalizeDecimalPlaces(
          current?.decimalPlaces ?? normalized.decimalPlaces
        ),
        sortOrder: Math.min(
          Number(current?.sortOrder ?? 9999),
          Number(normalized.sortOrder ?? 9999)
        ),
      })
    }
  }

  return Array.from(metricMap.values()).sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder
    }

    return left.metricName.localeCompare(right.metricName)
  })
}

function normalizeHistoryRows(payload) {
  return toArray(payload)
    .map((item, index) => {
      const time = getTime(item)
      const value = getValue(item)

      return {
        id: `${time || index}-${item.metric_key || item.metricKey || ''}`,
        time,
        metricKey: item.metric_key || item.metricKey,
        value,
      }
    })
    .filter((row) => row.time && row.value != null)
    .sort((left, right) => new Date(left.time) - new Date(right.time))
}

function normalizeTimeKey(value) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) return String(value || '')

  return date.toISOString()
}

function formatChartLabel(value, includeDate = false) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) return '--'

  if (includeDate) {
    return date.toLocaleString('th-TH', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bangkok',
    })
  }

  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  })
}

function formatHistoryDate(value) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) return '--'

  return date.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  })
}

function formatHistoryTime(value) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) return '--'

  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  })
}

function formatDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '--'

  const date = new Date(`${value}T00:00:00.000+07:00`)

  if (Number.isNaN(date.getTime())) return '--'

  return date.toLocaleDateString('th-TH', {
    dateStyle: 'long',
    timeZone: 'Asia/Bangkok',
  })
}

function formatDateTime(value) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) return '--'

  return date.toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  })
}

function formatNumber(value, unit = '', decimalPlaces = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '--'

  const formatted = Number(value).toFixed(
    normalizeDecimalPlaces(decimalPlaces)
  )

  return `${formatted}${unit ? ` ${unit}` : ''}`
}

function escapeCsvField(value) {
  let normalized = String(value ?? '')

  if (/^[=+@]/.test(normalized) || /^-[^0-9.]/.test(normalized)) {
    normalized = `'${normalized}`
  }

  return `"${normalized.replaceAll('"', '""')}"`
}

function downloadCsvFile(filename, rows) {
  const csvText = `\uFEFF${rows
    .map((row) => row.map((value) => escapeCsvField(value)).join(','))
    .join('\r\n')}`
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function sanitizeFilename(value) {
  return (
    String(value || 'compare')
      .trim()
      .replace(/[^a-zA-Z0-9ก-๙_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'compare'
  )
}

function getDeviceName(device = {}) {
  return device.name || device.device_code || `Device ${device.id || ''}`
}

function buildCommonMetrics(selectedDevices, metricsByDevice) {
  if (!selectedDevices.length) return []

  const metricLists = selectedDevices.map(
    (device) => metricsByDevice[String(device.id)] || []
  )

  if (metricLists.some((list) => list.length === 0)) return []

  const commonKeys = metricLists.slice(1).reduce(
    (keys, list) => {
      const listKeys = new Set(list.map((metric) => metric.metricKey))
      return new Set(Array.from(keys).filter((key) => listKeys.has(key)))
    },
    new Set(metricLists[0].map((metric) => metric.metricKey))
  )

  return metricLists[0].filter((metric) => commonKeys.has(metric.metricKey))
}

function makeSeriesKey(deviceId, metricKey) {
  return `device_${String(deviceId).replace(/[^a-zA-Z0-9_-]/g, '_')}__${String(
    metricKey
  ).replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function buildChartData(rows = []) {
  const sortedRows = [...rows].sort(
    (left, right) => new Date(left.time) - new Date(right.time)
  )
  const chartDates = new Set(
    sortedRows.map((row) => formatHistoryDate(row.time))
  )
  const includeDate = chartDates.size > 1
  const dataMap = new Map()

  for (const row of sortedRows) {
    const timeKey = normalizeTimeKey(row.time)

    if (!timeKey) continue

    const existing = dataMap.get(timeKey) || {
      id: timeKey,
      time: row.time,
      label: formatChartLabel(row.time, includeDate),
    }

    existing[row.seriesKey] = row.value
    dataMap.set(timeKey, existing)
  }

  return Array.from(dataMap.values()).sort(
    (left, right) => new Date(left.time) - new Date(right.time)
  )
}

function CompareStatCard({ label, value, hint }) {
  return (
    <article className="history-stat-card compare-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  )
}

function CompareTooltip({ active, payload, label, seriesMap }) {
  if (!active || !payload?.length) return null

  return (
    <div className="history-tooltip compare-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => {
        const series = seriesMap.get(item.dataKey)

        if (!series || item.value == null) return null

        return (
          <div key={item.dataKey} className="compare-tooltip-row">
            <i style={{ background: series.color }} aria-hidden="true" />
            <span>
              <b>{series.deviceName}</b>
              <small>{series.metricName}</small>
            </span>
            <em>
              {formatNumber(
                item.value,
                series.unit,
                series.decimalPlaces
              )}
            </em>
          </div>
        )
      })}
    </div>
  )
}

function CompareGraph() {
  const initialState = useMemo(() => getInitialState(), [])
  const startDateInputRef = useRef(null)
  const endDateInputRef = useRef(null)
  const metricsRequestRef = useRef(0)
  const historyRequestRef = useRef(0)

  const [devices, setDevices] = useState([])
  const [selectedDeviceIds, setSelectedDeviceIds] = useState(
    initialState.deviceIds
  )
  const [metricsByDevice, setMetricsByDevice] = useState({})
  const [selectedMetricKey, setSelectedMetricKey] = useState(
    initialState.metricKey
  )
  const [startDate, setStartDate] = useState(initialState.startDate)
  const [endDate, setEndDate] = useState(initialState.endDate)
  const [chartResolution, setChartResolution] = useState(
    initialState.chartResolution
  )
  const [sortOrder, setSortOrder] = useState(initialState.sortOrder)
  const [tablePageSize, setTablePageSize] = useState(
    initialState.tablePageSize
  )
  const [tablePage, setTablePage] = useState(1)
  const [deviceSearch, setDeviceSearch] = useState('')
  const [rows, setRows] = useState([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [loadingMetrics, setLoadingMetrics] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const selectedDevices = useMemo(() => {
    const selectedSet = new Set(selectedDeviceIds.map(String))

    return devices.filter((device) => selectedSet.has(String(device.id)))
  }, [devices, selectedDeviceIds])

  const commonMetrics = useMemo(
    () => buildCommonMetrics(selectedDevices, metricsByDevice),
    [metricsByDevice, selectedDevices]
  )

  const selectedMetric = useMemo(
    () =>
      selectedMetricKey === 'all'
        ? null
        : commonMetrics.find(
            (metric) => metric.metricKey === selectedMetricKey
          ) || null,
    [commonMetrics, selectedMetricKey]
  )

  const visibleDevices = useMemo(() => {
    const normalizedSearch = deviceSearch.trim().toLowerCase()

    if (!normalizedSearch) return devices

    return devices.filter((device) => {
      const text = [device.name, device.device_code, device.status, device.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return text.includes(normalizedSearch)
    })
  }, [deviceSearch, devices])

  const series = useMemo(() => {
    const nextSeries = []
    let colorIndex = 0

    for (const device of selectedDevices) {
      const deviceMetrics = metricsByDevice[String(device.id)] || []
      const metricsToRender =
        selectedMetricKey === 'all'
          ? commonMetrics
          : deviceMetrics.filter(
              (metric) => metric.metricKey === selectedMetricKey
            )

      metricsToRender.forEach((metric, metricIndex) => {
        nextSeries.push({
          dataKey: makeSeriesKey(device.id, metric.metricKey),
          deviceId: String(device.id),
          deviceName: getDeviceName(device),
          deviceStatus: String(device.status || 'offline').toLowerCase(),
          metricKey: metric.metricKey,
          metricName: metric.metricName,
          unit: metric.unit || '',
          decimalPlaces: metric.decimalPlaces,
          color: COMPARE_CHART_COLORS[colorIndex % COMPARE_CHART_COLORS.length],
          strokeDasharray:
            COMPARE_DASH_PATTERNS[metricIndex % COMPARE_DASH_PATTERNS.length],
        })
        colorIndex += 1
      })
    }

    return nextSeries
  }, [commonMetrics, metricsByDevice, selectedDevices, selectedMetricKey])

  const seriesMap = useMemo(
    () => new Map(series.map((item) => [item.dataKey, item])),
    [series]
  )

  const chartData = useMemo(() => buildChartData(rows), [rows])

  const sortedRows = useMemo(() => {
    const direction = sortOrder === 'asc' ? 1 : -1

    return [...rows].sort((left, right) => {
      const leftTime = new Date(left.time).getTime()
      const rightTime = new Date(right.time).getTime()

      if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0
      if (Number.isNaN(leftTime)) return 1
      if (Number.isNaN(rightTime)) return -1

      return (leftTime - rightTime) * direction
    })
  }, [rows, sortOrder])

  const totalTablePages = useMemo(
    () => Math.max(1, Math.ceil(sortedRows.length / tablePageSize)),
    [sortedRows.length, tablePageSize]
  )

  const paginatedRows = useMemo(() => {
    const safePage = Math.min(Math.max(1, tablePage), totalTablePages)
    const startIndex = (safePage - 1) * tablePageSize

    return sortedRows.slice(startIndex, startIndex + tablePageSize)
  }, [sortedRows, tablePage, tablePageSize, totalTablePages])

  const latestTimestamp = useMemo(() => {
    if (!rows.length) return null

    return rows.reduce((latest, row) => {
      const currentTime = new Date(row.time).getTime()
      const latestTime = latest ? new Date(latest).getTime() : 0

      return currentTime > latestTime ? row.time : latest
    }, null)
  }, [rows])

  const selectedResolutionLabel =
    CHART_RESOLUTION_OPTIONS.find(
      (option) => option.value === chartResolution
    )?.label || chartResolution

  function showDatePicker(inputRef) {
    const input = inputRef.current

    if (!input) return

    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }

    input.focus()
    input.click()
  }

  function toggleDevice(deviceId) {
    const normalizedId = String(deviceId)

    setSelectedDeviceIds((current) => {
      if (current.includes(normalizedId)) {
        return current.filter((id) => id !== normalizedId)
      }

      if (current.length >= MAX_SELECTED_DEVICES) {
        const message = `เลือก Compare ได้สูงสุด ${MAX_SELECTED_DEVICES} Device ต่อครั้ง`
        setError(message)
        showWarningToast(message)
        return current
      }

      setError('')
      return [...current, normalizedId]
    })
  }

  function selectVisibleDevices() {
    const nextIds = visibleDevices
      .slice(0, MAX_SELECTED_DEVICES)
      .map((device) => String(device.id))

    setSelectedDeviceIds(nextIds)

    if (visibleDevices.length > MAX_SELECTED_DEVICES) {
      const message = `เลือก ${MAX_SELECTED_DEVICES} Device แรกจากผลการค้นหา เพื่อควบคุมความชัดเจนและจำนวน API requests`
      setNotice(message)
      showWarningToast(message)
    }
  }

  async function loadDevices() {
    try {
      setLoadingDevices(true)
      setError('')

      const result = await getDevices()
      const list = toArray(result)

      setDevices(list)
      setSelectedDeviceIds((current) => {
        const validIds = current.filter((id) =>
          list.some((device) => String(device.id) === String(id))
        )

        if (validIds.length) return validIds.slice(0, MAX_SELECTED_DEVICES)

        return list.slice(0, Math.min(2, list.length)).map((device) =>
          String(device.id)
        )
      })
    } catch (loadError) {
      console.error('Compare Graph loadDevices error:', loadError)
      const message = loadError.message || 'โหลดรายการ Device ไม่สำเร็จ'
      setError(message)
      showErrorToast(message)
    } finally {
      setLoadingDevices(false)
    }
  }

  async function loadSelectedDeviceMetrics() {
    const requestId = metricsRequestRef.current + 1
    metricsRequestRef.current = requestId

    if (!selectedDevices.length) {
      setMetricsByDevice({})
      setRows([])
      return
    }

    try {
      setLoadingMetrics(true)
      setError('')

      const results = await Promise.allSettled(
        selectedDevices.map(async (device) => {
          let apiMetrics = []

          try {
            const result = await getDeviceMetrics(device.id)
            apiMetrics = Array.isArray(result?.metrics)
              ? result.metrics
              : Array.isArray(result)
                ? result
                : []
          } catch (metricError) {
            console.warn(
              `Compare Graph value config fallback for ${device.id}:`,
              metricError
            )
          }

          return {
            deviceId: String(device.id),
            metrics: mergeMetrics(
              apiMetrics,
              metricsFromDeviceConfig(device)
            ),
          }
        })
      )

      if (requestId !== metricsRequestRef.current) return

      const nextMetricsByDevice = {}

      results.forEach((result, index) => {
        const deviceId = String(selectedDevices[index].id)

        nextMetricsByDevice[deviceId] =
          result.status === 'fulfilled' ? result.value.metrics : []
      })

      setMetricsByDevice(nextMetricsByDevice)
    } finally {
      if (requestId === metricsRequestRef.current) {
        setLoadingMetrics(false)
      }
    }
  }

  async function loadCompareHistory({ silent = false } = {}) {
    const requestId = historyRequestRef.current + 1
    historyRequestRef.current = requestId

    if (
      selectedDevices.length < 2 ||
      !selectedMetricKey ||
      !startDate ||
      !endDate ||
      !commonMetrics.length
    ) {
      setRows([])
      setLoadingHistory(false)
      return
    }

    if (startDate > endDate) {
      setRows([])
      setLoadingHistory(false)
      const message = 'Start Date ต้องไม่มากกว่า End Date'
      setError(message)
      showWarningToast(message)
      return
    }

    try {
      if (!silent) setLoadingHistory(true)
      setError('')

      const metricKeys =
        selectedMetricKey === 'all'
          ? commonMetrics.map((metric) => metric.metricKey)
          : [selectedMetricKey]

      const requests = selectedDevices.flatMap((device) =>
        metricKeys.map(async (metricKey) => {
          const result = await getHistory(
            device.id,
            startDate,
            endDate,
            metricKey,
            { resolution: chartResolution }
          )

          const deviceMetrics = metricsByDevice[String(device.id)] || []
          const metric =
            deviceMetrics.find((item) => item.metricKey === metricKey) ||
            commonMetrics.find((item) => item.metricKey === metricKey) ||
            {
              metricKey,
              metricName: getFallbackMetricName(metricKey),
              unit: '',
              decimalPlaces: 2,
            }

          return normalizeHistoryRows(result).map((row) => ({
            ...row,
            id: `${device.id}-${metricKey}-${row.id}`,
            deviceId: String(device.id),
            deviceName: getDeviceName(device),
            deviceStatus: String(device.status || 'offline').toLowerCase(),
            metricKey,
            metricName: metric.metricName,
            unit: metric.unit || '',
            decimalPlaces: metric.decimalPlaces,
            seriesKey: makeSeriesKey(device.id, metricKey),
          }))
        })
      )

      const results = await Promise.allSettled(requests)

      if (requestId !== historyRequestRef.current) return

      const successfulRows = results
        .filter((result) => result.status === 'fulfilled')
        .flatMap((result) => result.value)
      const failedCount = results.filter(
        (result) => result.status === 'rejected'
      ).length

      if (failedCount === results.length) {
        if (silent) return

        setRows([])
        const message = 'โหลดข้อมูล Compare Graph ไม่สำเร็จทุก series'
        setError(message)
        showErrorToast(message)
        return
      }

      setRows(successfulRows)

      if (failedCount > 0 && !silent) {
        const message = `โหลดข้อมูลสำเร็จบางส่วน โดยมี ${failedCount} series ที่โหลดไม่สำเร็จ`
        setNotice(message)
        showWarningToast(message)
      }
    } catch (historyError) {
      if (requestId !== historyRequestRef.current) return

      console.error('Compare Graph loadHistory error:', historyError)

      if (!silent) {
        setRows([])
        const message =
          historyError.message || 'โหลดข้อมูล Compare Graph ไม่สำเร็จ'
        setError(message)
        showErrorToast(message)
      }
    } finally {
      if (requestId === historyRequestRef.current && !silent) {
        setLoadingHistory(false)
      }
    }
  }

  function exportCsv() {
    if (!sortedRows.length) return

    const metricTitle =
      selectedMetricKey === 'all'
        ? 'All Common Values'
        : selectedMetric?.metricName || selectedMetricKey
    const csvRows = [
      ['dotWatch Compare Graph Report'],
      ['Devices', selectedDevices.map(getDeviceName).join(' | ')],
      ['Value', metricTitle],
      ['Start Date', formatDateOnly(startDate)],
      ['End Date', formatDateOnly(endDate)],
      ['Display Interval', selectedResolutionLabel],
      ['Generated At', new Date().toLocaleString('th-TH')],
      [],
      ['Date', 'Time', 'Device', 'Device Status', 'Value Key', 'Value Name', 'Value', 'Unit'],
    ]

    for (const row of sortedRows) {
      csvRows.push([
        formatHistoryDate(row.time),
        formatHistoryTime(row.time),
        row.deviceName,
        row.deviceStatus,
        row.metricKey,
        row.metricName,
        Number(row.value).toFixed(
          normalizeDecimalPlaces(row.decimalPlaces)
        ),
        row.unit || '',
      ])
    }

    const filename = [
      'dotWatch-compare-graph',
      sanitizeFilename(metricTitle),
      startDate,
      'to',
      endDate,
    ].join('-')

    downloadCsvFile(`${filename}.csv`, csvRows)
    setNotice('ส่งออก Compare Graph CSV สำเร็จ')
    showSuccessToast('ส่งออก Compare Graph CSV สำเร็จ')
  }

  useEffect(() => {
    loadDevices()
  }, [])

  useEffect(() => {
    setRows([])
    loadSelectedDeviceMetrics()
  }, [selectedDevices])

  useEffect(() => {
    setSelectedMetricKey((current) => {
      if (!commonMetrics.length) return ''
      if (current === 'all') return 'all'

      const stillAvailable = commonMetrics.some(
        (metric) => metric.metricKey === current
      )

      return stillAvailable ? current : 'all'
    })
  }, [commonMetrics])

  useEffect(() => {
    loadCompareHistory()
  }, [
    selectedDeviceIds,
    selectedMetricKey,
    startDate,
    endDate,
    chartResolution,
    commonMetrics,
    metricsByDevice,
  ])

  useEffect(() => {
    if (
      endDate !== todayInputValue() ||
      !selectedDevices.some(
        (device) => String(device.status || '').toLowerCase() === 'online'
      )
    ) {
      return undefined
    }

    const intervals = selectedDevices
      .map((device) => Number(device.record_interval_seconds || 30))
      .filter((value) => Number.isFinite(value) && value > 0)
    const minimumIntervalSeconds = intervals.length
      ? Math.min(...intervals)
      : 30
    const refreshMs = Math.min(
      60_000,
      Math.max(10_000, minimumIntervalSeconds * 1000)
    )

    const timerId = window.setInterval(() => {
      loadCompareHistory({ silent: true })
    }, refreshMs)

    return () => window.clearInterval(timerId)
  }, [
    endDate,
    selectedDevices,
    selectedDeviceIds,
    selectedMetricKey,
    startDate,
    chartResolution,
    commonMetrics,
    metricsByDevice,
  ])

  useEffect(() => {
    setTablePage(1)
    setNotice('')
  }, [
    selectedDeviceIds,
    selectedMetricKey,
    startDate,
    endDate,
    chartResolution,
    tablePageSize,
    sortOrder,
  ])

  useEffect(() => {
    if (tablePage > totalTablePages) setTablePage(totalTablePages)
  }, [tablePage, totalTablePages])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const state = {
      deviceIds: selectedDeviceIds,
      startDate,
      endDate,
      metricKey: selectedMetricKey,
      chartResolution,
      sortOrder,
      tablePageSize,
    }

    try {
      window.localStorage.setItem(
        COMPARE_GRAPH_STATE_KEY,
        JSON.stringify(state)
      )
    } catch (storageError) {
      console.warn('Compare Graph state persist failed:', storageError)
    }
  }, [
    selectedDeviceIds,
    startDate,
    endDate,
    selectedMetricKey,
    chartResolution,
    sortOrder,
    tablePageSize,
  ])

  return (
    <div className="page app-page history-page-v2 compare-graph-page">
      <PageHeader
        eyebrow="Data Center"
        title="Compare Graph"
        description="เปรียบเทียบกราฟข้อมูลย้อนหลังของ Value เดียวกันข้ามหลาย Device ในช่วงเวลาเดียวกัน"
      />

      <section className="history-stat-grid history-stat-grid-tight">
        <CompareStatCard
          label="Records"
          value={loadingHistory ? '...' : rows.length.toLocaleString('th-TH')}
          hint="จำนวนจุดข้อมูลทั้งหมดจากทุก Device"
        />
        <CompareStatCard
          label="Devices"
          value={selectedDevices.length}
          hint={`เลือกได้สูงสุด ${MAX_SELECTED_DEVICES} Device ต่อครั้ง`}
        />
        <CompareStatCard
          label="Series"
          value={series.length}
          hint="จำนวนเส้นกราฟที่กำลังเปรียบเทียบ"
        />
        <CompareStatCard
          label="Last Update"
          value={loadingHistory ? '...' : formatDateTime(latestTimestamp)}
          hint="เวลาข้อมูลล่าสุดในผลการเปรียบเทียบ"
        />
      </section>

      <section className="app-card history-filter-card compare-filter-card">
        <div className="history-section-title">
          <div>
            <h2>Filter</h2>
            <p>
              เลือกหลาย Device, ช่วงวันที่, Value ร่วม และช่วงเวลาที่ต้องการเปรียบเทียบ
            </p>
          </div>

          <div className="filter-header-actions">
            <button
              type="button"
              className="secondary-button filter-refresh-button"
              onClick={() => {
                const today = todayInputValue()

                if (startDate === today && endDate === today) {
                  loadCompareHistory()
                  return
                }

                setStartDate(today)
                setEndDate(today)
              }}
              disabled={loadingHistory}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>

            <button
              type="button"
              className="history-export-btn"
              onClick={exportCsv}
              disabled={!sortedRows.length || loadingHistory}
            >
              <Download size={16} aria-hidden="true" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="compare-device-selector">
          <div className="compare-device-selector-header">
            <label htmlFor="compare-device-search">
              <span>Devices</span>
              <small>
                {selectedDevices.length}/{MAX_SELECTED_DEVICES} selected
              </small>
            </label>

            <div className="compare-device-selector-actions">
              <button type="button" onClick={selectVisibleDevices}>
                Select visible
              </button>
              <button
                type="button"
                onClick={() => setSelectedDeviceIds([])}
                disabled={!selectedDeviceIds.length}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="compare-device-search">
            <Search size={17} aria-hidden="true" />
            <input
              id="compare-device-search"
              value={deviceSearch}
              placeholder="Search device name, code, status..."
              onChange={(event) => setDeviceSearch(event.target.value)}
            />
          </div>

          <div
            className="compare-device-options"
            aria-label="Select devices for graph comparison"
          >
            {loadingDevices ? (
              <div className="compare-device-empty">กำลังโหลด Device...</div>
            ) : visibleDevices.length === 0 ? (
              <div className="compare-device-empty">ไม่พบ Device</div>
            ) : (
              visibleDevices.map((device) => {
                const deviceId = String(device.id)
                const checked = selectedDeviceIds.includes(deviceId)
                const atLimit =
                  !checked && selectedDeviceIds.length >= MAX_SELECTED_DEVICES

                return (
                  <button
                    key={device.id}
                    type="button"
                    className={`compare-device-option ${checked ? 'selected' : ''}`}
                    onClick={() => toggleDevice(deviceId)}
                    disabled={atLimit}
                    aria-pressed={checked}
                  >
                    <span className="compare-device-checkbox">
                      {checked && <Check size={14} aria-hidden="true" />}
                    </span>
                    <span className="compare-device-copy">
                      <strong>{getDeviceName(device)}</strong>
                      <small>{device.device_code || `ID ${device.id}`}</small>
                    </span>
                    <span
                      className={`history-device-status ${String(
                        device.status || 'offline'
                      ).toLowerCase()}`}
                    >
                      {device.status || 'offline'}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="history-filter-grid compare-history-filter-grid">
          <div className="history-filter-field">
            <label htmlFor="compare-start-date-input">Start Date</label>
            <div className="history-date-picker">
              <input
                id="compare-start-date-input"
                ref={startDateInputRef}
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => {
                  const nextStartDate = event.target.value
                  setStartDate(nextStartDate)

                  if (endDate && nextStartDate > endDate) {
                    setEndDate(nextStartDate)
                  }
                }}
              />
              <button
                type="button"
                className="history-date-picker-button"
                onClick={() => showDatePicker(startDateInputRef)}
                aria-label="เปิดปฏิทินเลือกวันเริ่มต้น"
              >
                <CalendarDays size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="history-filter-field">
            <label htmlFor="compare-end-date-input">End Date</label>
            <div className="history-date-picker">
              <input
                id="compare-end-date-input"
                ref={endDateInputRef}
                type="date"
                value={endDate}
                min={startDate || undefined}
                max={todayInputValue()}
                onChange={(event) => {
                  const nextEndDate = event.target.value
                  setEndDate(nextEndDate)

                  if (startDate && nextEndDate < startDate) {
                    setStartDate(nextEndDate)
                  }
                }}
              />
              <button
                type="button"
                className="history-date-picker-button"
                onClick={() => showDatePicker(endDateInputRef)}
                aria-label="เปิดปฏิทินเลือกวันสิ้นสุด"
              >
                <CalendarDays size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <label>
            <span>Value</span>
            <UnifiedSelect
              value={selectedMetricKey}
              onChange={(event) => setSelectedMetricKey(event.target.value)}
              disabled={loadingMetrics || !commonMetrics.length}
            >
              {commonMetrics.length === 0 ? (
                <option value="">No common value</option>
              ) : (
                <>
                  <option value="all">All Common Values</option>
                  {commonMetrics.map((metric) => (
                    <option key={metric.metricKey} value={metric.metricKey}>
                      {metric.metricName}
                      {metric.unit ? ` (${metric.unit})` : ''}
                    </option>
                  ))}
                </>
              )}
            </UnifiedSelect>
          </label>

          <label className="history-interval-filter">
            <span>Display Interval</span>
            <UnifiedSelect
              value={chartResolution}
              onChange={(event) =>
                setChartResolution(getSafeChartResolution(event.target.value))
              }
              disabled={loadingHistory || loadingMetrics}
            >
              {CHART_RESOLUTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </UnifiedSelect>
          </label>
        </div>
      </section>

      {notice && (
        <section className="history-message success">{notice}</section>
      )}
      {error && <section className="history-message error">{error}</section>}

      <section className="app-card history-chart-card history-chart-card-full compare-chart-card">
        <div className="history-section-title">
          <div>
            <h2>Compare Trend Graph</h2>
            <p>
              {selectedMetricKey === 'all'
                ? 'All Common Values'
                : selectedMetric?.metricName || 'Value'}{' '}
              • {selectedDevices.length} Device • {formatDateOnly(startDate)} -{' '}
              {formatDateOnly(endDate)} • {selectedResolutionLabel}
            </p>
          </div>
          <span>{series.length} series</span>
        </div>

        {series.length > 0 && (
          <div className="compare-chart-legend" aria-label="Graph series">
            {series.map((item) => (
              <div key={item.dataKey} className="compare-chart-legend-item">
                <i style={{ background: item.color }} aria-hidden="true" />
                <span>
                  <strong>{item.deviceName}</strong>
                  <small>{item.metricName}</small>
                </span>
              </div>
            ))}
          </div>
        )}

        {loadingHistory || loadingMetrics ? (
          <div className="history-empty-box">กำลังโหลดข้อมูลกราฟ...</div>
        ) : selectedDevices.length < 2 ? (
          <div className="history-empty-box">
            <span />
            <strong>เลือกอย่างน้อย 2 Device</strong>
            <p>เลือก Device ที่ต้องการเปรียบเทียบจาก Filter ด้านบน</p>
          </div>
        ) : !commonMetrics.length ? (
          <div className="history-empty-box">
            <span />
            <strong>ไม่พบ Value ที่ใช้ร่วมกัน</strong>
            <p>
              Device ที่เลือกต้องมี Value key เดียวกันอย่างน้อยหนึ่งรายการ
            </p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="history-empty-box">
            <span />
            <strong>ยังไม่มีข้อมูลสำหรับ Compare Graph</strong>
            <p>ตรวจสอบช่วงวันที่, Value และ Display Interval</p>
          </div>
        ) : (
          <div className="history-chart-box compare-chart-box">
            <ResponsiveContainer width="100%" height={390}>
              <LineChart
                data={chartData}
                margin={{ top: 18, right: 18, left: -6, bottom: 0 }}
              >
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
                  width={54}
                  domain={['auto', 'auto']}
                  tick={{
                    fontSize: 12,
                    fill: '#94a3b8',
                    fontWeight: 700,
                  }}
                />
                <Tooltip
                  content={
                    <CompareTooltip seriesMap={seriesMap} />
                  }
                  cursor={{
                    stroke: 'rgba(6, 182, 212, 0.7)',
                    strokeDasharray: '3 3',
                  }}
                />
                {series.map((item) => (
                  <Line
                    key={item.dataKey}
                    type="monotone"
                    dataKey={item.dataKey}
                    name={`${item.deviceName} • ${item.metricName}`}
                    stroke={item.color}
                    strokeWidth={2.5}
                    strokeDasharray={item.strokeDasharray || undefined}
                    dot={chartData.length <= 2}
                    activeDot={{ r: 5 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="app-card history-table-card compare-table-card">
        <div className="history-section-title">
          <div>
            <h2>Compare History Table</h2>
            <p>ข้อมูลของทุก Device ที่ใช้สร้างกราฟ เรียงตามเวลาที่เลือก</p>
          </div>

          <div className="history-table-actions">
            <label>
              <span>Rows</span>
              <UnifiedSelect
                value={String(tablePageSize)}
                onChange={(event) =>
                  setTablePageSize(
                    getSafeTablePageSize(event.target.value)
                  )
                }
              >
                {TABLE_PAGE_SIZES.map((pageSize) => (
                  <option key={pageSize} value={pageSize}>
                    {pageSize}
                  </option>
                ))}
              </UnifiedSelect>
            </label>

            <label>
              <span>Sort</span>
              <UnifiedSelect
                value={sortOrder}
                onChange={(event) =>
                  setSortOrder(getSafeSortOrder(event.target.value))
                }
              >
                <option value="desc">Latest first</option>
                <option value="asc">Oldest first</option>
              </UnifiedSelect>
            </label>
          </div>
        </div>

        <div className="history-table-wrap">
          <table className="history-table compare-history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Device</th>
                <th>Status</th>
                <th>Value</th>
                <th>Reading</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="history-table-empty">
                    ยังไม่มีข้อมูล Compare Graph
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatHistoryDate(row.time)}</td>
                    <td>{formatHistoryTime(row.time)}</td>
                    <td>
                      <div className="compare-table-device">
                        <strong>{row.deviceName}</strong>
                        <small>{row.deviceId}</small>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`history-device-status ${row.deviceStatus}`}
                      >
                        {row.deviceStatus}
                      </span>
                    </td>
                    <td>
                      <div className="compare-table-value-name">
                        <strong>{row.metricName}</strong>
                        <small>{row.metricKey}</small>
                      </div>
                    </td>
                    <td className="compare-table-reading">
                      {formatNumber(
                        row.value,
                        '',
                        row.decimalPlaces
                      )}
                    </td>
                    <td>{row.unit || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={tablePage}
          pageSize={tablePageSize}
          total={sortedRows.length}
          onPageChange={setTablePage}
        />
      </section>
    </div>
  )
}

export default CompareGraph
