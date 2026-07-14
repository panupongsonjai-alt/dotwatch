import { useEffect, useMemo, useState } from 'react'
import {
  createAdminDeviceModel,
  deleteAdminDeviceModel,
  getAdminDeviceModels,
  updateAdminDeviceModel,
} from '../services/adminApi'
import { confirmAdminDelete, showAdminToast } from '../utils/uiFeedback'

const EMPTY_FORM = {
  id: null,
  modelKey: '',
  modelName: '',
  metricCount: 3,
  description: '',
  isActive: true,
  metrics: [],
}

const DEFAULT_ESP32_FORM = {
  id: null,
  modelKey: 'esp32_dht3',
  modelName: 'ESP32-DHT3',
  metricCount: 2,
  description: 'ESP32 Wi-Fi model with DHT temperature and humidity',
  isActive: true,
  metrics: [
    {
      metricKey: 'metric_1',
      defaultName: 'Temperature',
      defaultType: 'temperature',
      defaultUnit: '°C',
      defaultIcon: 'Thermometer',
      sortOrder: 0,
    },
    {
      metricKey: 'metric_2',
      defaultName: 'Humidity',
      defaultType: 'humidity',
      defaultUnit: '%',
      defaultIcon: 'Droplets',
      sortOrder: 1,
    },
  ],
}

function buildMetrics(metricCount, existingMetrics = []) {
  const count = Math.max(0, Number(metricCount || 0))

  return Array.from({ length: count }, (_, index) => {
    const key = `metric_${index + 1}`
    const existing =
      existingMetrics.find((metric) => metric.metricKey === key) || {}

    return {
      metricKey: key,
      defaultName: existing.defaultName || `Value ${index + 1}`,
      defaultType: existing.defaultType || 'custom',
      defaultUnit: existing.defaultUnit || '',
      defaultIcon: existing.defaultIcon || 'Activity',
      sortOrder: index,
    }
  })
}

function normalizeModel(model) {
  return {
    id: model.id,
    modelKey: model.modelKey || model.model_key,
    modelName: model.modelName || model.model_name || model.name,
    metricCount: Number(model.metricCount || model.metric_count || 0),
    description: model.description || '',
    isActive: model.isActive ?? model.is_active ?? true,
    deviceCount: Number(model.deviceCount || model.device_count || 0),
    metrics: Array.isArray(model.metrics)
      ? model.metrics.map((metric, index) => ({
          metricKey:
            metric.metricKey || metric.metric_key || `metric_${index + 1}`,
          defaultName:
            metric.defaultName ||
            metric.default_name ||
            metric.metricName ||
            metric.metric_name ||
            `Value ${index + 1}`,
          defaultType:
            metric.defaultType ||
            metric.default_type ||
            metric.metricType ||
            'custom',
          defaultUnit:
            metric.defaultUnit || metric.default_unit || metric.unit || '',
          defaultIcon:
            metric.defaultIcon ||
            metric.default_icon ||
            metric.icon ||
            'Activity',
          sortOrder: metric.sortOrder ?? metric.sort_order ?? index,
        }))
      : [],
  }
}

function AdminModels({ adminUser }) {
  const [models, setModels] = useState([])
  const [form, setForm] = useState(DEFAULT_ESP32_FORM)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const canWrite = adminUser?.role === 'super_admin'

  function showModelNotice(message, type = 'info', title = '') {
    const normalizedMessage = String(message || '').trim()
    if (!normalizedMessage) return

    setNotice(normalizedMessage)
    showAdminToast({
      type,
      title:
        title ||
        (type === 'success'
          ? 'Success'
          : type === 'error'
            ? 'Unable to complete action'
            : 'Information'),
      message: normalizedMessage,
    })
  }

  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models

    return models.filter((model) =>
      [
        model.modelKey,
        model.modelName,
        model.description,
        model.isActive ? 'active' : 'inactive',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [models, query])

  async function loadModels({ showLoading = true } = {}) {
    try {
      if (showLoading) setLoading(true)
      const data = await getAdminDeviceModels()
      setModels(Array.isArray(data) ? data.map(normalizeModel) : [])
      return true
    } catch (error) {
      console.error(error)
      showModelNotice(error.message || 'Failed to load device models', 'error')
      return false
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    getAdminDeviceModels()
      .then((data) => {
        if (active)
          setModels(Array.isArray(data) ? data.map(normalizeModel) : [])
      })
      .catch((error) => {
        if (!active) return
        console.error(error)
        showModelNotice(
          error.message || 'Failed to load device models',
          'error'
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  function resetForm(nextForm = DEFAULT_ESP32_FORM) {
    setForm({
      ...nextForm,
      metrics: buildMetrics(nextForm.metricCount, nextForm.metrics),
    })
  }

  function editModel(model) {
    resetForm({
      ...model,
      metrics: buildMetrics(model.metricCount, model.metrics),
    })
  }

  function updateField(name, value) {
    setForm((current) => {
      if (name === 'metricCount') {
        const metricCount = Math.max(0, Number(value || 0))
        return {
          ...current,
          metricCount,
          metrics: buildMetrics(metricCount, current.metrics),
        }
      }

      return {
        ...current,
        [name]: value,
      }
    })
  }

  function updateMetric(index, name, value) {
    setForm((current) => ({
      ...current,
      metrics: current.metrics.map((metric, metricIndex) =>
        metricIndex === index
          ? {
              ...metric,
              [name]: value,
            }
          : metric
      ),
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!canWrite) {
      showModelNotice('Super admin access required to edit models', 'error')
      return
    }

    try {
      setSaving(true)
      const payload = {
        modelKey: form.modelKey.trim(),
        modelName: form.modelName.trim(),
        metricCount: Number(form.metricCount || 0),
        description: form.description.trim(),
        isActive: Boolean(form.isActive),
        metrics: buildMetrics(form.metricCount, form.metrics),
      }

      if (form.id) {
        await updateAdminDeviceModel(form.id, payload)
        showModelNotice('Model updated', 'success')
      } else {
        await createAdminDeviceModel(payload)
        showModelNotice('Model created', 'success')
      }

      await loadModels()
      resetForm(EMPTY_FORM)
    } catch (error) {
      console.error(error)
      showModelNotice(error.message || 'Failed to save model', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(model) {
    if (!canWrite) {
      showModelNotice('Super admin access required to delete models', 'error')
      return
    }

    const ok = await confirmAdminDelete({
      title: 'Confirm Delete Device Model',
      targetName: model.modelName,
      description:
        'Existing devices will remain, but this model will disappear from Create Device.',
    })

    if (!ok) return

    try {
      setSaving(true)
      await deleteAdminDeviceModel(model.id)
      showModelNotice('Model deactivated', 'success')
      showAdminToast({
        type: 'success',
        title: 'Success',
        message: 'Model deactivated',
      })
      await loadModels()
    } catch (error) {
      console.error(error)
      const message = error.message || 'Failed to deactivate model'
      showModelNotice(message, 'error')
      showAdminToast({
        type: 'error',
        title: 'Unable to delete model',
        message,
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleRestore(model) {
    if (!canWrite) {
      showModelNotice('Super admin access required to restore models', 'error')
      return
    }

    try {
      setSaving(true)
      await updateAdminDeviceModel(model.id, {
        modelKey: model.modelKey,
        modelName: model.modelName,
        metricCount: model.metricCount,
        description: model.description,
        isActive: true,
        metrics: buildMetrics(model.metricCount, model.metrics),
      })
      showModelNotice('Model restored', 'success')
      await loadModels()
    } catch (error) {
      console.error(error)
      showModelNotice(error.message || 'Failed to restore model', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Device catalog</p>
          <h1>Model List</h1>
          <span>
            เพิ่ม ลบ แก้ไข model ที่ใช้ในหน้า Create Device ของ Dashboard
          </span>
        </div>
        <span className="page-chip">
          {models.filter((model) => model.isActive).length} active
        </span>
      </div>

      {notice ? (
        <div className="admin-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="admin-two-column admin-models-layout">
        <article className="admin-panel">
          <div className="panel-header">
            <div>
              <h3>{form.id ? 'Edit Model' : 'Create Model'}</h3>
              <span>Value rows will become defaults for new devices.</span>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => resetForm(DEFAULT_ESP32_FORM)}
              disabled={saving}
            >
              ESP32 template
            </button>
          </div>

          <form className="admin-model-form" onSubmit={handleSubmit}>
            <label>
              Model Key
              <input
                value={form.modelKey}
                onChange={(event) =>
                  updateField('modelKey', event.target.value)
                }
                placeholder="esp32_dht3"
                disabled={saving || !canWrite}
              />
            </label>

            <label>
              Model Name
              <input
                value={form.modelName}
                onChange={(event) =>
                  updateField('modelName', event.target.value)
                }
                placeholder="ESP32-DHT3"
                disabled={saving || !canWrite}
              />
            </label>

            <label>
              Value Count
              <input
                type="number"
                min="0"
                max="100"
                value={form.metricCount}
                onChange={(event) =>
                  updateField('metricCount', event.target.value)
                }
                disabled={saving || !canWrite}
              />
            </label>

            <label className="admin-model-full">
              Description
              <input
                value={form.description}
                onChange={(event) =>
                  updateField('description', event.target.value)
                }
                placeholder="Short model description"
                disabled={saving || !canWrite}
              />
            </label>

            <label className="admin-model-check">
              <input
                type="checkbox"
                checked={Boolean(form.isActive)}
                onChange={(event) =>
                  updateField('isActive', event.target.checked)
                }
                disabled={saving || !canWrite}
              />
              Active in Dashboard Create Device
            </label>

            <div className="admin-model-metrics">
              <div className="panel-header">
                <h3>Default Values</h3>
                <span>{form.metrics.length} rows</span>
              </div>

              {form.metrics.map((metric, index) => (
                <div className="admin-model-metric-row" key={metric.metricKey}>
                  <strong>{metric.metricKey}</strong>
                  <input
                    value={metric.defaultName}
                    onChange={(event) =>
                      updateMetric(index, 'defaultName', event.target.value)
                    }
                    placeholder="Display name"
                    disabled={saving || !canWrite}
                  />
                  <input
                    value={metric.defaultType}
                    onChange={(event) =>
                      updateMetric(index, 'defaultType', event.target.value)
                    }
                    placeholder="type"
                    disabled={saving || !canWrite}
                  />
                  <input
                    value={metric.defaultUnit}
                    onChange={(event) =>
                      updateMetric(index, 'defaultUnit', event.target.value)
                    }
                    placeholder="unit"
                    disabled={saving || !canWrite}
                  />
                  <input
                    value={metric.defaultIcon}
                    onChange={(event) =>
                      updateMetric(index, 'defaultIcon', event.target.value)
                    }
                    placeholder="icon"
                    disabled={saving || !canWrite}
                  />
                </div>
              ))}
            </div>

            <div className="table-actions">
              <button
                type="submit"
                className="success"
                disabled={saving || !canWrite}
              >
                {form.id ? 'Save Changes' : 'Create Model'}
              </button>
              <button
                type="button"
                onClick={() => resetForm(EMPTY_FORM)}
                disabled={saving}
              >
                Clear
              </button>
            </div>
          </form>
        </article>

        <article className="admin-panel">
          <div className="panel-header">
            <div>
              <h3>Models</h3>
              <span>{filteredModels.length} records</span>
            </div>
          </div>

          <div className="admin-toolbar">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search model key, name, status..."
            />
          </div>

          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Values</th>
                  <th>Devices</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5">Loading models...</td>
                  </tr>
                ) : filteredModels.length ? (
                  filteredModels.map((model) => (
                    <tr key={model.id}>
                      <td>
                        <strong>{model.modelName}</strong>
                        <span>{model.modelKey}</span>
                      </td>
                      <td>{model.metricCount}</td>
                      <td>{model.deviceCount}</td>
                      <td>
                        <span
                          className={`status-badge ${model.isActive ? 'active' : 'suspended'}`}
                        >
                          {model.isActive ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            onClick={() => editModel(model)}
                            disabled={saving}
                          >
                            Edit
                          </button>
                          {model.isActive ? (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleDelete(model)}
                              disabled={saving || !canWrite}
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="success"
                              onClick={() => handleRestore(model)}
                              disabled={saving || !canWrite}
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5">No models found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  )
}

export default AdminModels
