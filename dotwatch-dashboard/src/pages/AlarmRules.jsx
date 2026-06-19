import { useEffect, useState } from 'react'
import { getAlarmRules, createAlarmRule, updateAlarmRule, deleteAlarmRule } from '../services/api'
import { getDevices } from '../services/api'

function AlarmRules() {
  const [rules, setRules] = useState([])
  const [devices, setDevices] = useState([])

  const [form, setForm] = useState({
    device_id: '',
    metric: 'temperature',
    operator: '>',
    threshold: 35,
    severity: 'critical',
  })

  async function loadData() {
    try {
      const [rulesData, devicesData] =
        await Promise.all([
          getAlarmRules(),
          getDevices(),
        ])

      setRules(Array.isArray(rulesData) ? rulesData : [])
      setDevices(Array.isArray(devicesData) ? devicesData : [])
    } catch (error) {
      console.error(error)
    }
  }

  async function handleCreate() {
    try {
      await createAlarmRule({
        ...form,
        device_id: Number(form.device_id),
        threshold: Number(form.threshold),
      })

      setForm({
        device_id: '',
        metric: 'temperature',
        operator: '>',
        threshold: 35,
        severity: 'critical',
      })

      await loadData()
    } catch (error) {
      alert(error.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('ลบ Rule นี้ ?')) return

    await deleteAlarmRule(id)

    await loadData()
  }

  async function handleToggle(rule) {
  try {
    await updateAlarmRule(rule.id, {
      ...rule,
      is_active: !rule.is_active,
    })

    await loadData()
  } catch (error) {
    alert(error.message)
  }
}

  useEffect(() => {
    loadData()
  }, [])

  function getDeviceName(id) {
  const device = devices.find(
    (d) => d.id === id
  )

  return device?.name || `Device #${id}`
}

  return (
    <div className="page">

      <section className="panel">

        <div className="section-title">
          <h2>Alarm Rules</h2>
          <p>จัดการเงื่อนไขแจ้งเตือนทั้งหมด</p>
        </div>

        <div className="alarm-summary-grid">
  <article className="summary-card">
    <span>Total Rules</span>
    <strong>{rules.length}</strong>
  </article>

  <article className="summary-card">
    <span>Active Rules</span>
    <strong>
      {rules.filter((r) => r.is_active).length}
    </strong>
  </article>

  <article className="summary-card">
    <span>Critical</span>
    <strong>
      {
        rules.filter(
          (r) =>
            r.severity === 'critical'
        ).length
      }
    </strong>
  </article>

  <article className="summary-card">
    <span>Warning</span>
    <strong>
      {
        rules.filter(
          (r) =>
            r.severity === 'warning'
        ).length
      }
    </strong>
  </article>
</div>

        <div className="rule-form">

          <select
            value={form.device_id}
            onChange={(e) =>
              setForm({
                ...form,
                device_id: e.target.value,
              })
            }
          >
            <option value="">
              เลือก Device
            </option>

            {devices.map((device) => (
              <option
                key={device.id}
                value={device.id}
              >
                {device.name}
              </option>
            ))}
          </select>

          <select
            value={form.metric}
            onChange={(e) =>
              setForm({
                ...form,
                metric: e.target.value,
              })
            }
          >
            <option value="temperature">
              Temperature
            </option>

            <option value="humidity">
              Humidity
            </option>

            <option value="rssi">
              RSSI
            </option>
          </select>

          <select
            value={form.operator}
            onChange={(e) =>
              setForm({
                ...form,
                operator: e.target.value,
              })
            }
          >
            <option value=">">{'>'}</option>
            <option value="<">{'<'}</option>
            <option value=">=">{'>='}</option>
            <option value="<=">{'<='}</option>
          </select>

          <input
            type="number"
            value={form.threshold}
            onChange={(e) =>
              setForm({
                ...form,
                threshold: e.target.value,
              })
            }
          />

          <select
            value={form.severity}
            onChange={(e) =>
              setForm({
                ...form,
                severity: e.target.value,
              })
            }
          >
            <option value="warning">
              Warning
            </option>

            <option value="critical">
              Critical
            </option>
          </select>

          <button
            className="primary-button"
            onClick={handleCreate}
          >
            Add Rule
          </button>

        </div>

        <div className="alarm-list">

          {rules.map((rule) => (
  <article
    key={rule.id}
    className={`alarm-card ${
      rule.severity
    }`}
  >
    <div className="alarm-card-main">

      <div className="alarm-title-row">

        <div>
          <h3>
            {getDeviceName(
              rule.device_id
            )}
          </h3>

          <p>
            {rule.metric}
            {' '}
            {rule.operator}
            {' '}
            {rule.threshold}
          </p>
        </div>

        <div className="alarm-badges">

          <span
            className={`alarm-severity ${
              rule.severity
            }`}
          >
            {rule.severity}
          </span>

          <span
            className={
              rule.is_active
                ? 'alarm-status active'
                : 'alarm-status acknowledged'
            }
          >
            {rule.is_active
              ? 'ACTIVE'
              : 'DISABLED'}
          </span>

        </div>

      </div>

    </div>

    <div className="rule-actions">

      <button
        className="ghost-button"
        onClick={() =>
          handleToggle(rule)
        }
      >
        {rule.is_active
          ? 'Disable'
          : 'Enable'}
      </button>

      <button
        className="delete-btn"
        onClick={() =>
          handleDelete(rule.id)
        }
      >
        Delete
      </button>

    </div>
  </article>
))}

        </div>

      </section>

    </div>
  )
}

export default AlarmRules