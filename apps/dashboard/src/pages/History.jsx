import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarDays, Download, RefreshCw, Trash2 } from 'lucide-react'
import {
  ClearFilteredDataDialog,
  FilterActionsMenu,
  PageHeader,
  StatCard,
  TablePagination,
  UnifiedSelect,
} from '../components/common'
import { isWifiRssiMetricConfig } from '../utils/metricDisplayConfig'
import { TABLE_PAGE_SIZE_OPTIONS } from '../utils/tablePageSizePreference'
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from '../utils/uiFeedback'

import {
  clearHistoryRange,
  getDevices,
  getDeviceMetrics,
  getHistory,
  getAlarmRules,
} from '../services/api'
import '../styles/history.css'

const TABLE_PAGE_SIZES = TABLE_PAGE_SIZE_OPTIONS
const DEFAULT_TABLE_PAGE_SIZE = 20

const CHART_RESOLUTION_OPTIONS = [
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '10m', label: '10 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
]
const DEFAULT_CHART_RESOLUTION = '5m'

const HISTORY_STATE_KEY = 'dotwatch.history.analytics.state'

function getSafeTablePage(value) {
  const page = Number(value)

  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

function getSafeTablePageSize(value) {
  const pageSize = Number(value)

  return TABLE_PAGE_SIZES.includes(pageSize)
    ? pageSize
    : DEFAULT_TABLE_PAGE_SIZE
}

function getSafeChartResolution(value) {
  const resolution = String(value || '')
    .trim()
    .toLowerCase()

  return CHART_RESOLUTION_OPTIONS.some((option) => option.value === resolution)
    ? resolution
    : DEFAULT_CHART_RESOLUTION
}

function getSafeSortOrder(value) {
  return String(value || '').toLowerCase() === 'asc' ? 'asc' : 'desc'
}

function getInitialHistoryState() {
  const fallback = {
    deviceId: '',
    startDate: todayInputValue(),
    endDate: todayInputValue(),
    metricKey: 'all',
    tablePage: 1,
    tablePageSize: DEFAULT_TABLE_PAGE_SIZE,
    sortOrder: 'desc',
    chartResolution: DEFAULT_CHART_RESOLUTION,
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
      startDate:
        params.get('startDate') ||
        params.get('from') ||
        params.get('date') ||
        saved.startDate ||
        saved.date ||
        fallback.startDate,
      endDate:
        params.get('endDate') ||
        params.get('to') ||
        params.get('date') ||
        saved.endDate ||
        saved.date ||
        fallback.endDate,
      metricKey:
        params.get('metricKey') || params.get('metric') || fallback.metricKey,
      tablePage: getSafeTablePage(params.get('page') || fallback.tablePage),
      tablePageSize: getSafeTablePageSize(
        params.get('pageSize') || saved.tablePageSize || fallback.tablePageSize
      ),
      sortOrder: getSafeSortOrder(
        params.get('sort') || saved.sortOrder || fallback.sortOrder
      ),
      chartResolution: getSafeChartResolution(
        params.get('resolution') || saved.chartResolution
      ),
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

function escapeReportHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function sanitizeReportFilename(value) {
  return (
    String(value || 'device')
      .trim()
      .replace(/[^a-zA-Z0-9ก-๙_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'device'
  )
}

function escapeCsvField(value) {
  let normalized = String(value ?? '')

  // Prevent spreadsheet applications from evaluating exported text as a formula.
  if (/^[=+@]/.test(normalized) || /^-[^0-9.]/.test(normalized)) {
    normalized = `'${normalized}`
  }

  return `"${normalized.replaceAll('"', '""')}"`
}

function buildCsvText(rows = []) {
  return rows
    .map((row) => row.map((value) => escapeCsvField(value)).join(','))
    .join('\r\n')
}

function downloadCsvFile(filename, rows) {
  const csvText = `\uFEFF${buildCsvText(rows)}`
  const blob = new Blob([csvText], {
    type: 'text/csv;charset=utf-8',
  })
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

function formatDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '--'

  const date = new Date(`${value}T00:00:00.000+07:00`)

  if (Number.isNaN(date.getTime())) return '--'

  return date.toLocaleDateString('th-TH', {
    dateStyle: 'long',
    timeZone: 'Asia/Bangkok',
  })
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

function normalizeDecimalPlaces(value, fallback = 2) {
  const decimalPlaces = Number(value)

  if (!Number.isInteger(decimalPlaces)) return fallback

  return Math.min(6, Math.max(0, decimalPlaces))
}

function formatNumber(value, unit = '', decimalPlaces = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '--'

  const numberValue = Number(value)
  const formatted = numberValue.toFixed(normalizeDecimalPlaces(decimalPlaces))

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
    decimalPlaces: normalizeDecimalPlaces(
      metric.decimal_places ?? metric.decimalPlaces
    ),
  }
}

function getFallbackMetricName(metricKey = '') {
  const index = getMetricIndex(metricKey)

  if (metricKey === 'temperature') return 'Temperature'
  if (metricKey === 'humidity') return 'Humidity'
  if (metricKey === 'rssi') return 'Signal'

  return index > 0 ? `Value ${index}` : metricKey || 'Value'
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
    .filter((metric) => !isWifiRssiMetricConfig(metric))
    .map(normalizeMetric)
    .filter(Boolean)
    .filter((metric) => metric.visible !== false)
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

  const chartDates = new Set(
    sortedRows.map((row) => formatHistoryDate(row.time))
  )
  const includeDateInLabel = chartDates.size > 1

  if (selectedMetricKey !== 'all') {
    return sortedRows.map((row) => ({
      ...row,
      label: formatChartLabel(row.time, includeDateInLabel),
      value: row.value,
    }))
  }

  const map = new Map()

  for (const row of sortedRows) {
    if (!row.time || !row.metricKey) continue

    const existing = map.get(row.time) || {
      id: row.time,
      time: row.time,
      label: formatChartLabel(row.time, includeDateInLabel),
    }

    existing[row.metricKey] = row.value
    map.set(row.time, existing)
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.time) - new Date(b.time)
  )
}

function getMetricName(metricMap, metricKey = '') {
  return (
    metricMap.get(metricKey)?.metricName || getFallbackMetricName(metricKey)
  )
}

function getMetricUnit(metricMap, metricKey = '') {
  return metricMap.get(metricKey)?.unit || ''
}

function getMetricDecimalPlaces(metricMap, metricKey = '') {
  return normalizeDecimalPlaces(metricMap.get(metricKey)?.decimalPlaces)
}

function normalizeHistoryTimeKey(value) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) return String(value || '')

  return date.toISOString()
}

function buildAllMetricsTableRows(rows = []) {
  const map = new Map()

  for (const row of rows) {
    const timeKey = normalizeHistoryTimeKey(row.time)

    if (!timeKey || !row.metricKey) continue

    const existing = map.get(timeKey) || {
      id: timeKey,
      time: row.time,
      values: {},
    }

    existing.values[row.metricKey] = row.value
    map.set(timeKey, existing)
  }

  return Array.from(map.values())
}

function getHistoryTableRows(rows = [], selectedMetricKey = '') {
  if (selectedMetricKey === 'all') {
    return buildAllMetricsTableRows(rows)
  }

  return rows
}

function sortHistoryTableRows(rows = [], sortOrder = 'desc') {
  const direction = getSafeSortOrder(sortOrder) === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    const timeA = new Date(a.time).getTime()
    const timeB = new Date(b.time).getTime()

    if (Number.isNaN(timeA) && Number.isNaN(timeB)) return 0
    if (Number.isNaN(timeA)) return 1
    if (Number.isNaN(timeB)) return -1

    return (timeA - timeB) * direction
  })
}

function formatHistoryTableValue(row, metricMap, selectedUnit = '') {
  const unit = getMetricUnit(metricMap, row.metricKey) || selectedUnit
  const decimalPlaces = getMetricDecimalPlaces(metricMap, row.metricKey)
  const value = formatNumber(row.value, unit, decimalPlaces)

  return value
}

const ALARM_SEVERITY_PRIORITY = {
  critical: 2,
  warning: 1,
}

function normalizeAlarmRule(rule = {}) {
  const metricKey = rule.metric || rule.metric_key || rule.metricKey
  const threshold = Number(rule.threshold)

  if (!metricKey || !Number.isFinite(threshold)) return null

  return {
    id: rule.id,
    deviceId: rule.device_id ?? rule.deviceId,
    metricKey: String(metricKey),
    operator: String(rule.operator || '>').trim(),
    threshold,
    severity: rule.severity === 'critical' ? 'critical' : 'warning',
    isActive: rule.is_active !== false && rule.isActive !== false,
    notificationMessage:
      rule.notification_message || rule.notificationMessage || '',
  }
}

function alarmRuleMatchesValue(rule, value) {
  const numericValue = Number(value)

  if (!rule || !Number.isFinite(numericValue)) return false

  switch (rule.operator) {
    case '>':
      return numericValue > rule.threshold
    case '>=':
      return numericValue >= rule.threshold
    case '<':
      return numericValue < rule.threshold
    case '<=':
      return numericValue <= rule.threshold
    case '=':
    case '==':
      return numericValue === rule.threshold
    case '!=':
      return numericValue !== rule.threshold
    default:
      return false
  }
}

function getAlarmEvaluation(value, metricKey, alarmRules = []) {
  const metricRules = alarmRules.filter(
    (rule) => rule.isActive && String(rule.metricKey) === String(metricKey)
  )

  if (!metricRules.length) {
    return {
      hasRules: false,
      severity: 'none',
      label: 'No Rule',
      rule: null,
    }
  }

  const matchedRule = metricRules
    .filter((rule) => alarmRuleMatchesValue(rule, value))
    .sort(
      (a, b) =>
        (ALARM_SEVERITY_PRIORITY[b.severity] || 0) -
        (ALARM_SEVERITY_PRIORITY[a.severity] || 0)
    )[0]

  if (matchedRule) {
    return {
      hasRules: true,
      severity: matchedRule.severity,
      label: matchedRule.severity === 'critical' ? 'Critical' : 'Warning',
      rule: matchedRule,
    }
  }

  return {
    hasRules: true,
    severity: 'normal',
    label: 'Normal',
    rule: null,
  }
}

function getAlarmRuleColor(severity) {
  return severity === 'critical' ? '#ef4444' : '#f59e0b'
}

function formatAlarmRuleSummary(rule, metricMap, includeMetricName = false) {
  const metricName = getMetricName(metricMap, rule.metricKey)
  const unit = getMetricUnit(metricMap, rule.metricKey)
  const severityLabel = rule.severity === 'critical' ? 'Critical' : 'Warning'
  const decimalPlaces = getMetricDecimalPlaces(metricMap, rule.metricKey)
  const condition = `${rule.operator} ${formatNumber(
    rule.threshold,
    unit,
    decimalPlaces
  )}`

  return `${includeMetricName ? `${metricName} • ` : ''}${severityLabel} ${condition}`
}

function HistoryAlarmBadge({ evaluation, compact = false }) {
  if (!evaluation?.hasRules) {
    return (
      <span
        className="history-alarm-badge no-rule"
        title="Value นี้ยังไม่มี Active Alarm Rule"
      >
        {compact ? '—' : 'No Rule'}
      </span>
    )
  }

  const title = evaluation.rule
    ? `${evaluation.label}: ${evaluation.rule.operator} ${evaluation.rule.threshold}${
        evaluation.rule.notificationMessage
          ? ` • ${evaluation.rule.notificationMessage}`
          : ''
      }`
    : 'ค่าปกติ ไม่เข้าเงื่อนไข Alarm'

  return (
    <span
      className={`history-alarm-badge ${evaluation.severity} ${
        compact ? 'compact' : ''
      }`}
      title={title}
    >
      {compact && evaluation.severity === 'critical'
        ? 'C'
        : compact && evaluation.severity === 'warning'
          ? 'W'
          : compact && evaluation.severity === 'normal'
            ? 'OK'
            : evaluation.label}
    </span>
  )
}

function HistoryMetricAlarmValue({ value, unit, decimalPlaces, evaluation }) {
  return (
    <div
      className={`history-metric-alarm-value ${evaluation?.severity || 'none'}`}
    >
      <span>{formatNumber(value, unit, decimalPlaces)}</span>
      <HistoryAlarmBadge evaluation={evaluation} compact />
    </div>
  )
}

function HistoryStatCard({ label, value, hint }) {
  return <StatCard label={label} value={value} hint={hint} />
}

function HistoryTooltip({ active, payload, label, metricMap }) {
  if (!active || !payload?.length) return null

  return (
    <div className="history-tooltip">
      <strong>{label}</strong>

      {payload.map((item) => {
        const unit = getMetricUnit(metricMap, item.dataKey)
        const name = getMetricName(metricMap, item.dataKey)
        const decimalPlaces = getMetricDecimalPlaces(metricMap, item.dataKey)

        return (
          <span key={item.dataKey}>
            {name}: {formatNumber(item.value, unit, decimalPlaces)}
          </span>
        )
      })}
    </div>
  )
}

function History() {
  const initialHistoryState = useMemo(() => getInitialHistoryState(), [])
  const previousFilterSignatureRef = useRef('')
  const startDateInputRef = useRef(null)
  const endDateInputRef = useRef(null)
  const metricsRequestRef = useRef(0)
  const alarmRulesRequestRef = useRef(0)
  const historyRequestRef = useRef(0)
  const [devices, setDevices] = useState([])
  const [metrics, setMetrics] = useState([])
  const [alarmRules, setAlarmRules] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(
    initialHistoryState.deviceId
  )
  const [startDate, setStartDate] = useState(initialHistoryState.startDate)
  const [endDate, setEndDate] = useState(initialHistoryState.endDate)
  const [selectedMetricKey, setSelectedMetricKey] = useState(
    initialHistoryState.metricKey
  )
  const [rows, setRows] = useState([])
  const [chartRows, setChartRows] = useState([])
  const [tablePage, setTablePage] = useState(initialHistoryState.tablePage)
  const [tablePageSize, setTablePageSize] = useState(
    initialHistoryState.tablePageSize
  )
  const [sortOrder, setSortOrder] = useState(initialHistoryState.sortOrder)
  const [chartResolution, setChartResolution] = useState(
    initialHistoryState.chartResolution
  )
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingChart, setLoadingChart] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [exportFormat, setExportFormat] = useState('pdf')

  const selectedDevice = useMemo(
    () =>
      devices.find(
        (device) => String(device.id) === String(selectedDeviceId)
      ) || null,
    [devices, selectedDeviceId]
  )

  const selectedMetric = useMemo(
    () =>
      selectedMetricKey === 'all'
        ? {
            metricKey: 'all',
            metricName: 'All Values',
            unit: '',
          }
        : metrics.find((metric) => metric.metricKey === selectedMetricKey) ||
          null,
    [metrics, selectedMetricKey]
  )

  const metricMap = useMemo(() => {
    return new Map(metrics.map((metric) => [metric.metricKey, metric]))
  }, [metrics])

  const orderedChartRows = useMemo(() => {
    return [...chartRows].sort((a, b) => {
      const timeA = new Date(a.time).getTime()
      const timeB = new Date(b.time).getTime()

      if (Number.isNaN(timeA) || Number.isNaN(timeB)) return 0

      return timeA - timeB
    })
  }, [chartRows])

  const chartData = useMemo(
    () => buildChartData(orderedChartRows, selectedMetricKey, metrics),
    [orderedChartRows, selectedMetricKey, metrics]
  )

  const chartSeries = useMemo(() => {
    if (selectedMetricKey === 'all') {
      const availableMetricKeys = new Set(chartRows.map((row) => row.metricKey))

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
  }, [chartRows, metrics, selectedMetric, selectedMetricKey])

  const activeAlarmRules = useMemo(
    () => alarmRules.filter((rule) => rule.isActive),
    [alarmRules]
  )

  const alarmReferenceRules = useMemo(() => {
    const visibleMetricKeys =
      selectedMetricKey === 'all'
        ? new Set(chartSeries.map((series) => series.dataKey))
        : new Set([selectedMetricKey])

    return activeAlarmRules
      .filter((rule) => visibleMetricKeys.has(rule.metricKey))
      .sort((a, b) => {
        const metricCompare = a.metricKey.localeCompare(b.metricKey)

        if (metricCompare !== 0) return metricCompare

        return (
          (ALARM_SEVERITY_PRIORITY[a.severity] || 0) -
          (ALARM_SEVERITY_PRIORITY[b.severity] || 0)
        )
      })
  }, [activeAlarmRules, chartSeries, selectedMetricKey])

  const filteredRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const timeA = new Date(a.time).getTime()
      const timeB = new Date(b.time).getTime()

      if (Number.isNaN(timeA) || Number.isNaN(timeB)) return 0

      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB
    })
  }, [rows, sortOrder])

  const historyTableRows = useMemo(() => {
    const groupedRows = getHistoryTableRows(rows, selectedMetricKey)
    return sortHistoryTableRows(groupedRows, sortOrder)
  }, [rows, selectedMetricKey, sortOrder])

  const totalHistoryTablePages = useMemo(() => {
    return Math.max(1, Math.ceil(historyTableRows.length / tablePageSize))
  }, [historyTableRows.length, tablePageSize])

  const paginatedHistoryTableRows = useMemo(() => {
    const safePage = Math.min(Math.max(tablePage, 1), totalHistoryTablePages)
    const startIndex = (safePage - 1) * tablePageSize

    return historyTableRows.slice(startIndex, startIndex + tablePageSize)
  }, [historyTableRows, tablePage, tablePageSize, totalHistoryTablePages])

  const historyTableStartRow = historyTableRows.length
    ? (Math.min(Math.max(tablePage, 1), totalHistoryTablePages) - 1) *
        tablePageSize +
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
    const requestId = metricsRequestRef.current + 1
    metricsRequestRef.current = requestId

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

      if (requestId !== metricsRequestRef.current) return

      apiMetrics = Array.isArray(result?.metrics)
        ? result.metrics
        : Array.isArray(result)
          ? result
          : []
    } catch (err) {
      if (requestId !== metricsRequestRef.current) return
      console.warn('History value config fallback:', err)
    }

    const nextMetrics = mergeMetrics(
      apiMetrics,
      metricsFromDeviceConfig(device)
    )

    if (requestId !== metricsRequestRef.current) return

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

  async function loadAlarmRules(deviceId) {
    const requestId = alarmRulesRequestRef.current + 1
    alarmRulesRequestRef.current = requestId

    if (!deviceId) {
      setAlarmRules([])
      return
    }

    try {
      const result = await getAlarmRules(deviceId)

      if (requestId !== alarmRulesRequestRef.current) return

      const nextRules = toArray(result)
        .map(normalizeAlarmRule)
        .filter(Boolean)
        .filter((rule) => String(rule.deviceId) === String(deviceId))

      setAlarmRules(nextRules)
    } catch (err) {
      if (requestId !== alarmRulesRequestRef.current) return

      console.warn('History alarm rules unavailable:', err)
      setAlarmRules([])
    }
  }

  async function loadHistory({ silent = false } = {}) {
    const requestId = historyRequestRef.current + 1
    historyRequestRef.current = requestId

    if (!selectedDeviceId || !selectedMetricKey || !startDate || !endDate) {
      setRows([])
      setChartRows([])
      setLoadingHistory(false)
      setLoadingChart(false)
      return
    }

    if (startDate > endDate) {
      setRows([])
      setChartRows([])
      setLoadingHistory(false)
      setLoadingChart(false)
      setError('Start Date ต้องไม่มากกว่า End Date')
      showWarningToast('Start Date ต้องไม่มากกว่า End Date')
      return
    }

    try {
      if (!silent) {
        setLoadingHistory(true)
        setLoadingChart(true)
      }
      setError('')

      let nextRows = []

      if (selectedMetricKey === 'all') {
        const results = await Promise.all(
          metrics.map(async (metric) => {
            const result = await getHistory(
              selectedDeviceId,
              startDate,
              endDate,
              metric.metricKey,
              { resolution: chartResolution }
            )

            return normalizeHistoryRows(result).map((row) => ({
              ...row,
              metricKey: metric.metricKey,
            }))
          })
        )

        nextRows = results.flat()
      } else {
        const result = await getHistory(
          selectedDeviceId,
          startDate,
          endDate,
          selectedMetricKey,
          { resolution: chartResolution }
        )

        nextRows = normalizeHistoryRows(result).map((row) => ({
          ...row,
          metricKey: row.metricKey || selectedMetricKey,
        }))
      }

      if (requestId !== historyRequestRef.current) return

      // Use one normalized data set for both Trend Graph and History Table.
      // This keeps both sections synchronized with the selected display interval.
      setRows(nextRows)
      setChartRows(nextRows)
    } catch (err) {
      if (requestId !== historyRequestRef.current) return

      console.error('History loadHistory error:', err)
      setRows([])
      setChartRows([])
      setError(err.message || 'โหลดข้อมูลย้อนหลังไม่สำเร็จ')
    } finally {
      if (requestId === historyRequestRef.current && !silent) {
        setLoadingHistory(false)
        setLoadingChart(false)
      }
    }
  }

  function exportCsvReport() {
    if (!historyTableRows.length) return

    const deviceName =
      selectedDevice?.name ||
      selectedDevice?.device_code ||
      `Device ${selectedDeviceId}`
    const metricTitle =
      selectedMetricKey === 'all'
        ? 'All Values'
        : selectedMetric?.metricName || selectedMetricKey
    const fileBaseName = [
      'dotWatch-history',
      sanitizeReportFilename(deviceName),
      startDate,
      'to',
      endDate,
    ].join('-')
    const csvRows = [
      ['dotWatch History Report'],
      ['Device Name', deviceName],
      ['Value', metricTitle],
      ['Start Date', formatDateOnly(startDate)],
      ['End Date', formatDateOnly(endDate)],
      ['Display Interval', selectedResolutionLabel],
      ['Generated At', new Date().toLocaleString('th-TH')],
      [],
      ['Summary'],
      ['Records', historyTableRows.length],
      [
        'Average',
        formatNumber(stats.average, selectedUnit, selectedDecimalPlaces),
      ],
      ['Minimum', formatNumber(stats.min, selectedUnit, selectedDecimalPlaces)],
      ['Maximum', formatNumber(stats.max, selectedUnit, selectedDecimalPlaces)],
    ]

    if (alarmReferenceRules.length) {
      csvRows.push(
        [],
        ['Alarm Rules'],
        [
          'Severity',
          'Value',
          'Condition',
          'Threshold',
          'Unit',
          'Active',
          'Notification Message',
        ]
      )

      for (const rule of alarmReferenceRules) {
        csvRows.push([
          rule.severity === 'critical' ? 'Critical' : 'Warning',
          getMetricName(metricMap, rule.metricKey),
          rule.operator,
          rule.threshold,
          getMetricUnit(metricMap, rule.metricKey),
          rule.isActive ? 'Yes' : 'No',
          rule.notificationMessage || '',
        ])
      }
    }

    csvRows.push([], ['History Data'])

    if (selectedMetricKey === 'all') {
      const header = ['Date', 'Time']

      for (const metric of metrics) {
        header.push(
          metric.metricName,
          `${metric.metricName} Unit`,
          `${metric.metricName} Alarm Status`
        )
      }

      csvRows.push(header)

      for (const row of historyTableRows) {
        const csvRow = [
          formatHistoryDate(row.time),
          formatHistoryTime(row.time),
        ]

        for (const metric of metrics) {
          const value = row.values?.[metric.metricKey]

          if (value == null) {
            csvRow.push('', metric.unit || '', '')
            continue
          }

          const evaluation = getAlarmEvaluation(
            value,
            metric.metricKey,
            activeAlarmRules
          )

          csvRow.push(
            Number(value).toFixed(normalizeDecimalPlaces(metric.decimalPlaces)),
            metric.unit || '',
            evaluation.label
          )
        }

        csvRows.push(csvRow)
      }
    } else {
      csvRows.push([
        'Date',
        'Time',
        'Value Key',
        'Value Name',
        'Value',
        'Unit',
        'Alarm Status',
      ])

      for (const row of historyTableRows) {
        const metricKey = row.metricKey || selectedMetricKey
        const metric = metricMap.get(metricKey) || selectedMetric
        const evaluation = getAlarmEvaluation(
          row.value,
          metricKey,
          activeAlarmRules
        )

        csvRows.push([
          formatHistoryDate(row.time),
          formatHistoryTime(row.time),
          metricKey,
          metric?.metricName || metricKey,
          Number(row.value).toFixed(
            normalizeDecimalPlaces(metric?.decimalPlaces)
          ),
          metric?.unit || selectedUnit,
          evaluation.label,
        ])
      }
    }

    downloadCsvFile(`${fileBaseName}.csv`, csvRows)
    setError('')
    setNotice('ส่งออกไฟล์ CSV สำเร็จ')
    showSuccessToast('ส่งออกไฟล์ CSV สำเร็จ')
  }

  function handleExport(exportFormat) {
    setNotice('')
    setError('')

    if (exportFormat === 'csv') {
      exportCsvReport()
      return
    }

    exportPdfReport()
  }

  function exportPdfReport() {
    if (!historyTableRows.length) return

    const reportWindow = window.open('', '_blank')

    if (!reportWindow) {
      const message =
        'เบราว์เซอร์บล็อกหน้าต่าง PDF กรุณาอนุญาต Pop-up สำหรับเว็บไซต์นี้'
      setError(message)
      showErrorToast(message)
      return
    }

    reportWindow.opener = null

    const deviceName =
      selectedDevice?.name ||
      selectedDevice?.device_code ||
      `Device ${selectedDeviceId}`
    const metricTitle =
      selectedMetricKey === 'all'
        ? 'All Values'
        : selectedMetric?.metricName || selectedMetricKey
    const chartSvg =
      document.querySelector('.history-chart-box .recharts-wrapper svg')
        ?.outerHTML || '<div class="report-empty">No trend data</div>'
    const alarmChips = alarmReferenceRules
      .map(
        (rule) => `
          <span class="report-alarm-chip ${escapeReportHtml(rule.severity)}">
            ${escapeReportHtml(
              formatAlarmRuleSummary(
                rule,
                metricMap,
                selectedMetricKey === 'all'
              )
            )}
          </span>`
      )
      .join('')

    const tableHeader =
      selectedMetricKey === 'all'
        ? `
          <tr>
            <th>Date</th>
            <th>Time</th>
            ${metrics
              .map(
                (metric) => `<th>${escapeReportHtml(metric.metricName)}</th>`
              )
              .join('')}
          </tr>`
        : `
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>${escapeReportHtml(selectedMetric?.metricName || 'Value')}</th>
            <th>Alarm Status</th>
          </tr>`

    const tableBody =
      selectedMetricKey === 'all'
        ? historyTableRows
            .map(
              (row) => `
                <tr>
                  <td>${escapeReportHtml(formatHistoryDate(row.time))}</td>
                  <td>${escapeReportHtml(formatHistoryTime(row.time))}</td>
                  ${metrics
                    .map((metric) => {
                      const value = row.values?.[metric.metricKey]

                      if (value == null) return '<td>--</td>'

                      const evaluation = getAlarmEvaluation(
                        value,
                        metric.metricKey,
                        activeAlarmRules
                      )

                      return `
                        <td>
                          <strong>${escapeReportHtml(
                            formatNumber(
                              value,
                              metric.unit || '',
                              metric.decimalPlaces
                            )
                          )}</strong>
                          <span class="report-status ${escapeReportHtml(
                            evaluation.severity
                          )}">${escapeReportHtml(evaluation.label)}</span>
                        </td>`
                    })
                    .join('')}
                </tr>`
            )
            .join('')
        : historyTableRows
            .map((row) => {
              const evaluation = getAlarmEvaluation(
                row.value,
                row.metricKey || selectedMetricKey,
                activeAlarmRules
              )

              return `
                <tr>
                  <td>${escapeReportHtml(formatHistoryDate(row.time))}</td>
                  <td>${escapeReportHtml(formatHistoryTime(row.time))}</td>
                  <td><strong>${escapeReportHtml(
                    formatHistoryTableValue(row, metricMap, selectedUnit)
                  )}</strong></td>
                  <td><span class="report-status ${escapeReportHtml(
                    evaluation.severity
                  )}">${escapeReportHtml(evaluation.label)}</span></td>
                </tr>`
            })
            .join('')

    const reportTitle = `dotWatch History - ${sanitizeReportFilename(deviceName)} - ${startDate}-to-${endDate}`
    const reportHtml = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeReportHtml(reportTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Prompt:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; }
    body {
      margin: 0;
      color: #0f172a;
      background: #fff;
      font-family: 'Inter', 'Prompt', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 10px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report { display: grid; gap: 9px; width: 100%; }
    .report-header { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 18px; padding: 3px 2px; }
    .report-header div { display: flex; align-items: baseline; gap: 7px; min-width: 0; font-size: 12px; font-weight: 800; }
    .report-header span { min-width: 82px; color: #64748b; text-transform: uppercase; }
    .report-header strong { min-width: 0; overflow-wrap: anywhere; }
    .report-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
    .report-stat { padding: 8px 9px; border: 1px solid #dbe3ef; border-top: 3px solid #ef4444; border-radius: 8px; break-inside: avoid; }
    .report-stat span { display: block; color: #64748b; font-size: 8px; font-weight: 900; text-transform: uppercase; }
    .report-stat strong { display: block; margin-top: 3px; font-size: 18px; }
    .report-stat small { color: #64748b; font-weight: 700; }
    .report-card { padding: 9px; border: 1px solid #dbe3ef; border-radius: 9px; }
    .report-chart-card { break-inside: avoid; page-break-inside: avoid; }
    .report-table-card { break-inside: auto; page-break-inside: auto; }
    .report-card h2 { margin: 0 0 3px; font-size: 14px; }
    .report-card p { margin: 0 0 7px; color: #64748b; font-weight: 700; }
    .report-chart { width: 100%; min-height: 205px; padding: 6px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .report-chart svg { width: 100% !important; height: 205px !important; }
    .report-empty { min-height: 205px; display: grid; place-items: center; color: #64748b; }
    .report-alarms { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
    .report-alarm-chip { padding: 3px 6px; border-radius: 999px; font-size: 7px; font-weight: 900; border: 1px solid #f59e0b; color: #b45309; background: #fff7ed; }
    .report-alarm-chip.critical { border-color: #ef4444; color: #dc2626; background: #fef2f2; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th, td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: middle; overflow-wrap: anywhere; }
    th { color: #64748b; background: #f8fafc; font-size: 7px; font-weight: 900; text-transform: uppercase; }
    td { font-size: 8px; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .report-status { display: inline-block; margin-left: 3px; padding: 1px 4px; border-radius: 999px; color: #15803d; background: #dcfce7; font-size: 6px; font-weight: 900; white-space: nowrap; }
    .report-status.warning { color: #b45309; background: #fef3c7; }
    .report-status.critical { color: #dc2626; background: #fee2e2; }
    .report-status.none { color: #64748b; background: #e2e8f0; }
    .report-footer { color: #64748b; font-size: 7px; text-align: right; }
    @media print {
      .report-card { box-shadow: none; }
      .report-table-card { border: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <main class="report">
    <header class="report-header">
      <div><span>Device Name :</span><strong>${escapeReportHtml(deviceName)}</strong></div>
      <div><span>Value :</span><strong>${escapeReportHtml(metricTitle)}</strong></div>
      <div><span>Start Date :</span><strong>${escapeReportHtml(formatDateOnly(startDate))}</strong></div>
      <div><span>End Date :</span><strong>${escapeReportHtml(formatDateOnly(endDate))}</strong></div>
    </header>

    <section class="report-stats">
      <div class="report-stat"><span>Records</span><strong>${escapeReportHtml(historyTableRows.length.toLocaleString('th-TH'))}</strong><small>Filtered rows</small></div>
      <div class="report-stat"><span>Average</span><strong>${escapeReportHtml(formatNumber(stats.average, selectedUnit, selectedDecimalPlaces))}</strong><small>${escapeReportHtml(metricTitle)}</small></div>
      <div class="report-stat"><span>Min</span><strong>${escapeReportHtml(formatNumber(stats.min, selectedUnit, selectedDecimalPlaces))}</strong><small>Lowest value</small></div>
      <div class="report-stat"><span>Max</span><strong>${escapeReportHtml(formatNumber(stats.max, selectedUnit, selectedDecimalPlaces))}</strong><small>Highest value</small></div>
    </section>

    <section class="report-card report-chart-card">
      <h2>Trend Graph</h2>
      <p>${escapeReportHtml(metricTitle)} from ${escapeReportHtml(deviceName)} • ${escapeReportHtml(selectedResolutionLabel)}</p>
      ${alarmChips ? `<div class="report-alarms">${alarmChips}</div>` : ''}
      <div class="report-chart">${chartSvg}</div>
    </section>

    <section class="report-card report-table-card">
      <h2>History Table</h2>
      <p>Start ${escapeReportHtml(formatDateOnly(startDate))} - End ${escapeReportHtml(formatDateOnly(endDate))} • ${escapeReportHtml(selectedResolutionLabel)}</p>
      <table>
        <thead>${tableHeader}</thead>
        <tbody>${tableBody}</tbody>
      </table>
    </section>

    <footer class="report-footer">Generated by dotWatch • ${escapeReportHtml(new Date().toLocaleString('th-TH'))}</footer>
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
  }

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

  function openClearDialog() {
    if (!historyTableRows.length || loadingHistory || clearingHistory) return

    setClearDialogOpen(true)
  }

  function closeClearDialog() {
    if (clearingHistory) return

    setClearDialogOpen(false)
  }

  async function handleClearHistory() {
    if (!selectedDeviceId || !startDate || !endDate || !selectedMetricKey) {
      return
    }

    try {
      setClearingHistory(true)
      setError('')
      setNotice('')

      const result = await clearHistoryRange(
        selectedDeviceId,
        startDate,
        endDate,
        selectedMetricKey === 'all' ? '' : selectedMetricKey
      )

      const deletedCount =
        Number(result?.deletedCount ?? result?.deleted_count ?? 0) +
        Number(result?.legacyDeletedCount ?? result?.legacy_deleted_count ?? 0)

      setRows([])
      setChartRows([])
      setTablePage(1)
      setClearDialogOpen(false)
      const clearMessage =
        deletedCount > 0
          ? `ลบข้อมูลย้อนหลังสำเร็จ ${deletedCount.toLocaleString('th-TH')} รายการ`
          : 'ไม่พบข้อมูลย้อนหลังที่ตรงกับตัวกรองสำหรับลบ'
      setNotice(clearMessage)
      showSuccessToast(clearMessage)

      await loadHistory()
    } catch (err) {
      console.error('History clear data error:', err)
      setError(err.message || 'ลบข้อมูลย้อนหลังไม่สำเร็จ')
    } finally {
      setClearingHistory(false)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [])

  useEffect(() => {
    if (!selectedDeviceId || !devices.length) return

    setMetrics([])
    setAlarmRules([])
    setRows([])
    setChartRows([])
    loadMetrics(selectedDeviceId)
    loadAlarmRules(selectedDeviceId)
  }, [selectedDeviceId, devices])

  useEffect(() => {
    loadHistory()
  }, [
    selectedDeviceId,
    selectedMetricKey,
    startDate,
    endDate,
    metrics,
    chartResolution,
  ])

  useEffect(() => {
    if (
      !selectedDeviceId ||
      !selectedMetricKey ||
      !endDate ||
      endDate !== todayInputValue() ||
      String(selectedDevice?.status || '').toLowerCase() !== 'online'
    ) {
      return undefined
    }

    const recordIntervalMs =
      Number(selectedDevice?.record_interval_seconds || 30) * 1000
    const refreshMs = Math.min(60_000, Math.max(10_000, recordIntervalMs))

    const timerId = window.setInterval(() => {
      loadHistory({ silent: true })
    }, refreshMs)

    return () => window.clearInterval(timerId)
  }, [
    selectedDeviceId,
    selectedMetricKey,
    startDate,
    endDate,
    selectedDevice?.status,
    selectedDevice?.record_interval_seconds,
    metrics,
    chartResolution,
  ])

  useEffect(() => {
    const filterSignature = `${selectedDeviceId}|${selectedMetricKey}|${startDate}|${endDate}|${chartResolution}`

    if (!previousFilterSignatureRef.current) {
      previousFilterSignatureRef.current = filterSignature
      return
    }

    if (previousFilterSignatureRef.current !== filterSignature) {
      previousFilterSignatureRef.current = filterSignature
      setTablePage(1)
      setNotice('')
    }
  }, [selectedDeviceId, selectedMetricKey, startDate, endDate, chartResolution])

  useEffect(() => {
    if (tablePage > totalHistoryTablePages) {
      setTablePage(totalHistoryTablePages)
    }
  }, [tablePage, totalHistoryTablePages])

  useEffect(() => {
    setTablePage(1)
  }, [tablePageSize])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const state = {
      deviceId: selectedDeviceId,
      startDate,
      endDate,
      metricKey: selectedMetricKey,
      tablePage,
      tablePageSize,
      sortOrder,
      chartResolution,
    }

    try {
      window.localStorage.setItem(HISTORY_STATE_KEY, JSON.stringify(state))

      const params = new URLSearchParams(window.location.search)

      if (selectedDeviceId) params.set('deviceId', selectedDeviceId)
      else params.delete('deviceId')

      if (startDate) params.set('startDate', startDate)
      else params.delete('startDate')

      if (endDate) params.set('endDate', endDate)
      else params.delete('endDate')

      params.delete('date')

      if (selectedMetricKey) params.set('metricKey', selectedMetricKey)
      else params.delete('metricKey')

      params.set('page', String(tablePage))
      params.set('pageSize', String(tablePageSize))
      params.set('sort', sortOrder)
      params.set('resolution', chartResolution)

      const query = params.toString()
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`

      window.history.replaceState(null, '', nextUrl)
    } catch (error) {
      console.warn('History state persist failed:', error)
    }
  }, [
    selectedDeviceId,
    startDate,
    endDate,
    selectedMetricKey,
    tablePage,
    tablePageSize,
    sortOrder,
    chartResolution,
  ])

  const selectedResolutionLabel =
    CHART_RESOLUTION_OPTIONS.find((option) => option.value === chartResolution)
      ?.label || chartResolution

  const selectedUnit =
    selectedMetricKey === 'all' ? '' : selectedMetric?.unit || ''
  const selectedDecimalPlaces =
    selectedMetricKey === 'all'
      ? 2
      : normalizeDecimalPlaces(selectedMetric?.decimalPlaces)

  return (
    <div className="page app-page history-page-v2">
      <PageHeader
        eyebrow="Data Center"
        title="History Analytics"
        description="ตรวจสอบข้อมูลย้อนหลังของอุปกรณ์และ Value ที่เลือก พร้อมแสดงผลเป็นกราฟและตาราง"
      />

      <section className="history-stat-grid history-stat-grid-tight">
        <HistoryStatCard
          label="Records"
          value={loadingHistory ? '...' : filteredRows.length}
          hint="จำนวนรายการข้อมูลย้อนหลังที่ตรงกับตัวกรอง"
        />

        <HistoryStatCard
          label="Min"
          value={formatNumber(stats.min, selectedUnit, selectedDecimalPlaces)}
          hint="ค่าต่ำสุด"
        />
        <HistoryStatCard
          label="Average"
          value={formatNumber(
            stats.average,
            selectedUnit,
            selectedDecimalPlaces
          )}
          hint={selectedMetricKey === 'ค่าเฉลี่ย' ? 'ค่าเฉลี่ย' : 'ค่าเฉลี่ย'}
        />
        <HistoryStatCard
          label="Max"
          value={formatNumber(stats.max, selectedUnit, selectedDecimalPlaces)}
          hint="ค่าสูงสุด"
        />
      </section>

      <section className="app-card history-filter-card">
        <div className="history-section-title">
          <div>
            <h2>Filter</h2>
            <p>เลือก Device, ช่วงวันที่, Value และช่วงเวลาที่ต้องการแสดงผล</p>
          </div>
          <div className="filter-header-actions">
            <button
              type="button"
              className="secondary-button filter-refresh-button"
              onClick={() => {
                const today = todayInputValue()
                setStartDate(today)
                setEndDate(today)
              }}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <FilterActionsMenu
              label="History filter actions"
              items={[
                { key: 'csv', label: 'Export CSV', icon: Download, disabled: !filteredRows.length || loadingHistory, onSelect: () => handleExport('csv') },
                { key: 'pdf', label: 'Export PDF', icon: Download, disabled: !filteredRows.length || loadingHistory, onSelect: () => handleExport('pdf') },
                { key: 'clear', label: 'Clear Data', icon: Trash2, tone: 'danger', disabled: !historyTableRows.length || loadingHistory || clearingHistory, onSelect: openClearDialog },
              ]}
            />
          </div>
        </div>

        <div className="history-filter-grid">
          <label>
            <span>Device</span>
            <UnifiedSelect
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
            </UnifiedSelect>
          </label>

          <div className="history-filter-field">
            <label htmlFor="history-start-date-input">Start Date</label>
            <div className="history-date-picker">
              <input
                id="history-start-date-input"
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
                title="เลือกวันเริ่มต้น"
              >
                <CalendarDays size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="history-filter-field">
            <label htmlFor="history-end-date-input">End Date</label>
            <div className="history-date-picker">
              <input
                id="history-end-date-input"
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
                title="เลือกวันสิ้นสุด"
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
              disabled={!metrics.length}
            >
              {metrics.length === 0 ? (
                <option value="">No value</option>
              ) : (
                <>
                  <option value="all">All Values</option>
                  {metrics.map((metric) => (
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
              disabled={loadingHistory || !metrics.length}
            >
              {CHART_RESOLUTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </UnifiedSelect>
          </label>

          <div className="history-filter-actions">
            <UnifiedSelect
              className="history-export-format-select"
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value)}
              aria-label="เลือกรูปแบบไฟล์สำหรับ Export"
              title="เลือกรูปแบบไฟล์สำหรับ Export"
              disabled={!filteredRows.length || loadingHistory}
            >
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </UnifiedSelect>

            <button
              type="button"
              className="history-export-btn"
              onClick={handleExport}
              disabled={!filteredRows.length || loadingHistory}
            >
              <Download size={16} aria-hidden="true" />
              Export
            </button>

            <button
              type="button"
              className="history-clear-btn"
              onClick={openClearDialog}
              disabled={
                !historyTableRows.length || loadingHistory || clearingHistory
              }
            >
              <Trash2 size={16} aria-hidden="true" />
              Clear Data
            </button>
          </div>
        </div>
      </section>

      {notice && (
        <section className="history-message success">{notice}</section>
      )}
      {error && <section className="history-message error">{error}</section>}

      <section className="app-card history-chart-card history-chart-card-full">
        <div className="history-section-title">
          <div>
            <h2>Trend Graph</h2>
            <p>
              {selectedMetricKey === 'all'
                ? 'All Values'
                : selectedMetric?.metricName || 'Value'}{' '}
              จาก{' '}
              {selectedDevice?.name || selectedDevice?.device_code || 'Device'}{' '}
              • {formatDateOnly(startDate)} - {formatDateOnly(endDate)} •{' '}
              {selectedResolutionLabel}
            </p>
          </div>

          <div className="history-trend-actions">
            <span
              className={`history-device-status ${selectedDevice?.status || 'offline'}`}
            >
              {selectedDevice?.status || 'offline'}
            </span>
          </div>
        </div>

        {alarmReferenceRules.length > 0 && (
          <div
            className="history-alarm-rule-summary"
            aria-label="Active alarm thresholds"
          >
            {alarmReferenceRules.map((rule) => (
              <span
                key={`alarm-summary-${rule.id || `${rule.metricKey}-${rule.severity}`}`}
                className={`history-alarm-rule-chip ${rule.severity}`}
              >
                <i aria-hidden="true" />
                {formatAlarmRuleSummary(
                  rule,
                  metricMap,
                  selectedMetricKey === 'all'
                )}
              </span>
            ))}
          </div>
        )}

        {loadingChart ? (
          <div className="history-empty-box">กำลังโหลดข้อมูลกราฟ...</div>
        ) : chartData.length === 0 ? (
          <div className="history-empty-box">
            <span />
            <strong>ยังไม่มีข้อมูลสำหรับกราฟ</strong>
            <p>
              ตรวจสอบวันที่, Value และ Interval Record ในหน้า Settings
              จากนั้นรอให้ Device ส่งค่ารอบถัดไป
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
                    <stop
                      offset="100%"
                      stopColor="#06b6d4"
                      stopOpacity={0.02}
                    />
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
                {alarmReferenceRules.map((rule) => {
                  const color = getAlarmRuleColor(rule.severity)

                  return (
                    <ReferenceLine
                      key={`alarm-line-${rule.id || `${rule.metricKey}-${rule.severity}`}`}
                      y={rule.threshold}
                      stroke={color}
                      strokeWidth={1.8}
                      strokeDasharray={
                        rule.severity === 'critical' ? '4 3' : '7 4'
                      }
                      ifOverflow="extendDomain"
                      label={{
                        value: formatAlarmRuleSummary(
                          rule,
                          metricMap,
                          selectedMetricKey === 'all'
                        ),
                        position: 'insideTopRight',
                        fill: color,
                        fontSize: 10,
                        fontWeight: 800,
                      }}
                    />
                  )
                })}
                {chartSeries.map((series, index) => (
                  <Area
                    key={series.dataKey}
                    type="monotone"
                    dataKey={series.dataKey}
                    name={series.name}
                    stroke={series.color}
                    fill={
                      index === 0 ? 'url(#historyMetricFill)' : 'transparent'
                    }
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
            <p>
              ข้อมูลทุก {selectedResolutionLabel} พร้อมสถานะ Warning / Critical
              ตาม Alarm Rule
            </p>
          </div>

          <div className="history-table-actions">
            <label>
              <span>Show</span>
              <UnifiedSelect
                value={tablePageSize}
                onChange={(event) =>
                  setTablePageSize(getSafeTablePageSize(event.target.value))
                }
                aria-label="จำนวนแถวต่อหน้า"
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
                aria-label="เรียงลำดับข้อมูล History"
              >
                <option value="desc">ล่าสุด</option>
                <option value="asc">เก่าสุด</option>
              </UnifiedSelect>
            </label>
          </div>
        </div>

        <div className="history-table-wrap">
          <table
            className={`history-table ${
              selectedMetricKey === 'all' ? 'history-table-all-metrics' : ''
            }`}
            style={{
              minWidth: `${Math.max(
                760,
                (selectedMetricKey === 'all' ? metrics.length + 2 : 4) * 180
              )}px`,
            }}
          >
            <colgroup>
              {Array.from({
                length: selectedMetricKey === 'all' ? metrics.length + 2 : 4,
              }).map((_, index) => (
                <col
                  key={`history-table-column-${index}`}
                  style={{
                    width: `${
                      100 /
                      (selectedMetricKey === 'all' ? metrics.length + 2 : 4)
                    }%`,
                  }}
                />
              ))}
            </colgroup>

            <thead>
              {selectedMetricKey === 'all' ? (
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  {metrics.map((metric) => (
                    <th key={metric.metricKey}>{metric.metricName}</th>
                  ))}
                </tr>
              ) : (
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>{selectedMetric?.metricName || 'Name'}</th>
                  <th>Alarm Status</th>
                </tr>
              )}
            </thead>

            <tbody>
              {historyTableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      selectedMetricKey === 'all' ? metrics.length + 2 : 4
                    }
                  >
                    ยังไม่มีข้อมูลย้อนหลังสำหรับตัวกรองนี้
                  </td>
                </tr>
              ) : selectedMetricKey === 'all' ? (
                paginatedHistoryTableRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatHistoryDate(row.time)}</td>
                    <td>{formatHistoryTime(row.time)}</td>
                    {metrics.map((metric) => {
                      const value = row.values?.[metric.metricKey]

                      if (value == null) {
                        return <td key={metric.metricKey}>--</td>
                      }

                      const evaluation = getAlarmEvaluation(
                        value,
                        metric.metricKey,
                        activeAlarmRules
                      )

                      return (
                        <td
                          key={metric.metricKey}
                          className={`history-alarm-value-cell ${evaluation.severity}`}
                        >
                          <HistoryMetricAlarmValue
                            value={value}
                            unit={metric.unit || ''}
                            decimalPlaces={metric.decimalPlaces}
                            evaluation={evaluation}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))
              ) : (
                paginatedHistoryTableRows.map((row) => {
                  const evaluation = getAlarmEvaluation(
                    row.value,
                    row.metricKey || selectedMetricKey,
                    activeAlarmRules
                  )

                  return (
                    <tr
                      key={row.id}
                      className={`history-alarm-row ${evaluation.severity}`}
                    >
                      <td>{formatHistoryDate(row.time)}</td>
                      <td>{formatHistoryTime(row.time)}</td>
                      <td>
                        {formatHistoryTableValue(row, metricMap, selectedUnit)}
                      </td>
                      <td className="history-alarm-status-cell">
                        <HistoryAlarmBadge evaluation={evaluation} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={Math.min(tablePage, totalHistoryTablePages)}
          pageSize={tablePageSize}
          total={historyTableRows.length}
          onPageChange={setTablePage}
        />
      </section>

      <ClearFilteredDataDialog
        open={clearDialogOpen}
        idPrefix="history-clear"
        title="ยืนยันการ Clear Data"
        description="ข้อมูลที่ตรงกับตัวกรองด้านล่างจะถูกลบออกจากฐานข้อมูลจริง และไม่สามารถกู้คืนจากหน้า Dashboard ได้"
        summaryItems={[
          {
            label: 'Device',
            value:
              selectedDevice?.name ||
              selectedDevice?.device_code ||
              `Device ${selectedDeviceId}`,
          },
          { label: 'Start Date', value: formatDateOnly(startDate) },
          { label: 'End Date', value: formatDateOnly(endDate) },
          {
            label: 'Value',
            value:
              selectedMetricKey === 'all'
                ? 'All Values'
                : selectedMetric?.metricName || selectedMetricKey,
          },
          {
            label: 'Records',
            value: `${filteredRows.length.toLocaleString('th-TH')} rows`,
          },
        ]}
        confirmationKeyword="Delete"
        confirmationHelp="ตรวจสอบ Device, ช่วงวันที่ และ Value ให้ถูกต้องก่อนยืนยัน"
        confirmLabel="Delete Data"
        busyLabel="กำลังลบข้อมูล..."
        busy={clearingHistory}
        onClose={closeClearDialog}
        onConfirm={handleClearHistory}
      />
    </div>
  )
}

export default History
