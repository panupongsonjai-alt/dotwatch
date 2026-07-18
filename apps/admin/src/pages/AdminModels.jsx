import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import LoadingState from '../components/common/LoadingState'
import StatCard from '../components/common/StatCard'
import StatusBadge from '../components/common/StatusBadge'
import UnifiedSelect from '../components/common/UnifiedSelect'
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
  metricCount: 0,
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

const PAGE_SIZE_OPTIONS = [10, 20, 50]

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
  const [statusFilter, setStatusFilter] = useState('all')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
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

  const summary = useMemo(
    () => ({
      total: models.length,
      active: models.filter((model) => model.isActive).length,
      devices: models.reduce(
        (total, model) => total + Number(model.deviceCount || 0),
        0
      ),
      values: models.reduce(
        (total, model) => total + Number(model.metricCount || 0),
        0
      ),
    }),
    [models]
  )

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return models.filter((model) => {
      const matchesQuery = normalizedQuery
        ? [model.modelKey, model.modelName, model.description]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        : true

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
            ? model.isActive
            : !model.isActive

      return matchesQuery && matchesStatus
    })
  }, [models, query, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredModels.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * pageSize
  const pagedModels = filteredModels.slice(pageStart, pageStart + pageSize)

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
        if (active) {
          setModels(Array.isArray(data) ? data.map(normalizeModel) : [])
        }
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

  function openEditor(nextForm) {
    resetForm(nextForm)
    requestAnimationFrame(() => {
      document
        .getElementById('admin-model-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function editModel(model) {
    openEditor({
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

    const modelKey = form.modelKey.trim()
    const modelName = form.modelName.trim()

    if (!modelKey || !modelName) {
      showModelNotice('Model Key and Model Name are required', 'error')
      return
    }

    try {
      setSaving(true)
      const payload = {
        modelKey,
        modelName,
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

      await loadModels({ showLoading: false })
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
      await loadModels({ showLoading: false })
    } catch (error) {
      console.error(error)
      showModelNotice(error.message || 'Failed to deactivate model', 'error')
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
      await loadModels({ showLoading: false })
    } catch (error) {
      console.error(error)
      showModelNotice(error.message || 'Failed to restore model', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-page admin-models-page">
      <div className="page-header admin-models-page-header">
        <div>
          <p className="eyebrow">Device catalog</p>
          <h1>Device Models</h1>
          <span>
            จัดการรุ่นอุปกรณ์และค่าเริ่มต้นที่ใช้ในหน้า Create Device
          </span>
        </div>

        <div className="admin-models-header-actions">
          <button
            type="button"
            onClick={() => loadModels()}
            disabled={loading || saving}
          >
            Refresh
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => openEditor(EMPTY_FORM)}
            disabled={saving || !canWrite}
          >
            Create Model
          </button>
        </div>
      </div>

      {notice ? (
        <div className="admin-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="admin-stat-grid admin-models-stat-grid">
        <StatCard
          label="Total Models"
          value={summary.total}
          helper="All registered device models"
        />
        <StatCard
          label="Active Models"
          value={summary.active}
          helper="Available in Create Device"
          tone="success"
        />
        <StatCard
          label="Assigned Devices"
          value={summary.devices}
          helper="Devices using these models"
          tone="info"
        />
        <StatCard
          label="Default Values"
          value={summary.values}
          helper="Configured values across models"
          tone="warning"
        />
      </div>

      <article className="admin-panel admin-model-catalog-panel">
        <div className="panel-header admin-model-catalog-header">
          <div>
            <h3>Model Catalog</h3>
            <span>
              {filteredModels.length} of {models.length} records
            </span>
          </div>
        </div>

        <div className="admin-toolbar admin-models-toolbar">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Search model name, key or description..."
          />

          <UnifiedSelect
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value)
              setPage(1)
            }}
            aria-label="Filter model status"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </UnifiedSelect>

          <UnifiedSelect
            value={String(pageSize)}
            onChange={(event) => {
              setPageSize(Number(event.target.value))
              setPage(1)
            }}
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={String(size)}>
                {size} rows
              </option>
            ))}
          </UnifiedSelect>
        </div>

        {loading ? (
          <LoadingState title="Loading device models..." rows={4} />
        ) : filteredModels.length === 0 ? (
          <EmptyState
            title="No device models found"
            description="Try changing the search text or status filter."
          />
        ) : (
          <>
            <div className="table-wrap admin-models-table-wrap">
              <table className="admin-table admin-models-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Model Key</th>
                    <th>Values</th>
                    <th>Devices</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedModels.map((model) => (
                    <tr key={model.id}>
                      <td>
                        <strong>{model.modelName}</strong>
                        <span>{model.description || 'No description'}</span>
                      </td>
                      <td>
                        <code className="admin-model-key">
                          {model.modelKey}
                        </code>
                      </td>
                      <td>
                        <strong>{model.metricCount}</strong>
                        <span>default values</span>
                      </td>
                      <td>
                        <strong>{model.deviceCount}</strong>
                        <span>assigned devices</span>
                      </td>
                      <td>
                        <StatusBadge
                          status={model.isActive ? 'active' : 'offline'}
                          label={model.isActive ? 'Active' : 'Inactive'}
                        />
                      </td>
                      <td>
                        <div className="table-actions admin-model-row-actions">
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
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-models-pagination">
              <span>
                Showing {pageStart + 1}-
                {Math.min(pageStart + pageSize, filteredModels.length)} of{' '}
                {filteredModels.length}
              </span>
              <div>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={currentPage >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </article>

      <article
        id="admin-model-editor"
        className="admin-panel admin-model-editor-panel"
      >
        <div className="panel-header admin-model-editor-header">
          <div>
            <p className="eyebrow">Model editor</p>
            <h3>{form.id ? `Edit ${form.modelName}` : 'Create Device Model'}</h3>
            <span>
              Default values will be copied to newly created devices.
            </span>
          </div>

          <div className="admin-model-editor-actions">
            <button
              type="button"
              onClick={() => resetForm(DEFAULT_ESP32_FORM)}
              disabled={saving || !canWrite}
            >
              ESP32 Template
            </button>
            <button
              type="button"
              onClick={() => resetForm(EMPTY_FORM)}
              disabled={saving}
            >
              Clear
            </button>
          </div>
        </div>

        {!canWrite ? (
          <div className="admin-model-readonly-note">
            This account has read-only access. Super admin permission is required
            to create, edit, restore or delete models.
          </div>
        ) : null}

        <form className="admin-model-form" onSubmit={handleSubmit}>
          <div className="admin-model-general-grid">
            <label>
              <span>Model Key</span>
              <input
                value={form.modelKey}
                onChange={(event) =>
                  updateField('modelKey', event.target.value)
                }
                placeholder="esp32_dht3"
                disabled={saving || !canWrite}
                required
              />
              <small>Unique key used by firmware and API.</small>
            </label>

            <label>
              <span>Model Name</span>
              <input
                value={form.modelName}
                onChange={(event) =>
                  updateField('modelName', event.target.value)
                }
                placeholder="ESP32-DHT3"
                disabled={saving || !canWrite}
                required
              />
              <small>Name displayed in Admin and Dashboard.</small>
            </label>

            <label>
              <span>Value Count</span>
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
              <small>Creates the default value rows below.</small>
            </label>

            <label className="admin-model-active-field">
              <span>Availability</span>
              <span className="admin-model-check-control">
                <input
                  type="checkbox"
                  checked={Boolean(form.isActive)}
                  onChange={(event) =>
                    updateField('isActive', event.target.checked)
                  }
                  disabled={saving || !canWrite}
                />
                <span>Active in Dashboard Create Device</span>
              </span>
              <small>Inactive models remain visible to Admin only.</small>
            </label>

            <label className="admin-model-description-field">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  updateField('description', event.target.value)
                }
                placeholder="Describe hardware, sensors and intended usage"
                rows="3"
                disabled={saving || !canWrite}
              />
            </label>
          </div>

          <section className="admin-model-metrics-editor">
            <div className="admin-model-metrics-heading">
              <div>
                <h3>Default Values</h3>
                <span>{form.metrics.length} configured rows</span>
              </div>
              <span className="page-chip">{form.metricCount} Values</span>
            </div>

            {form.metrics.length === 0 ? (
              <EmptyState
                title="No default values"
                description="Increase Value Count to configure model values."
              />
            ) : (
              <div className="admin-model-metric-list">
                <div className="admin-model-metric-head" aria-hidden="true">
                  <span>Key</span>
                  <span>Display Name</span>
                  <span>Type</span>
                  <span>Unit</span>
                  <span>Icon</span>
                </div>

                {form.metrics.map((metric, index) => (
                  <div
                    className="admin-model-metric-row"
                    key={metric.metricKey}
                  >
                    <code>{metric.metricKey}</code>
                    <label>
                      <span>Display Name</span>
                      <input
                        value={metric.defaultName}
                        onChange={(event) =>
                          updateMetric(index, 'defaultName', event.target.value)
                        }
                        placeholder="Display name"
                        disabled={saving || !canWrite}
                      />
                    </label>
                    <label>
                      <span>Type</span>
                      <input
                        value={metric.defaultType}
                        onChange={(event) =>
                          updateMetric(index, 'defaultType', event.target.value)
                        }
                        placeholder="custom"
                        disabled={saving || !canWrite}
                      />
                    </label>
                    <label>
                      <span>Unit</span>
                      <input
                        value={metric.defaultUnit}
                        onChange={(event) =>
                          updateMetric(index, 'defaultUnit', event.target.value)
                        }
                        placeholder="Unit"
                        disabled={saving || !canWrite}
                      />
                    </label>
                    <label>
                      <span>Icon</span>
                      <input
                        value={metric.defaultIcon}
                        onChange={(event) =>
                          updateMetric(index, 'defaultIcon', event.target.value)
                        }
                        placeholder="Activity"
                        disabled={saving || !canWrite}
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="admin-model-form-footer">
            <span>
              {form.id
                ? 'Saving updates changes the defaults for future devices.'
                : 'Create the model when all default values are ready.'}
            </span>
            <button
              type="submit"
              className="success"
              disabled={saving || !canWrite}
            >
              {saving
                ? 'Saving...'
                : form.id
                  ? 'Save Changes'
                  : 'Create Model'}
            </button>
          </div>
        </form>
      </article>
    </section>
  )
}

export default AdminModels
