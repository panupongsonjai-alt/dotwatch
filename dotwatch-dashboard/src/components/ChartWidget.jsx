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
import { Download, Droplets, Thermometer } from 'lucide-react'

import { getDevices, getHistory, getDeviceMetrics } from '../services/api'

const MAX_POINTS = 72
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

  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeHistory(payload) {
  const seen = new Set()

  return toArray(payload)
    .map((item) => {
      const time = getTime(item)

      const temperature = getNumber(
        item.avg_temperature,
        item.avgTemperature,
        item.temperature
      )

      const humidity = getNumber(
        item.avg_humidity,
        item.avgHumidity,
        item.humidity
      )

      return {
        time,
        label: formatTime(time),
        temperature,
        humidity,
      }
    })
    .filter((item) => {
      if (!item.time) return false

      const timestamp = new Date(item.time).getTime()
      if (Number.isNaN(timestamp)) return false

      if (seen.has(item.time)) return false
      seen.add(item.time)

      return item.temperature !== null || item.humidity !== null
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

function getStats(data, key) {
  const values = data
    .map((item) => item[key])
    .filter(
      (value) => value !== null && value !== undefined && Number.isFinite(value)
    )

  if (!values.length) {
    return { avg: null, min: null, max: null }
  }

  return {
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div className="dw-chart-tooltip">
      <strong>{label}</strong>

      {payload.map((item) => (
        <div key={item.dataKey} className="dw-tooltip-row">
          <span className="dw-tooltip-dot" style={{ background: item.color }} />
          <span>{item.name}</span>
          <b>
            {Number(item.value).toFixed(1)}
            {item.dataKey === 'temperature' ? ' °C' : ' %'}
          </b>
        </div>
      ))}
    </div>
  )
}

function ChartWidget() {
  const [devices, setDevices] = useState([])
  const [selectedMetricKey, setSelectedMetricKey] = useState('')
  const [deviceMetrics, setDeviceMetrics] = useState([])
  const [rangeHours, setRangeHours] = useState(24)
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const lastSignatureRef = useRef('')

  const stats = useMemo(() => {
    return {
      temperature: getStats(chartData, 'temperature'),
      humidity: getStats(chartData, 'humidity'),
    }
  }, [chartData])

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

  async function loadHistory(deviceId) {
    if (!deviceId) return

    try {
      setError('')

      const { from, to } = getRange(rangeHours)
      const payload = await getHistory(deviceId, from, to, selectedMetricKey)
      const nextData = normalizeHistory(payload)

      const latest = nextData[nextData.length - 1]
      const signature = latest
        ? `${latest.time}-${latest.temperature}-${latest.humidity}-${nextData.length}`
        : 'empty'

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

  async function loadMetricConfig(deviceId) {
    try {
      const result = await getDeviceMetrics(deviceId)

      const metrics = Array.isArray(result?.metrics)
        ? result.metrics
        : Array.isArray(result)
          ? result
          : []

      setDeviceMetrics(metrics)

      if (metrics.length > 0) {
        setSelectedMetricKey(metrics[0].metric_key)
      }
    } catch (error) {
      console.error(error)
      setDeviceMetrics([])
    }
  }

  useEffect(() => {
    loadDevices()
  }, [])

  useEffect(() => {
    if (!selectedDeviceId) return

    setLoading(true)
    setChartData([])
    lastSignatureRef.current = ''
    loadMetricConfig(selectedDeviceId)
    loadHistory(selectedDeviceId)

    const timer = setInterval(() => {
      loadHistory(selectedDeviceId)
    }, REFRESH_INTERVAL)

    return () => clearInterval(timer)
  }, [selectedDeviceId, rangeHours])

  function handleExportCSV() {
    if (!chartData.length) return

    const csv = [
      'time,temperature,humidity',
      ...chartData.map((item) =>
        [item.time, item.temperature ?? '', item.humidity ?? ''].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `dotwatch-history-${selectedDeviceId}.csv`
    link.click()

    URL.revokeObjectURL(url)
  }

  return (
    <section className="dw-chart-card">
      <div className="dw-chart-header">
        <div>
          <p className="section-eyebrow">Realtime Sensor Activity</p>
          <h2>Temperature & Humidity</h2>
          <span>แสดงข้อมูลล่าสุดจากอุปกรณ์แบบเรียลไทม์</span>
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
            onChange={(e) => setSelectedMetricKey(e.target.value)}
          >
            {deviceMetrics.map((metric) => (
              <option key={metric.metric_key} value={metric.metric_key}>
                {metric.metric_name}
              </option>
            ))}
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
          <div className="dw-average-icon temp">
            <Thermometer size={26} />
          </div>

          <div>
            <span>อุณหภูมิเฉลี่ย</span>
            <strong>
              {stats.temperature.avg !== null
                ? `${stats.temperature.avg.toFixed(1)} °C`
                : '--'}
            </strong>
            <p>
              ต่ำสุด{' '}
              {stats.temperature.min !== null
                ? `${stats.temperature.min.toFixed(1)} °C`
                : '--'}{' '}
              <b>|</b> สูงสุด{' '}
              {stats.temperature.max !== null
                ? `${stats.temperature.max.toFixed(1)} °C`
                : '--'}
            </p>
          </div>
        </div>

        <div className="dw-average-card">
          <div className="dw-average-icon hum">
            <Droplets size={26} />
          </div>

          <div>
            <span>ความชื้นเฉลี่ย</span>
            <strong>
              {stats.humidity.avg !== null
                ? `${stats.humidity.avg.toFixed(1)} %`
                : '--'}
            </strong>
            <p>
              ต่ำสุด{' '}
              {stats.humidity.min !== null
                ? `${stats.humidity.min.toFixed(0)} %`
                : '--'}{' '}
              <b>|</b> สูงสุด{' '}
              {stats.humidity.max !== null
                ? `${stats.humidity.max.toFixed(0)} %`
                : '--'}
            </p>
          </div>
        </div>
      </div>

      {error && <div className="chart-message error">{error}</div>}

      {!error && loading && (
        <div className="chart-message">กำลังโหลดข้อมูล...</div>
      )}

      {!error && !loading && chartData.length === 0 && (
        <div className="chart-message">ยังไม่มีข้อมูลกราฟสำหรับอุปกรณ์นี้</div>
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
                <linearGradient id="dwTempFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                </linearGradient>

                <linearGradient id="dwHumFill" x1="0" y1="0" x2="0" y2="1">
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
                width={36}
                domain={['auto', 'auto']}
                tick={{
                  fontSize: 12,
                  fill: '#94a3b8',
                  fontWeight: 600,
                }}
              />

              <Tooltip
                content={<CustomTooltip />}
                animationDuration={0}
                cursor={{
                  stroke: 'rgba(96, 165, 250, 0.7)',
                  strokeDasharray: '3 3',
                }}
              />

              <Legend verticalAlign="top" height={38} />

              <Area
                type="monotone"
                dataKey="temperature"
                name="Temperature (°C)"
                stroke="#ef4444"
                fill="url(#dwTempFill)"
                strokeWidth={3}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />

              <Area
                type="monotone"
                dataKey="humidity"
                name="Humidity (%)"
                stroke="#3b82f6"
                fill="url(#dwHumFill)"
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
