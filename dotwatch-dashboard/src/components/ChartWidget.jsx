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

import { getDevices, getHistory } from '../services/api'

const MAX_POINTS = 144

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
    item.time ||
    item.bucket ||
    item.created_at ||
    item.createdAt ||
    item.latest_time ||
    item.latestTime
  )
}

function formatTime(value) {
  if (!value) return '--'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '--'

  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeHistory(payload) {
  return toArray(payload)
    .map((item) => {
      const time = getTime(item)

      return {
        time,
        label: formatTime(time),
        temperature:
          item.temperature != null
            ? Number(item.temperature)
            : null,
        humidity:
          item.humidity != null
            ? Number(item.humidity)
            : null,
      }
    })
    .filter(
      (item) =>
        item.time &&
        !Number.isNaN(new Date(item.time).getTime()) &&
        (item.temperature != null || item.humidity != null)
    )
    .sort((a, b) => new Date(a.time) - new Date(b.time))
    .slice(-MAX_POINTS)
}

function getDefaultRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  }
}

function ChartWidget() {
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [chartData, setChartData] = useState([])
  const [chartSize, setChartSize] = useState('medium')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const lastSignatureRef = useRef('')

  const chartHeight = useMemo(() => {
    if (chartSize === 'small') return 300
    if (chartSize === 'large') return 520
    return 420
  }, [chartSize])

  async function loadDevices() {
    try {
      const payload = await getDevices()
      const list = toArray(payload)

      setDevices(list)

      if (list.length > 0) {
        setSelectedDeviceId((current) => current || String(list[0].id))
      }
    } catch (err) {
      console.error('loadDevices error:', err)
      setError('โหลดรายการอุปกรณ์ไม่ได้')
      setLoading(false)
    }
  }

  async function loadHistory(deviceId) {
    if (!deviceId) return

    try {
      setError('')

      const { from, to } = getDefaultRange()
      const payload = await getHistory(deviceId, from, to)
      const nextData = normalizeHistory(payload)

      console.log('history payload:', payload)
      console.log('chart data:', nextData)

      const latest = nextData[nextData.length - 1]
      const signature = latest
        ? `${latest.time}-${latest.temperature}-${latest.humidity}-${nextData.length}`
        : 'empty'

      if (signature === lastSignatureRef.current) {
        return
      }

      lastSignatureRef.current = signature
      setChartData(nextData)
    } catch (err) {
      console.error('loadHistory error:', err)
      setError(err.message || 'โหลดข้อมูลกราฟไม่ได้')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [])

  useEffect(() => {
    if (!selectedDeviceId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setChartData([])
    lastSignatureRef.current = ''

    loadHistory(selectedDeviceId)

    const timer = setInterval(() => {
      loadHistory(selectedDeviceId)
    }, 5000)

    return () => clearInterval(timer)
  }, [selectedDeviceId])

  function handleExportCSV() {
    if (!chartData.length) return

    const csv = [
      'time,temperature,humidity',
      ...chartData.map((item) =>
        [
          item.time,
          item.temperature ?? '',
          item.humidity ?? '',
        ].join(',')
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
    <section className="chart-card">
      <div className="chart-header">
        <div>
          <p className="section-eyebrow">Realtime Sensor Activity</p>
          <h2>Temperature & Humidity</h2>
          <span>แสดงข้อมูลล่าสุดจากอุปกรณ์แบบเรียลไทม์</span>
        </div>

        <div className="chart-actions">
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
            value={chartSize}
            onChange={(event) => setChartSize(event.target.value)}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>

          <button
            type="button"
            className="export-button"
            onClick={handleExportCSV}
            disabled={!chartData.length}
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && <div className="chart-message error">{error}</div>}

      {!error && loading && (
        <div className="chart-message">กำลังโหลดข้อมูล...</div>
      )}

      {!error && !loading && chartData.length === 0 && (
        <div className="chart-message">
          ยังไม่มีข้อมูลกราฟสำหรับอุปกรณ์นี้
        </div>
      )}

      {!error && chartData.length > 0 && (
        <div className="chart-wrapper" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{
                top: 24,
                right: 18,
                left: -10,
                bottom: 8,
              }}
            >
              <defs>
                <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>

                <linearGradient id="humFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="label"
                minTickGap={28}
                tickLine={false}
                axisLine={false}
              />

              <YAxis
                tickLine={false}
                axisLine={false}
                width={42}
                domain={['auto', 'auto']}
              />

              <Tooltip animationDuration={0} />

              <Legend verticalAlign="top" height={36} />

              <Area
                type="monotone"
                dataKey="temperature"
                name="Temperature"
                stroke="#ef4444"
                fill="url(#tempFill)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />

              <Area
                type="monotone"
                dataKey="humidity"
                name="Humidity"
                stroke="#2563eb"
                fill="url(#humFill)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
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