import { useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, Database, Globe2, RefreshCw, Server, Wifi, XCircle } from 'lucide-react'
import { PageHeader, SectionHeader, StatCard, StatusBadge } from '../components/common'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function formatTime(value) {
  if (!value) return '--'

  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

function getUiPreference(name, fallback = '--') {
  return localStorage.getItem(name) || fallback
}

function getTheme() {
  return localStorage.getItem('theme') || document.documentElement.dataset.theme || 'dark'
}

function getConnectionLabel() {
  if (!navigator.onLine) return 'Offline'

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (!connection?.effectiveType) return 'Online'

  return `${connection.effectiveType.toUpperCase()} connection`
}

function SystemHealth() {
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [checkedAt, setCheckedAt] = useState(null)

  async function checkHealth() {
    try {
      setLoading(true)
      setError('')

      const startedAt = performance.now()
      const response = await fetch(`${API_URL}/health`)
      const latency = Math.round(performance.now() - startedAt)
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.message || `Health check failed: ${response.status}`)
      }

      setHealth({
        ok: Boolean(data?.ok),
        service: data?.service || 'dotwatch-backend',
        latency,
        status: response.status,
      })
      setCheckedAt(new Date().toISOString())
    } catch (healthError) {
      setHealth(null)
      setError(healthError.message || 'Cannot connect to backend')
      setCheckedAt(new Date().toISOString())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkHealth()
  }, [])

  const browserStatus = navigator.onLine ? 'online' : 'offline'
  const backendStatus = health?.ok ? 'online' : 'offline'

  const summaryCards = useMemo(
    () => [
      {
        label: 'Backend',
        value: health?.ok ? 'Online' : 'Offline',
        hint: health?.service || error || 'Waiting for health check',
        tone: health?.ok ? 'success' : 'danger',
      },
      {
        label: 'Latency',
        value: health?.latency != null ? `${health.latency}ms` : '--',
        hint: 'Round trip from browser to backend',
        tone: health?.latency > 1000 ? 'warning' : 'default',
      },
      {
        label: 'Browser',
        value: navigator.onLine ? 'Online' : 'Offline',
        hint: getConnectionLabel(),
        tone: navigator.onLine ? 'success' : 'danger',
      },
      {
        label: 'Theme',
        value: getTheme(),
        hint: `${getUiPreference('dotwatchDensity', 'comfortable')} density`,
        tone: 'default',
      },
    ],
    [health, error]
  )

  return (
    <div className="page app-page system-health-page">
      <PageHeader
        eyebrow="Diagnostics"
        title="System Health"
        description="ตรวจสอบสถานะ Backend, การเชื่อมต่อ และค่าการแสดงผลของ dotWatch ในเครื่องนี้"
        meta={
          <>
            <StatusBadge status={backendStatus} label={`Backend ${health?.ok ? 'Online' : 'Offline'}`} />
            <StatusBadge status={browserStatus} label={`Browser ${navigator.onLine ? 'Online' : 'Offline'}`} />
          </>
        }
        actions={
          <button type="button" className="primary-button" onClick={checkHealth} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? 'Checking...' : 'Refresh Health'}
          </button>
        }
      />

      <section className="system-health-stat-grid">
        {summaryCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            hint={card.hint}
            tone={card.tone}
            compact
          />
        ))}
      </section>

      <section className="system-health-grid">
        <section className="app-card system-health-card">
          <SectionHeader
            title="Backend Status"
            description="ข้อมูลจาก endpoint /health ของ dotWatch Backend"
            actions={<span className="system-health-chip">Last checked {formatTime(checkedAt)}</span>}
          />

          <div className={`system-health-status-card ${health?.ok ? 'healthy' : 'offline'}`}>
            <div className="system-health-status-icon">
              {health?.ok ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
            </div>

            <div>
              <h3>{health?.ok ? 'Backend is reachable' : 'Backend is not reachable'}</h3>
              <p>
                {health?.ok
                  ? `${health.service} responded with status ${health.status} in ${health.latency}ms.`
                  : error || 'No response from backend health endpoint.'}
              </p>
            </div>
          </div>

          <div className="system-health-info-grid">
            <div>
              <span>API URL</span>
              <strong>{API_URL}</strong>
            </div>
            <div>
              <span>Health Endpoint</span>
              <strong>/health</strong>
            </div>
            <div>
              <span>HTTP Status</span>
              <strong>{health?.status || '--'}</strong>
            </div>
            <div>
              <span>Response Time</span>
              <strong>{health?.latency != null ? `${health.latency} ms` : '--'}</strong>
            </div>
          </div>
        </section>

        <aside className="system-health-side">
          <section className="app-card system-health-card compact">
            <SectionHeader title="Client" description="สถานะฝั่ง Browser และ Network" />

            <div className="system-health-mini-list">
              <div>
                <Globe2 size={18} />
                <span>Network</span>
                <strong>{getConnectionLabel()}</strong>
              </div>
              <div>
                <Wifi size={18} />
                <span>Online State</span>
                <strong>{navigator.onLine ? 'Online' : 'Offline'}</strong>
              </div>
              <div>
                <Activity size={18} />
                <span>Timezone</span>
                <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone || '--'}</strong>
              </div>
            </div>
          </section>

          <section className="app-card system-health-card compact">
            <SectionHeader title="UI Preferences" description="ค่าการแสดงผลที่บันทึกไว้ใน Browser" />

            <div className="system-health-mini-list">
              <div>
                <Server size={18} />
                <span>Theme</span>
                <strong>{getTheme()}</strong>
              </div>
              <div>
                <Database size={18} />
                <span>Accent</span>
                <strong>{getUiPreference('dotwatchAccent', 'blue')}</strong>
              </div>
              <div>
                <Activity size={18} />
                <span>Density</span>
                <strong>{getUiPreference('dotwatchDensity', 'comfortable')}</strong>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </div>
  )
}

export default SystemHealth
