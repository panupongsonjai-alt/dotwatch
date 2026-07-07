import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download, LineChart } from 'lucide-react'

import { getDevices, getHistory, getDeviceMetrics } from '../services/api'

const MAX_POINTS = 160
const REFRESH_INTERVAL = 30000

function toArray(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.history)) return payload.history
  if (Array.isArray(payload?.readings)) return payload.readings
  return []
}

function getTime(item) {
  return (
    item.bucket_time ||
    item.bucketTime ||
    item.time ||
    item.bucket ||
    item.created_at ||
    item.createdAt ||
    item.latest_time ||
    item.latestTime
  )
}

function getNumber(...values) {
  for (const value of values) {
    const number = Number(value)

    if (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      Number.isFinite(number)
    ) {
      return number
    }
  }

  return null
}

function formatTime(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '--'

  return date.toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeHistory(payload) {
  const seen = new Set()

  return toArray(payload)
    .map((item) => {
      const time = getTime(item)

      const value = getNumber(
        item.avg_value,
        item.avgValue,
        item.value,
        item.max_value,
        item.maxValue,
        item.min_value,
        item.minValue
      )

      return {
        time,
        label: formatTime(time),
        value,
      }
    })
    .filter((item) => {
      if (!item.time) return false

      const timestamp = new Date(item.time).getTime()
      if (Number.isNaN(timestamp)) return false

      if (seen.has(item.time)) return false
      seen.add(item.time)

      return item.value !== null
    })
    .sort((a, b) => new Date(a.time) - new Date(b.time))
    .slice(-MAX_POINTS)
}

function getRange(hours) {
  const to = new Date()
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000)

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  }
}

function getStats(data) {
  const values = data
    .map((item) => item.value)
    .filter(
      (value) => value !== null && value !== undefined && Number.isFinite(value)
    )

  if (!values.length) {
    return {
      avg: null,
      min: null,
      max: null,
    }
  }

  return {
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

function formatMetricValue(value, unit = '') {
  if (value == null || Number.isNaN(Number(value))) return '--'

  const numberValue = Number(value)
  const displayValue = Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(2)

  return `${displayValue}${unit ? ` ${unit}` : ''}`
}

function getMetricIndex(metricKey = '') {
  return Number(String(metricKey || '').replace(/[^0-9]/g, '')) || 0
}

function getFallbackMetricName(metricKey = '') {
  const key = String(metricKey || '')

  if (key === 'temperature') return 'Temperature'
  if (key === 'humidity') return 'Humidity'
  if (key === 'rssi') return 'Signal'

  const index = getMetricIndex(key)

  return index > 0 ? `Metric ${index}` : key || 'Metric'
}

function getFallbackMetricUnit(metricKey = '') {
  const key = String(metricKey || '').toLowerCase()

  if (key === 'temperature') return '°C'
  if (key === 'humidity') return '%'
  if (key === 'rssi') return 'dBm'

  return ''
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

function hasLatestMetricData(device = {}) {
  return Object.values(getLatestMetrics(device)).some(
    (value) => value != null && Number.isFinite(Number(value))
  )
}

function normalizeMetricConfig(metric = {}) {
  const metricKey = metric.metric_key || metric.source_key || metric.key

  if (!metricKey) return null

  return {
    metric_key: metricKey,
    metric_name:
      metric.metric_name ||
      metric.name ||
      metric.label ||
      getFallbackMetricName(metricKey),
    unit: metric.unit || getFallbackMetricUnit(metricKey),
    visible: metric.visible !== false,
    sort_order: Number(metric.sort_order ?? 9999),
  }
}

function getDeviceConfigMetrics(device = {}) {
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
    .map(normalizeMetricConfig)
    .filter(Boolean)
    .filter((metric) => metric.visible !== false)
}

function getFallbackMetricsFromLatest(device = {}) {
  return Object.keys(getLatestMetrics(device))
    .sort((a, b) => getMetricIndex(a) - getMetricIndex(b))
    .map((metricKey, index) => ({
      metric_key: metricKey,
      metric_name: getFallbackMetricName(metricKey),
      unit: getFallbackMetricUnit(metricKey),
      visible: true,
      sort_order: index,
    }))
}

function mergeMetricOptions(...metricGroups) {
  const map = new Map()

  for (const group of metricGroups) {
    for (const metric of group || []) {
      const normalized = normalizeMetricConfig(metric)
      if (!normalized || normalized.visible === false) continue

      const existing = map.get(normalized.metric_key)
      map.set(normalized.metric_key, {
        ...normalized,
        ...(existing || {}),
        metric_name:
          existing?.metric_name && existing.metric_name !== normalized.metric_key
            ? existing.metric_name
            : normalized.metric_name,
        unit: existing?.unit || normalized.unit,
        sort_order: Math.min(
          Number(existing?.sort_order ?? 9999),
          Number(normalized.sort_order ?? 9999)
        ),
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return getMetricIndex(a.metric_key) - getMetricIndex(b.metric_key)
  })
}

function getBestMetricKey(metrics = [], device = {}) {
  const latestMetrics = getLatestMetrics(device)

  const withLatestValue = metrics.find(
    (metric) =>
      latestMetrics[metric.metric_key] != null &&
      Number.isFinite(Number(latestMetrics[metric.metric_key]))
  )

  return withLatestValue?.metric_key || metrics[0]?.metric_key || ''
}

function getLatestPoint(device = {}, metricKey = '') {
  const latestMetrics = getLatestMetrics(device)
  const value = getNumber(latestMetrics[metricKey])
  const time =
    device.latest_time ||
    device.latestTime ||
    device.last_ingest_at ||
    device.lastIngestAt ||
    device.last_seen_at ||
    device.lastSeenAt

  if (value == null || !time) return null

  return {
    time,
    label: formatTime(time),
    value,
  }
}

function CustomTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null

  return (
    <div className="dw-chart-tooltip">
      <strong>{label}</strong>

      {payload.map((item) => (
        <div key={item.dataKey} className="dw-tooltip-row">
          <span className="dw-tooltip-dot" style={{ background: item.color }} />
          <span>{item.name}</span>
          <b>{formatMetricValue(item.value, unit)}</b>
        </div>
      ))}
    </div>
  )
}

function ChartWidget({ defaultDeviceId }) {
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(
    defaultDeviceId ? String(defaultDeviceId) : ''
  )
  const [selectedMetricKey, setSelectedMetricKey] = useState('')
  const [deviceMetrics, setDeviceMetrics] = useState([])
  const [rangeHours, setRangeHours] = useState(24)
  const [chartData, setChartData] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState('')

  const lastSignatureRef = useRef('')

  const selectedDevice = useMemo(() => {
    return (
      devices.find((device) => String(device.id) === String(selectedDeviceId)) ||
      null
    )
  }, [devices, selectedDeviceId])

  const selectedMetric = useMemo(() => {
    return (
      deviceMetrics.find(
        (metric) => String(metric.metric_key) === String(selectedMetricKey)
      ) || null
    )
  }, [deviceMetrics, selectedMetricKey])

  const stats = useMemo(() => getStats(chartData), [chartData])

  async function loadDevices() {
    try {
      setDevicesLoading(true)
      setError('')

      const payload = await getDevices()
      const list = toArray(payload)

      setDevices(list)

      if (list.length > 0) {
        setSelectedDeviceId((current) => {
          const currentExists = list.some(
            (device) => String(device.id) === String(current)
          )

          if (current && currentExists) return current

          const preferredDevice =
            list.find((device) => String(device.id) === String(defaultDeviceId)) ||
            list.find(hasLatestMetricData) ||
            list[0]

          return preferredDevice ? String(preferredDevice.id) : ''
        })
      } else {
        setSelectedDeviceId('')
        setDeviceMetrics([])
        setSelectedMetricKey('')
        setChartData([])
      }
    } catch (err) {
      console.error('loadDevices error:', err)
      setError(err.message || 'โหลดรายการอุปกรณ์ไม่ได้')
    } finally {
      setDevicesLoading(false)
    }
  }

  async function loadMetricConfig(deviceId) {
    if (!deviceId) {
      setDeviceMetrics([])
      setSelectedMetricKey('')
      setHistoryLoading(false)
      return
    }

    const device =
      devices.find((item) => String(item.id) === String(deviceId)) || {}

    try {
      setError('')

      let apiMetrics = []

      try {
        const result = await getDeviceMetrics(deviceId)

        apiMetrics = Array.isArray(result?.metrics)
          ? result.metrics
          : Array.isArray(result)
            ? result
            : []
      } catch (metricError) {
        console.warn('getDeviceMetrics fallback:', metricError)
      }

      const metrics = mergeMetricOptions(
        getDeviceConfigMetrics(device),
        apiMetrics,
        getFallbackMetricsFromLatest(device)
      )

      setDeviceMetrics(metrics)

      setSelectedMetricKey((current) => {
        const stillExists = metrics.some(
          (metric) => String(metric.metric_key) === String(current)
        )

        if (stillExists) return current

        return getBestMetricKey(metrics, device)
      })

      if (!metrics.length) {
        setChartData([])
        setHistoryLoading(false)
      }
    } catch (err) {
      console.error('loadMetricConfig error:', err)
      setDeviceMetrics([])
      setSelectedMetricKey('')
      setChartData([])
      setError(err.message || 'โหลด Metric ของอุปกรณ์ไม่ได้')
      setHistoryLoading(false)
    }
  }

  async function requestHistory(deviceId, metricKey, hours) {
    const { from, to } = getRange(hours)
    const payload = await getHistory(deviceId, from, to, metricKey)
    return normalizeHistory(payload)
  }

  async function loadHistory(deviceId, metricKey, device) {
    if (!deviceId || !metricKey) {
      setChartData([])
      setHistoryLoading(false)
      return
    }

    try {
      setHistoryLoading(true)
      setError('')

      let nextData = await requestHistory(deviceId, metricKey, rangeHours)

      if (!nextData.length && rangeHours < 168) {
        nextData = await requestHistory(deviceId, metricKey, 168)
      }

      if (!nextData.length) {
        const latestPoint = getLatestPoint(device, metricKey)
        if (latestPoint) nextData = [latestPoint]
      }

      const latest = nextData[nextData.length - 1]
      const signature = latest
        ? `${deviceId}-${metricKey}-${latest.time}-${latest.value}-${nextData.length}`
        : `${deviceId}-${metricKey}-empty`

      if (signature !== lastSignatureRef.current) {
        lastSignatureRef.current = signature
        setChartData(nextData)
      }
    } catch (err) {
      console.error('loadHistory error:', err)
      setError(err.message || 'โหลดข้อมูลกราฟไม่ได้')
      setChartData([])
    } finally {
      setHistoryLoading(false)
    }
  }

  function handleExportCSV() {
    if (!chartData.length) return

    const metricName =
      selectedMetric?.metric_name || selectedMetricKey || 'value'
    const unit = selectedMetric?.unit || ''

    const csv = [
      `time,metric_key,metric_name,value,unit`,
      ...chartData.map((item) =>
        [
          item.time,
          selectedMetricKey,
          `"${String(metricName).replaceAll('"', '""')}"`,
          item.value ?? '',
          `"${String(unit).replaceAll('"', '""')}"`,
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `dotwatch-${selectedDeviceId}-${selectedMetricKey}.csv`
    link.click()

    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    loadDevices()
  }, [])

  useEffect(() => {
    if (!selectedDeviceId || !devices.length) return

    setChartData([])
    lastSignatureRef.current = ''
    loadMetricConfig(selectedDeviceId)
  }, [selectedDeviceId, devices])

  useEffect(() => {
    if (!selectedDeviceId || !selectedMetricKey || !selectedDevice) return

    setChartData([])
    lastSignatureRef.current = ''
    loadHistory(selectedDeviceId, selectedMetricKey, selectedDevice)

    const timer = setInterval(() => {
      loadHistory(selectedDeviceId, selectedMetricKey, selectedDevice)
    }, REFRESH_INTERVAL)

    return () => clearInterval(timer)
  }, [selectedDeviceId, selectedMetricKey, selectedDevice, rangeHours])

  const chartTitle = selectedMetric?.metric_name || 'History Analytics'
  const chartUnit = selectedMetric?.unit || ''
  const loading = devicesLoading || historyLoading

  return (
    <section className="dw-chart-card">
      <div className="dw-chart-header">
        <div>
          <p className="section-eyebrow">History Analytics</p>
          <h2>{chartTitle}</h2>
          <span>
            แสดงข้อมูลย้อนหลังของ Metric ที่เลือก ถ้าไม่มี history จะใช้ค่าล่าสุดเป็น fallback
          </span>
        </div>

        <div className="dw-chart-actions">
          <select
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
          >
            {devices.length === 0 ? (
              <option value="">No device</option>
            ) : (
              devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name ||
                    device.device_code ||
                    device.deviceCode ||
                    `Device ${device.id}`}
                </option>
              ))
            )}
          </select>

          <select
            value={selectedMetricKey}
            onChange={(event) => setSelectedMetricKey(event.target.value)}
            disabled={!deviceMetrics.length}
          >
            {deviceMetrics.length === 0 ? (
              <option value="">No metric</option>
            ) : (
              deviceMetrics.map((metric) => (
                <option key={metric.metric_key} value={metric.metric_key}>
                  {metric.metric_name}
                  {metric.unit ? ` (${metric.unit})` : ''}
                </option>
              ))
            )}
          </select>

          <select
            value={rangeHours}
            onChange={(event) => setRangeHours(Number(event.target.value))}
          >
            <option value={6}>6 ชั่วโมง</option>
            <option value={12}>12 ชั่วโมง</option>
            <option value={24}>24 ชั่วโมง</option>
            <option value={168}>7 วัน</option>
            <option value={720}>30 วัน</option>
          </select>

          <button
            type="button"
            className="dw-export-button"
            onClick={handleExportCSV}
            disabled={!chartData.length}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="dw-average-grid">
        <div className="dw-average-card">
          <div className="dw-average-icon">
            <LineChart size={26} />
          </div>

          <div>
            <span>ค่าเฉลี่ย</span>
            <strong>{formatMetricValue(stats.avg, chartUnit)}</strong>
            <p>
              ต่ำสุด {formatMetricValue(stats.min, chartUnit)} <b>|</b> สูงสุด{' '}
              {formatMetricValue(stats.max, chartUnit)}
            </p>
          </div>
        </div>

        <div className="dw-average-card">
          <div className="dw-average-icon">
            <LineChart size={26} />
          </div>

          <div>
            <span>จำนวนข้อมูล</span>
            <strong>{chartData.length}</strong>
            <p>{selectedMetric?.metric_name || selectedMetricKey || '--'}</p>
          </div>
        </div>
      </div>

      {error && <div className="chart-message error">{error}</div>}

      {!error && loading && (
        <div className="chart-message">กำลังโหลดข้อมูล...</div>
      )}

      {!error && !loading && !deviceMetrics.length && (
        <div className="chart-message">
          ยังไม่พบ Metric ของ Device นี้ หรือ Device ยังไม่เคยส่งค่าเข้าระบบ
        </div>
      )}

      {!error && !loading && deviceMetrics.length > 0 && chartData.length === 0 && (
        <div className="chart-message">ยังไม่มีข้อมูลกราฟสำหรับ Metric นี้</div>
      )}

      {!error && chartData.length > 0 && (
        <div className="dw-chart-wrapper">
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart
              data={chartData}
              margin={{
                top: 22,
                right: 18,
                left: -8,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient id="dwMetricFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
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
                minTickGap={30}
                tick={{
                  fontSize: 12,
                  fill: '#94a3b8',
                  fontWeight: 600,
                }}
              />

              <YAxis
                tickLine={false}
                axisLine={false}
                width={46}
                domain={['auto', 'auto']}
                tick={{
                  fontSize: 12,
                  fill: '#94a3b8',
                  fontWeight: 600,
                }}
              />

              <Tooltip
                content={<CustomTooltip unit={chartUnit} />}
                animationDuration={0}
                cursor={{
                  stroke: 'rgba(96, 165, 250, 0.7)',
                  strokeDasharray: '3 3',
                }}
              />

              <Legend verticalAlign="top" height={38} />

              <Area
                type="monotone"
                dataKey="value"
                name={chartTitle}
                stroke="#3b82f6"
                fill="url(#dwMetricFill)"
                strokeWidth={3}
                dot={chartData.length <= 1}
                activeDot={{
                  r: 5,
                }}
                connectNulls
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

export default ChartWidget
