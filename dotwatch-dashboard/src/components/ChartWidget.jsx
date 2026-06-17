import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { getDevices, getHistory } from '../services/api'
import { auth } from '../services/firebase'
import { connectRealtime, disconnectRealtime } from '../services/realtime'

const RANGE_OPTIONS = [
  { label: '24 ชั่วโมง', value: '24h', hours: 24 },
  { label: '7 วัน', value: '7d', hours: 24 * 7 },
  { label: '30 วัน', value: '30d', hours: 24 * 30 },
  { label: '1 ปี', value: '1y', hours: 24 * 365 },
]

function getDateRange(hours) {
  const to = new Date()
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000)

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  }
}

function normalizeHistory(rows) {
  return rows
    .map((item) => {
      const rawTime = item.bucket_time || item.time || item.latest_time
      const timestamp = new Date(rawTime).getTime()

      return {
        timestamp,
        datetime: new Date(timestamp).toLocaleString('th-TH'),
        temperature:
          item.avg_temperature != null
            ? Number(Number(item.avg_temperature).toFixed(1))
            : null,
        humidity:
          item.avg_humidity != null
            ? Number(Number(item.avg_humidity).toFixed(1))
            : null,
      }
    })
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
}

function formatXAxis(value) {
  return new Date(value).toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getAverage(data, key) {
  const values = data
    .map((item) => Number(item[key]))
    .filter((value) => Number.isFinite(value))

  if (values.length === 0) return '--'

  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(
    1
  )
}

function makeRealtimePoint(reading) {
  const rawTime = reading.latest_time || reading.time || Date.now()
  const timestamp = new Date(rawTime).getTime()

  return {
    timestamp,
    datetime: new Date(timestamp).toLocaleString('th-TH'),
    temperature:
      reading.temperature != null
        ? Number(Number(reading.temperature).toFixed(1))
        : null,
    humidity:
      reading.humidity != null
        ? Number(Number(reading.humidity).toFixed(1))
        : null,
  }
}

function ChartWidget() {
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [range, setRange] = useState('24h')
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(false)

  const selectedDeviceName = useMemo(() => {
    const device = devices.find((item) => String(item.id) === selectedDeviceId)
    return device?.name || selectedDeviceId || 'device'
  }, [devices, selectedDeviceId])

  const latestData = chartData[chartData.length - 1]

  async function loadDevices() {
    try {
      const data = await getDevices()
      const list = Array.isArray(data) ? data : []

      setDevices(list)

      if (!selectedDeviceId && list.length > 0) {
        setSelectedDeviceId(String(list[0].id))
      }
    } catch (error) {
      console.error('Load chart devices error:', error)
      setDevices([])
    }
  }

  async function loadHistory(deviceId, selectedRangeValue) {
    if (!deviceId) return

    try {
      setLoading(true)

      const option =
        RANGE_OPTIONS.find((item) => item.value === selectedRangeValue) ||
        RANGE_OPTIONS[0]

      const { from, to } = getDateRange(option.hours)

      const data = await getHistory(deviceId, from, to)
      const points = normalizeHistory(Array.isArray(data) ? data : [])

      setChartData(points)
    } catch (error) {
      console.error('Load history error:', error)
      setChartData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [])

  useEffect(() => {
    loadHistory(selectedDeviceId, range)
  }, [selectedDeviceId, range])

  useEffect(() => {
    const user = auth.currentUser

    if (!user || !selectedDeviceId) return

    connectRealtime(user.uid, (reading) => {
      if (String(reading.id) !== String(selectedDeviceId)) return

      const point = makeRealtimePoint(reading)

      setChartData((prev) => {
        const duplicated = prev.some(
          (item) => item.timestamp === point.timestamp
        )

        if (duplicated) return prev

        return [...prev, point]
          .filter((item) => Number.isFinite(item.timestamp))
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-1000)
      })
    })

    return () => {
      disconnectRealtime()
    }
  }, [selectedDeviceId])

  function exportCSV() {
    if (chartData.length === 0) return

    const headers = ['datetime', 'temperature', 'humidity']

    const rows = chartData.map((row) => [
      row.datetime,
      row.temperature ?? '',
      row.humidity ?? '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `${selectedDeviceName}-${range}-history.csv`
    link.click()

    URL.revokeObjectURL(url)
  }

  return (
    <section className="realtime-graph-section">
      <div className="realtime-graph-card">
        <div className="realtime-graph-header">
          <div className="realtime-graph-title">
            <h2>Real Time Graph</h2>
            <p>History จาก TimescaleDB + Realtime WebSocket</p>
          </div>

          <div className="realtime-graph-stats">
            <div className="realtime-stat">
              <p>Temperature</p>
              <strong>
                {latestData?.temperature != null
                  ? `${latestData.temperature.toFixed(1)}°C`
                  : '--'}
              </strong>
              <span>Avg {getAverage(chartData, 'temperature')}°C</span>
            </div>

            <div className="realtime-stat">
              <p>Humidity</p>
              <strong>
                {latestData?.humidity != null
                  ? `${latestData.humidity.toFixed(1)}%`
                  : '--'}
              </strong>
              <span>Avg {getAverage(chartData, 'humidity')}%</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="realtime-chart-box empty-chart">
            กำลังโหลดข้อมูล History...
          </div>
        ) : chartData.length === 0 ? (
          <div className="realtime-chart-box empty-chart">
            ยังไม่มีข้อมูล History จาก Device...
          </div>
        ) : (
          <div className="realtime-chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 12, right: 24, left: 0, bottom: 8 }}
              >
                <CartesianGrid
                  stroke="#e2e8f0"
                  strokeDasharray="6 6"
                  opacity={0.9}
                />

                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatXAxis}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={26}
                  stroke="#64748b"
                  fontSize={12}
                />

                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                  stroke="#64748b"
                  fontSize={12}
                />

                <Tooltip
                  formatter={(value, name) => [
                    value != null ? Number(value).toFixed(1) : '--',
                    name,
                  ]}
                  labelFormatter={(value) =>
                    new Date(value).toLocaleString('th-TH')
                  }
                />

                <Area
                  type="monotone"
                  dataKey="temperature"
                  name="Temperature °C"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.12}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  connectNulls
                />

                <Area
                  type="monotone"
                  dataKey="humidity"
                  name="Humidity %"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.1}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="realtime-graph-actions">
          <select
            className="device-select clean-select"
            value={selectedDeviceId}
            onChange={(event) => {
              setSelectedDeviceId(event.target.value)
              setChartData([])
            }}
          >
            {devices.length === 0 ? (
              <option value="">ยังไม่มี Device</option>
            ) : (
              devices.map((device) => (
                <option key={device.id} value={String(device.id)}>
                  {device.name || device.device_code}
                </option>
              ))
            )}
          </select>

          <select
            className="range-select clean-select"
            value={range}
            onChange={(event) => {
              setRange(event.target.value)
              setChartData([])
            }}
          >
            {RANGE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <button
            className="csv-export-btn"
            type="button"
            onClick={exportCSV}
            disabled={chartData.length === 0}
          >
            Export CSV
          </button>
        </div>
      </div>
    </section>
  )
}

export default ChartWidget