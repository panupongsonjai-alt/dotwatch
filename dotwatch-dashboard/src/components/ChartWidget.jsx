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

const MAX_POINTS = 120
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
    : numberValue.toFixed(1)

  return `${displayValue}${unit ? ` ${unit}` : ''}`
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const lastSignatureRef = useRef('')

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
      setError('')

      const payload = await getDevices()
      const list = toArray(payload)

      setDevices(list)

      if (list.length > 0) {
        setSelectedDeviceId((current) => current || String(list[0].id))
      }
    } catch (err) {
      console.error('loadDevices error:', err)
      setError(err.message || 'โหลดรายการอุปกรณ์ไม่ได้')
    } finally {
      setLoading(false)
    }
  }

  async function loadMetricConfig(deviceId) {
    if (!deviceId) return

    try {
      const result = await getDeviceMetrics(deviceId)

      const metrics = Array.isArray(result?.metrics)
        ? result.metrics
        : Array.isArray(result)
          ? result
          : []

      const visibleMetrics = metrics
        .filter((metric) => metric.visible !== false)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))

      setDeviceMetrics(visibleMetrics)

      setSelectedMetricKey((current) => {
        const stillExists = visibleMetrics.some(
          (metric) => String(metric.metric_key) === String(current)
        )

        if (stillExists) return current

        return visibleMetrics[0]?.metric_key || ''
      })
    } catch (err) {
      console.error('loadMetricConfig error:', err)
      setDeviceMetrics([])
      setSelectedMetricKey('')
      setError(err.message || 'โหลด Metric ของอุปกรณ์ไม่ได้')
    }
  }

  async function loadHistory(deviceId, metricKey) {
    if (!deviceId || !metricKey) return

    try {
      setError('')

      const { from, to } = getRange(rangeHours)
      const payload = await getHistory(deviceId, from, to, metricKey)
      const nextData = normalizeHistory(payload)

      const latest = nextData[nextData.length - 1]
      const signature = latest
        ? `${metricKey}-${latest.time}-${latest.value}-${nextData.length}`
        : `${metricKey}-empty`

      if (signature === lastSignatureRef.current) return

      lastSignatureRef.current = signature
      setChartData(nextData)
    } catch (err) {
      console.error('loadHistory error:', err)
      setError(err.message || 'โหลดข้อมูลกราฟไม่ได้')
    } finally {
      setLoading(false)
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
    if (!selectedDeviceId) return

    setLoading(true)
    setChartData([])
    setDeviceMetrics([])
    setSelectedMetricKey('')
    lastSignatureRef.current = ''

    loadMetricConfig(selectedDeviceId)
  }, [selectedDeviceId])

  useEffect(() => {
    if (!selectedDeviceId || !selectedMetricKey) return

    setLoading(true)
    setChartData([])
    lastSignatureRef.current = ''

    loadHistory(selectedDeviceId, selectedMetricKey)

    const timer = setInterval(() => {
      loadHistory(selectedDeviceId, selectedMetricKey)
    }, REFRESH_INTERVAL)

    return () => clearInterval(timer)
  }, [selectedDeviceId, selectedMetricKey, rangeHours])

  const chartTitle = selectedMetric?.metric_name || 'Metric Activity'
  const chartUnit = selectedMetric?.unit || ''

  return (
    <section className="dw-chart-card">
      <div className="dw-chart-header">
        <div>
          <p className="section-eyebrow">Realtime Metric Activity</p>
          <h2>{chartTitle}</h2>
          <span>แสดงข้อมูลย้อนหลังของ Metric ที่เลือกจากอุปกรณ์</span>
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
            <p>{selectedMetricKey || '--'}</p>
          </div>
        </div>
      </div>

      {error && <div className="chart-message error">{error}</div>}

      {!error && loading && (
        <div className="chart-message">กำลังโหลดข้อมูล...</div>
      )}

      {!error && !loading && chartData.length === 0 && (
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
                dot={false}
                activeDot={false}
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
