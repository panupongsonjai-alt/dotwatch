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
  Download,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  FilterActionsMenu,
  PageHeader,
  StatCard,
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
const MAX_SELECTED_SERIES = 16
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
    seriesKeys: [],
    chartResolution: DEFAULT_CHART_RESOLUTION,
    sortOrder: 'desc',
    tablePageSize: DEFAULT_TABLE_PAGE_SIZE,
    hasSavedSeriesSelection: false,
  }

  if (typeof window === 'undefined') return fallback

  try {
    const saved = JSON.parse(
      window.localStorage.getItem(COMPARE_GRAPH_STATE_KEY) || '{}'
    )

    const hasSavedSeriesSelection = Object.prototype.hasOwnProperty.call(
      saved,
      'seriesKeys'
    )

    return {
      deviceIds: Array.isArray(saved.deviceIds)
        ? saved.deviceIds.slice(0, MAX_SELECTED_DEVICES).map(String)
        : fallback.deviceIds,
      startDate: saved.startDate || fallback.startDate,
      endDate: saved.endDate || fallback.endDate,
      seriesKeys: Array.isArray(saved.seriesKeys)
        ? saved.seriesKeys.slice(0, MAX_SELECTED_SERIES).map(String)
        : fallback.seriesKeys,
      chartResolution: getSafeChartResolution(saved.chartResolution),
      sortOrder: getSafeSortOrder(saved.sortOrder),
      tablePageSize: getSafeTablePageSize(saved.tablePageSize),
      hasSavedSeriesSelection,
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

function escapeReportHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
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

function makeSeriesSelectionKey(deviceId, metricKey) {
  return `${String(deviceId)}::${String(metricKey)}`
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
  const autoInitializeSeriesRef = useRef(
    !initialState.hasSavedSeriesSelection
  )

  const [devices, setDevices] = useState([])
  const [selectedDeviceIds, setSelectedDeviceIds] = useState(
    initialState.deviceIds
  )
  const [metricsByDevice, setMetricsByDevice] = useState({})
  const [selectedSeriesKeys, setSelectedSeriesKeys] = useState(
    initialState.seriesKeys
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

  const selectedSeriesKeySet = useMemo(
    () => new Set(selectedSeriesKeys),
    [selectedSeriesKeys]
  )

  const selectedSeries = useMemo(() => {
    const nextSeries = []

    for (const device of selectedDevices) {
      const deviceId = String(device.id)
      const deviceMetrics = metricsByDevice[deviceId] || []

      for (const metric of deviceMetrics) {
        const selectionKey = makeSeriesSelectionKey(
          deviceId,
          metric.metricKey
        )

        if (!selectedSeriesKeySet.has(selectionKey)) continue

        nextSeries.push({
          selectionKey,
          deviceId,
          deviceName: getDeviceName(device),
          deviceStatus: String(device.status || 'offline').toLowerCase(),
          metricKey: metric.metricKey,
          metricName: metric.metricName,
          unit: metric.unit || '',
          decimalPlaces: metric.decimalPlaces,
        })
      }
    }

    return nextSeries
  }, [metricsByDevice, selectedDevices, selectedSeriesKeySet])

  const availableDevices = useMemo(() => {
    const selectedSet = new Set(selectedDeviceIds.map(String))

    return devices.filter(
      (device) => !selectedSet.has(String(device.id))
    )
  }, [devices, selectedDeviceIds])

  const series = useMemo(
    () =>
      selectedSeries.map((item, index) => ({
        ...item,
        dataKey: makeSeriesKey(item.deviceId, item.metricKey),
        color: COMPARE_CHART_COLORS[
          index % COMPARE_CHART_COLORS.length
        ],
        strokeDasharray:
          COMPARE_DASH_PATTERNS[index % COMPARE_DASH_PATTERNS.length],
      })),
    [selectedSeries]
  )

  const seriesMap = useMemo(
    () => new Map(series.map((item) => [item.dataKey, item])),
    [series]
  )

  const activeSeriesDeviceCount = useMemo(
    () => new Set(series.map((item) => item.deviceId)).size,
    [series]
  )

  const chartData = useMemo(() => buildChartData(rows), [rows])

  const historyTableRows = chartData

  const sortedHistoryTableRows = useMemo(() => {
    const direction = sortOrder === 'asc' ? 1 : -1

    return [...historyTableRows].sort((left, right) => {
      const leftTime = new Date(left.time).getTime()
      const rightTime = new Date(right.time).getTime()

      if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0
      if (Number.isNaN(leftTime)) return 1
      if (Number.isNaN(rightTime)) return -1

      return (leftTime - rightTime) * direction
    })
  }, [historyTableRows, sortOrder])

  const totalTablePages = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(sortedHistoryTableRows.length / tablePageSize)
      ),
    [sortedHistoryTableRows.length, tablePageSize]
  )

  const paginatedHistoryTableRows = useMemo(() => {
    const safePage = Math.min(Math.max(1, tablePage), totalTablePages)
    const startIndex = (safePage - 1) * tablePageSize

    return sortedHistoryTableRows.slice(
      startIndex,
      startIndex + tablePageSize
    )
  }, [
    sortedHistoryTableRows,
    tablePage,
    tablePageSize,
    totalTablePages,
  ])

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

  function addDevice(deviceId) {
    const normalizedId = String(deviceId || '')

    if (!normalizedId) return

    setSelectedDeviceIds((current) => {
      if (current.includes(normalizedId)) return current

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

  function removeDevice(deviceId) {
    const normalizedId = String(deviceId)

    setSelectedDeviceIds((current) =>
      current.filter((id) => id !== normalizedId)
    )
    setSelectedSeriesKeys((current) =>
      current.filter(
        (selectionKey) => !selectionKey.startsWith(`${normalizedId}::`)
      )
    )
  }

  function toggleSeries(deviceId, metricKey) {
    const selectionKey = makeSeriesSelectionKey(deviceId, metricKey)

    setSelectedSeriesKeys((current) => {
      if (current.includes(selectionKey)) {
        return current.filter((key) => key !== selectionKey)
      }

      if (current.length >= MAX_SELECTED_SERIES) {
        const message = `เลือก Compare ได้สูงสุด ${MAX_SELECTED_SERIES} Series ต่อครั้ง`
        setError(message)
        showWarningToast(message)
        return current
      }

      setError('')
      return [...current, selectionKey]
    })
  }

  function selectAllDeviceValues(deviceId) {
    const metrics = metricsByDevice[String(deviceId)] || []

    setSelectedSeriesKeys((current) => {
      const currentSet = new Set(current)
      const candidates = metrics
        .map((metric) =>
          makeSeriesSelectionKey(deviceId, metric.metricKey)
        )
        .filter((key) => !currentSet.has(key))
      const availableSlots = Math.max(
        0,
        MAX_SELECTED_SERIES - current.length
      )
      const accepted = candidates.slice(0, availableSlots)

      if (accepted.length < candidates.length) {
        const message = `เลือกเพิ่มได้ ${accepted.length} Series เพราะกำหนดสูงสุด ${MAX_SELECTED_SERIES} Series ต่อครั้ง`
        setNotice(message)
        showWarningToast(message)
      }

      return [...current, ...accepted]
    })
  }

  function clearDeviceValues(deviceId) {
    const deviceKeys = new Set(
      (metricsByDevice[String(deviceId)] || []).map((metric) =>
        makeSeriesSelectionKey(deviceId, metric.metricKey)
      )
    )

    setSelectedSeriesKeys((current) =>
      current.filter((key) => !deviceKeys.has(key))
    )
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
      setSelectedSeriesKeys([])
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
      setSelectedSeriesKeys((current) => {
        const validKeys = new Set()

        for (const device of selectedDevices) {
          const deviceId = String(device.id)

          for (const metric of nextMetricsByDevice[deviceId] || []) {
            validKeys.add(
              makeSeriesSelectionKey(deviceId, metric.metricKey)
            )
          }
        }

        const retained = current
          .filter((key) => validKeys.has(key))
          .slice(0, MAX_SELECTED_SERIES)

        if (!autoInitializeSeriesRef.current) return retained

        autoInitializeSeriesRef.current = false

        if (retained.length) return retained

        return selectedDevices
          .map((device) => {
            const deviceId = String(device.id)
            const firstMetric = nextMetricsByDevice[deviceId]?.[0]

            return firstMetric
              ? makeSeriesSelectionKey(deviceId, firstMetric.metricKey)
              : null
          })
          .filter(Boolean)
          .slice(0, MAX_SELECTED_SERIES)
      })
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
      selectedSeries.length < 2 ||
      !startDate ||
      !endDate
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

      const requests = selectedSeries.map(async (selection) => {
        const result = await getHistory(
          selection.deviceId,
          startDate,
          endDate,
          selection.metricKey,
          { resolution: chartResolution }
        )

        return normalizeHistoryRows(result).map((row) => ({
          ...row,
          id: `${selection.deviceId}-${selection.metricKey}-${row.id}`,
          deviceId: selection.deviceId,
          deviceName: selection.deviceName,
          deviceStatus: selection.deviceStatus,
          metricKey: selection.metricKey,
          metricName: selection.metricName,
          unit: selection.unit,
          decimalPlaces: selection.decimalPlaces,
          seriesKey: makeSeriesKey(
            selection.deviceId,
            selection.metricKey
          ),
        }))
      })

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
    if (!sortedHistoryTableRows.length) return

    const seriesTitle = selectedSeries
      .map((item) => `${item.deviceName} • ${item.metricName}`)
      .join(' | ')
    const csvRows = [
      ['dotWatch Compare Graph Report'],
      ['Devices', selectedDevices.map(getDeviceName).join(' | ')],
      ['Selected Series', seriesTitle],
      ['Start Date', formatDateOnly(startDate)],
      ['End Date', formatDateOnly(endDate)],
      ['Display Interval', selectedResolutionLabel],
      ['Generated At', new Date().toLocaleString('th-TH')],
      [],
      [
        'Date',
        'Time',
        ...series.map(
          (item) =>
            `${item.deviceName} • ${item.metricName}${
              item.unit ? ` (${item.unit})` : ''
            }`
        ),
      ],
    ]

    for (const row of sortedHistoryTableRows) {
      csvRows.push([
        formatHistoryDate(row.time),
        formatHistoryTime(row.time),
        ...series.map((item) => {
          const value = row[item.dataKey]

          return value == null
            ? ''
            : Number(value).toFixed(
                normalizeDecimalPlaces(item.decimalPlaces)
              )
        }),
      ])
    }

    const filename = [
      'dotWatch-compare-graph',
      sanitizeFilename(`${selectedSeries.length}-series`),
      startDate,
      'to',
      endDate,
    ].join('-')

    downloadCsvFile(`${filename}.csv`, csvRows)
    setNotice('ส่งออก Compare Graph CSV สำเร็จ')
    showSuccessToast('ส่งออก Compare Graph CSV สำเร็จ')
  }

  function exportPdf() {
    if (!sortedHistoryTableRows.length) return

    const reportWindow = window.open('', '_blank')

    if (!reportWindow) {
      const message =
        'เบราว์เซอร์บล็อกหน้าต่าง PDF กรุณาอนุญาต Pop-up สำหรับเว็บไซต์นี้'
      setError(message)
      showErrorToast(message)
      return
    }

    reportWindow.opener = null

    const seriesTitle = selectedSeries
      .map(
        (item) =>
          `${item.deviceName} • ${item.metricName}${
            item.unit ? ` (${item.unit})` : ''
          }`
      )
      .join(' | ')
    const deviceTitle = selectedDevices.map(getDeviceName).join(' | ')
    const chartSvg =
      document.querySelector(
        '.compare-chart-box .recharts-wrapper svg'
      )?.outerHTML ||
      '<div class="report-empty">No comparison graph data</div>'
    const reportTitle = [
      'dotWatch Compare Graph',
      sanitizeFilename(`${selectedSeries.length}-series`),
      startDate,
      'to',
      endDate,
    ].join('-')
    const tableHeader = series
      .map(
        (item) => `
          <th>
            <strong>${escapeReportHtml(item.metricName)}</strong>
            <small>${escapeReportHtml(item.deviceName)}</small>
          </th>`
      )
      .join('')
    const tableBody = sortedHistoryTableRows
      .map(
        (row) => `
          <tr>
            <td>${escapeReportHtml(formatHistoryDate(row.time))}</td>
            <td>${escapeReportHtml(formatHistoryTime(row.time))}</td>
            ${series
              .map((item) => {
                const value = row[item.dataKey]

                return `<td>${escapeReportHtml(
                  value == null
                    ? '--'
                    : formatNumber(
                        value,
                        item.unit,
                        item.decimalPlaces
                      )
                )}</td>`
              })
              .join('')}
          </tr>`
      )
      .join('')
    const legendItems = series
      .map(
        (item) => `
          <span class="report-legend-item">
            <i style="background:${escapeReportHtml(item.color)}"></i>
            <b>${escapeReportHtml(item.deviceName)}</b>
            <em>${escapeReportHtml(item.metricName)}</em>
            ${
              item.unit
                ? `<small>${escapeReportHtml(item.unit)}</small>`
                : ''
            }
          </span>`
      )
      .join('')

    const reportHtml = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeReportHtml(reportTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Prompt:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; }
    body {
      margin: 0;
      color: #0f172a;
      background: #fff;
      font-family: 'Inter', 'Prompt', system-ui, -apple-system,
        BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 9px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report { display: grid; gap: 9px; width: 100%; }
    .report-title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding: 2px;
    }
    .report-title h1 { margin: 0; font-size: 20px; }
    .report-title span { color: #64748b; font-size: 8px; font-weight: 700; }
    .report-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 5px 18px;
      padding: 3px 2px;
    }
    .report-meta div {
      display: flex;
      align-items: baseline;
      gap: 7px;
      min-width: 0;
      font-size: 10px;
      font-weight: 800;
    }
    .report-meta span {
      min-width: 86px;
      color: #64748b;
      text-transform: uppercase;
    }
    .report-meta strong {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .report-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 7px;
    }
    .report-stat {
      padding: 8px 9px;
      border: 1px solid #dbe3ef;
      border-top: 3px solid #ef4444;
      border-radius: 8px;
      break-inside: avoid;
    }
    .report-stat span {
      display: block;
      color: #64748b;
      font-size: 7px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .report-stat strong {
      display: block;
      margin-top: 3px;
      font-size: 17px;
      overflow-wrap: anywhere;
    }
    .report-stat small { color: #64748b; font-weight: 700; }
    .report-card {
      padding: 9px;
      border: 1px solid #dbe3ef;
      border-radius: 9px;
    }
    .report-chart-card {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .report-table-card {
      break-inside: auto;
      page-break-inside: auto;
    }
    .report-card h2 { margin: 0 0 3px; font-size: 14px; }
    .report-card p {
      margin: 0 0 7px;
      color: #64748b;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .report-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 0 0 7px;
    }
    .report-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 5px;
      border: 1px solid #dbe3ef;
      border-radius: 999px;
      font-size: 7px;
    }
    .report-legend-item i {
      width: 7px;
      height: 7px;
      border-radius: 999px;
    }
    .report-legend-item b { font-weight: 900; }
    .report-legend-item em {
      color: #475569;
      font-style: normal;
      font-weight: 700;
    }
    .report-legend-item small {
      color: #64748b;
      font-size: 6px;
      font-weight: 800;
    }
    .report-chart {
      width: 100%;
      min-height: 205px;
      padding: 6px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .report-chart svg {
      width: 100% !important;
      height: 205px !important;
    }
    .report-empty {
      min-height: 205px;
      display: grid;
      place-items: center;
      color: #64748b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead { display: table-header-group; }
    th, td {
      padding: 5px 5px;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
      vertical-align: middle;
      overflow-wrap: anywhere;
    }
    th {
      color: #64748b;
      background: #f8fafc;
      font-size: 6.5px;
      font-weight: 900;
      text-transform: uppercase;
    }
    td { font-size: 7.5px; }
    td strong, td small { display: block; }
    td small { color: #64748b; font-size: 6.5px; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .report-footer {
      color: #64748b;
      font-size: 7px;
      text-align: right;
    }
    @media print {
      .report-card { box-shadow: none; }
      .report-table-card { border: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <main class="report">
    <header class="report-title">
      <h1>Compare Graph</h1>
      <span>dotWatch Monitoring Report</span>
    </header>

    <section class="report-meta">
      <div><span>Devices :</span><strong>${escapeReportHtml(
        deviceTitle
      )}</strong></div>
      <div><span>Series :</span><strong>${escapeReportHtml(
        seriesTitle
      )}</strong></div>
      <div><span>Start Date :</span><strong>${escapeReportHtml(
        formatDateOnly(startDate)
      )}</strong></div>
      <div><span>End Date :</span><strong>${escapeReportHtml(
        formatDateOnly(endDate)
      )}</strong></div>
      <div><span>Interval :</span><strong>${escapeReportHtml(
        selectedResolutionLabel
      )}</strong></div>
      <div><span>Generated :</span><strong>${escapeReportHtml(
        new Date().toLocaleString('th-TH')
      )}</strong></div>
    </section>

    <section class="report-stats">
      <div class="report-stat">
        <span>Records</span>
        <strong>${escapeReportHtml(
          rows.length.toLocaleString('th-TH')
        )}</strong>
        <small>All selected readings</small>
      </div>
      <div class="report-stat">
        <span>Devices</span>
        <strong>${escapeReportHtml(activeSeriesDeviceCount)}</strong>
        <small>Devices with selected series</small>
      </div>
      <div class="report-stat">
        <span>Series</span>
        <strong>${escapeReportHtml(series.length)}</strong>
        <small>Compared values</small>
      </div>
      <div class="report-stat">
        <span>Last Update</span>
        <strong>${escapeReportHtml(
          formatDateTime(latestTimestamp)
        )}</strong>
        <small>Latest reading in this report</small>
      </div>
    </section>

    <section class="report-card report-chart-card">
      <h2>Compare Graph</h2>
      <p>${escapeReportHtml(seriesTitle)}</p>
      ${
        legendItems
          ? `<div class="report-legend">${legendItems}</div>`
          : ''
      }
      <div class="report-chart">${chartSvg}</div>
    </section>

    <section class="report-card report-table-card">
      <h2>Compare History Table</h2>
      <p>${escapeReportHtml(
        formatDateOnly(startDate)
      )} - ${escapeReportHtml(
        formatDateOnly(endDate)
      )} • ${escapeReportHtml(selectedResolutionLabel)}</p>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            ${tableHeader}
          </tr>
        </thead>
        <tbody>${tableBody}</tbody>
      </table>
    </section>

    <footer class="report-footer">
      Generated by dotWatch • ${escapeReportHtml(
        new Date().toLocaleString('th-TH')
      )}
    </footer>
  </main>
  <script>
    window.addEventListener('load', async () => {
      try {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready
        }
      } catch (error) {
        console.warn('Unable to wait for report fonts', error)
      }

      setTimeout(() => window.print(), 250)
    })
  </script>
</body>
</html>`

    reportWindow.document.open()
    reportWindow.document.write(reportHtml)
    reportWindow.document.close()

    setNotice('เปิดหน้าต่าง Export PDF แล้ว')
    showSuccessToast('เปิดหน้าต่าง Export PDF แล้ว')
  }

  useEffect(() => {
    loadDevices()
  }, [])

  useEffect(() => {
    setRows([])
    loadSelectedDeviceMetrics()
  }, [selectedDevices])


  useEffect(() => {
    loadCompareHistory()
  }, [
    selectedDeviceIds,
    selectedSeriesKeys,
    startDate,
    endDate,
    chartResolution,
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
    selectedSeriesKeys,
    startDate,
    chartResolution,
    metricsByDevice,
  ])

  useEffect(() => {
    setTablePage(1)
    setNotice('')
  }, [
    selectedDeviceIds,
    selectedSeriesKeys,
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
      seriesKeys: selectedSeriesKeys,
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
    selectedSeriesKeys,
    chartResolution,
    sortOrder,
    tablePageSize,
  ])

  return (
    <div className="page app-page history-page-v2 compare-graph-page">
      <PageHeader
        eyebrow="Data Center"
        title="Compare Graph"
        description="เลือก Value ใดก็ได้จากแต่ละ Device เพื่อเปรียบเทียบกราฟย้อนหลังในช่วงเวลาเดียวกัน"
      />

      <section className="dw-page-stat-grid compare-stat-grid">
        <StatCard
          label="Records"
          value={loadingHistory ? '...' : rows.length.toLocaleString('th-TH')}
          hint="จำนวนจุดข้อมูลทั้งหมดจากทุก Device"
        />
        <StatCard
          label="Devices"
          value={selectedDevices.length}
          hint={`เลือกได้สูงสุด ${MAX_SELECTED_DEVICES} Device ต่อครั้ง`}
        />
        <StatCard
          label="Series"
          value={series.length}
          hint="จำนวน Value ที่เลือกจากทุก Device"
        />
        <StatCard
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
              เลือกคู่ Device และ Value ได้อย่างอิสระ แล้วเปรียบเทียบในช่วงเวลาเดียวกัน
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

            <FilterActionsMenu
              label="Compare Graph export options"
              items={[
                {
                  key: 'csv',
                  label: 'Export CSV',
                  icon: Download,
                  disabled: !sortedHistoryTableRows.length || loadingHistory,
                  onSelect: exportCsv,
                },
                {
                  key: 'pdf',
                  label: 'Export PDF',
                  icon: Download,
                  disabled: !sortedHistoryTableRows.length || loadingHistory,
                  onSelect: exportPdf,
                },
              ]}
            />
          </div>
        </div>

        <div className="compare-series-selector">
          <div className="compare-series-selector-header">
            <div>
              <h3>Compare Series</h3>
              <p>เพิ่ม Device แล้วเลือก Value ที่ต้องการเปรียบเทียบ</p>
            </div>

            <div className="compare-series-selector-summary">
              <span>
                {selectedDevices.length}/{MAX_SELECTED_DEVICES} Devices
              </span>
              <span>
                {selectedSeriesKeys.length}/{MAX_SELECTED_SERIES} Series
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedDeviceIds([])
                  setSelectedSeriesKeys([])
                }}
                disabled={
                  !selectedDeviceIds.length && !selectedSeriesKeys.length
                }
              >
                Clear all
              </button>
            </div>
          </div>

          <div className="compare-device-picker-row">
            <label className="compare-compact-field">
              <span>Add Device</span>
              <UnifiedSelect
                value=""
                onChange={(event) => addDevice(event.target.value)}
                disabled={
                  loadingDevices ||
                  selectedDeviceIds.length >= MAX_SELECTED_DEVICES ||
                  availableDevices.length === 0
                }
                aria-label="เพิ่ม Device สำหรับ Compare Graph"
              >
                <option value="">
                  {loadingDevices
                    ? 'Loading Devices...'
                    : selectedDeviceIds.length >= MAX_SELECTED_DEVICES
                      ? 'Device limit reached'
                      : availableDevices.length
                        ? 'Select Device'
                        : 'All Devices selected'}
                </option>
                {availableDevices.map((device) => (
                  <option key={device.id} value={String(device.id)}>
                    {getDeviceName(device)}
                    {device.device_code ? ` • ${device.device_code}` : ''}
                  </option>
                ))}
              </UnifiedSelect>
            </label>

            <div
              className="compare-selected-device-chips"
              aria-label="Device ที่เลือก"
            >
              {selectedDevices.length === 0 ? (
                <span className="compare-selection-placeholder">
                  ยังไม่ได้เลือก Device
                </span>
              ) : (
                selectedDevices.map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    className="compare-selection-chip compare-device-chip"
                    onClick={() => removeDevice(device.id)}
                    aria-label={`ลบ ${getDeviceName(device)} ออกจากการเปรียบเทียบ`}
                    title="Remove Device"
                  >
                    <i
                      className={`compare-status-dot ${String(
                        device.status || 'offline'
                      ).toLowerCase()}`}
                      aria-hidden="true"
                    />
                    <span>{getDeviceName(device)}</span>
                    <X size={13} aria-hidden="true" />
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedDevices.length === 0 ? (
            <div className="compare-selector-empty">
              เลือก Device เพื่อเพิ่ม Value ที่ต้องการเปรียบเทียบ
            </div>
          ) : loadingMetrics ? (
            <div className="compare-selector-empty">
              กำลังโหลด Value ของ Device ที่เลือก...
            </div>
          ) : (
            <div className="compare-value-rows">
              {selectedDevices.map((device) => {
                const deviceId = String(device.id)
                const deviceMetrics = metricsByDevice[deviceId] || []
                const selectedMetrics = deviceMetrics.filter((metric) =>
                  selectedSeriesKeySet.has(
                    makeSeriesSelectionKey(deviceId, metric.metricKey)
                  )
                )
                const availableMetrics = deviceMetrics.filter(
                  (metric) =>
                    !selectedSeriesKeySet.has(
                      makeSeriesSelectionKey(deviceId, metric.metricKey)
                    )
                )
                const atSeriesLimit =
                  selectedSeriesKeys.length >= MAX_SELECTED_SERIES

                return (
                  <div key={deviceId} className="compare-value-row">
                    <div className="compare-value-row-device">
                      <strong>{getDeviceName(device)}</strong>
                      <small>
                        {selectedMetrics.length}/{deviceMetrics.length} Values
                      </small>
                    </div>

                    <UnifiedSelect
                      className="compare-value-add-select"
                      value=""
                      onChange={(event) => {
                        const metricKey = event.target.value

                        if (metricKey) {
                          toggleSeries(deviceId, metricKey)
                        }
                      }}
                      disabled={
                        !availableMetrics.length || atSeriesLimit
                      }
                      aria-label={`เพิ่ม Value ของ ${getDeviceName(device)}`}
                    >
                      <option value="">
                        {!deviceMetrics.length
                          ? 'No Values'
                          : atSeriesLimit
                            ? 'Series limit reached'
                            : availableMetrics.length
                              ? 'Add Value'
                              : 'All Values selected'}
                      </option>
                      {availableMetrics.map((metric) => (
                        <option
                          key={metric.metricKey}
                          value={metric.metricKey}
                        >
                          {metric.metricName}
                          {metric.unit ? ` • ${metric.unit}` : ''}
                        </option>
                      ))}
                    </UnifiedSelect>

                    <div
                      className="compare-selected-value-chips"
                      aria-label={`Value ที่เลือกจาก ${getDeviceName(device)}`}
                    >
                      {selectedMetrics.length === 0 ? (
                        <span className="compare-selection-placeholder">
                          ยังไม่ได้เลือก Value
                        </span>
                      ) : (
                        selectedMetrics.map((metric) => {
                          const selectionKey = makeSeriesSelectionKey(
                            deviceId,
                            metric.metricKey
                          )

                          return (
                            <button
                              key={selectionKey}
                              type="button"
                              className="compare-selection-chip compare-value-chip"
                              onClick={() =>
                                toggleSeries(deviceId, metric.metricKey)
                              }
                              aria-label={`ลบ ${metric.metricName} ของ ${getDeviceName(
                                device
                              )}`}
                              title="Remove Value"
                            >
                              <span>
                                {metric.metricName}
                                {metric.unit ? ` (${metric.unit})` : ''}
                              </span>
                              <X size={12} aria-hidden="true" />
                            </button>
                          )
                        })
                      )}
                    </div>

                    <div className="compare-value-row-actions">
                      <button
                        type="button"
                        onClick={() => selectAllDeviceValues(deviceId)}
                        disabled={
                          !availableMetrics.length || atSeriesLimit
                        }
                        title="เลือก Value ทั้งหมดของ Device นี้"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => clearDeviceValues(deviceId)}
                        disabled={!selectedMetrics.length}
                        title="ล้าง Value ของ Device นี้"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="compare-value-scale-note">
            แต่ละ Series ใช้ค่าจริงบนแกนเดียวกัน Value ที่มีหน่วยหรือช่วงค่า
            ต่างกันอาจมองเห็นสเกลไม่เท่ากัน
          </p>
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
              {series.length} selected Series • {activeSeriesDeviceCount}{' '}
              Device • {formatDateOnly(startDate)} -{' '}
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
        ) : selectedDevices.length === 0 ? (
          <div className="history-empty-box">
            <span />
            <strong>ยังไม่ได้เลือก Device</strong>
            <p>เลือก Device ที่ต้องการจาก Filter ด้านบน</p>
          </div>
        ) : series.length < 2 ? (
          <div className="history-empty-box">
            <span />
            <strong>เลือกอย่างน้อย 2 Series</strong>
            <p>
              เลือก Value ใดก็ได้จาก Device เดียวกันหรือต่าง Device
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
            <p>
              ข้อมูลทุก {selectedResolutionLabel} โดยแสดงหนึ่งแถวต่อช่วงเวลา
              และหนึ่งคอลัมน์ต่อ Series
            </p>
          </div>

          <div className="history-table-actions">
            <label>
              <span>Show</span>
              <UnifiedSelect
                value={tablePageSize}
                onChange={(event) => {
                  setTablePageSize(
                    getSafeTablePageSize(event.target.value)
                  )
                  setTablePage(1)
                }}
                aria-label="จำนวนแถวต่อหน้า Compare History"
              >
                {TABLE_PAGE_SIZES.map((pageSize) => (
                  <option key={pageSize} value={pageSize}>
                    {pageSize} rows
                  </option>
                ))}
              </UnifiedSelect>
            </label>

            <label>
              <span>Sort</span>
              <UnifiedSelect
                value={sortOrder}
                onChange={(event) => {
                  setSortOrder(getSafeSortOrder(event.target.value))
                  setTablePage(1)
                }}
                aria-label="เรียงลำดับ Compare History"
              >
                <option value="desc">ล่าสุด</option>
                <option value="asc">เก่าสุด</option>
              </UnifiedSelect>
            </label>
          </div>
        </div>

        <div className="history-table-wrap">
          <table
            className="history-table history-table-all-metrics compare-history-table"
            style={{
              minWidth: `${Math.max(760, (series.length + 2) * 180)}px`,
            }}
          >
            <colgroup>
              {Array.from({ length: series.length + 2 }).map((_, index) => (
                <col
                  key={`compare-history-column-${index}`}
                  style={{ width: `${100 / (series.length + 2)}%` }}
                />
              ))}
            </colgroup>

            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                {series.map((item) => (
                  <th key={item.dataKey}>
                    <span className="compare-history-column-title">
                      <strong>{item.metricName}</strong>
                      <small>{item.deviceName}</small>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {historyTableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={series.length + 2}
                    className="history-table-empty"
                  >
                    ยังไม่มีข้อมูลย้อนหลังสำหรับตัวกรองนี้
                  </td>
                </tr>
              ) : (
                paginatedHistoryTableRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatHistoryDate(row.time)}</td>
                    <td>{formatHistoryTime(row.time)}</td>
                    {series.map((item) => {
                      const value = row[item.dataKey]

                      return (
                        <td key={item.dataKey}>
                          <span className="compare-history-value">
                            {value == null
                              ? '--'
                              : formatNumber(
                                  value,
                                  item.unit,
                                  item.decimalPlaces
                                )}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={Math.min(tablePage, totalTablePages)}
          pageSize={tablePageSize}
          total={sortedHistoryTableRows.length}
          onPageChange={setTablePage}
        />
      </section>
    </div>
  )
}

export default CompareGraph
