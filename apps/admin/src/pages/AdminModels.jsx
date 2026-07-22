import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  Cpu,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import EmptyState from '../components/common/EmptyState'
import LoadingState from '../components/common/LoadingState'
import PageHeader from '../components/common/PageHeader'
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
  description: '',
  isActive: true,
  metrics: [],
}

const DEFAULT_ESP32_FORM = {
  id: null,
  modelKey: 'esp32_dht3',
  modelName: 'dot-TH-W1',
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
      defaultUnit: '%RH',
      defaultIcon: 'Droplets',
      sortOrder: 1,
    },
  ],
}

const LOCKED_MODEL_DEFINITIONS = Object.freeze({
  esp32_dht3: Object.freeze({
    modelKey: 'esp32_dht3',
    modelName: 'dot-TH-W1',
    metrics: Object.freeze([
      Object.freeze({
        metricKey: 'metric_1',
        defaultName: 'Temperature',
        defaultType: 'temperature',
        defaultUnit: '°C',
        defaultIcon: 'Thermometer',
        sortOrder: 0,
      }),
      Object.freeze({
        metricKey: 'metric_2',
        defaultName: 'Humidity',
        defaultType: 'humidity',
        defaultUnit: '%RH',
        defaultIcon: 'Droplets',
        sortOrder: 1,
      }),
    ]),
  }),
  weather_api_demo: Object.freeze({
    modelKey: 'weather_api_demo',
    modelName: 'dot-WT-W1',
    metrics: Object.freeze([
      Object.freeze({
        metricKey: 'temperature',
        defaultName: 'Temperature',
        defaultType: 'temperature',
        defaultUnit: '°C',
        defaultIcon: 'Thermometer',
        sortOrder: 0,
      }),
      Object.freeze({
        metricKey: 'humidity',
        defaultName: 'Humidity',
        defaultType: 'humidity',
        defaultUnit: '%RH',
        defaultIcon: 'Droplets',
        sortOrder: 1,
      }),
    ]),
  }),
})

function getLockedModelDefinition(modelKey = '') {
  return LOCKED_MODEL_DEFINITIONS[String(modelKey || '').trim().toLowerCase()] || null
}

function applyLockedModelDefinition(value = {}) {
  const definition = getLockedModelDefinition(value.modelKey || value.model_key)
  if (!definition) return value

  return {
    ...value,
    modelKey: definition.modelKey,
    modelName: definition.modelName,
    metricCount: definition.metrics.length,
    metrics: definition.metrics.map((metric) => {
      return {
        ...metric,
        defaultIcon: metric.defaultIcon,
      }
    }),
  }
}

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const TYPE_SUGGESTIONS = [
  'temperature',
  'humidity',
  'pressure',
  'voltage',
  'current',
  'power',
  'energy',
  'signal',
  'custom',
]
const ICON_SUGGESTIONS = [
  'Activity',
  'Thermometer',
  'Droplets',
  'Gauge',
  'Zap',
  'Battery',
  'Wifi',
  'Wind',
  'Sun',
]

function cloneForm(value) {
  return {
    ...value,
    metrics: (value.metrics || []).map((metric) => ({ ...metric })),
  }
}

function reindexMetrics(metrics = []) {
  return metrics.map((metric, index) => ({
    ...metric,
    metricKey: `metric_${index + 1}`,
    sortOrder: index,
  }))
}

function buildMetrics(metricCount, existingMetrics = []) {
  const count = Math.max(0, Number(metricCount || 0))

  return Array.from({ length: count }, (_, index) => {
    const key = `metric_${index + 1}`
    const existing =
      existingMetrics.find((metric) => metric.metricKey === key) ||
      existingMetrics[index] ||
      {}

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
  const metricCount = Number(model.metricCount || model.metric_count || 0)
  const metrics = Array.isArray(model.metrics)
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
          metric.defaultIcon || metric.default_icon || metric.icon || 'Activity',
        sortOrder: metric.sortOrder ?? metric.sort_order ?? index,
      }))
    : []

  return applyLockedModelDefinition({
    id: model.id,
    modelKey: model.modelKey || model.model_key,
    modelName: model.modelName || model.model_name || model.name,
    metricCount,
    description: model.description || '',
    isActive: model.isActive ?? model.is_active ?? true,
    deviceCount: Number(model.deviceCount || model.device_count || 0),
    metrics: buildMetrics(metricCount, metrics),
  })
}

function modelToForm(model) {
  if (!model) return cloneForm(EMPTY_FORM)

  return applyLockedModelDefinition({
    id: model.id ?? null,
    modelKey: model.modelKey || '',
    modelName: model.modelName || '',
    description: model.description || '',
    isActive: model.isActive ?? true,
    metrics: buildMetrics(model.metricCount ?? model.metrics?.length, model.metrics),
  })
}

function formFingerprint(form) {
  return JSON.stringify({
    id: form.id,
    modelKey: form.modelKey.trim(),
    modelName: form.modelName.trim(),
    description: form.description.trim(),
    isActive: Boolean(form.isActive),
    metrics: reindexMetrics(form.metrics).map((metric) => ({
      metricKey: metric.metricKey,
      defaultName: metric.defaultName.trim(),
      defaultType: metric.defaultType.trim(),
      defaultUnit: metric.defaultUnit.trim(),
      defaultIcon: metric.defaultIcon.trim(),
      sortOrder: metric.sortOrder,
    })),
  })
}

function makeModelKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

function getDuplicateKey(modelKey, models) {
  const base = `${makeModelKey(modelKey) || 'device_model'}_copy`
  const usedKeys = new Set(models.map((model) => model.modelKey))

  if (!usedKeys.has(base)) return base

  let index = 2
  while (usedKeys.has(`${base}_${index}`)) index += 1
  return `${base}_${index}`
}

function AdminModels({ adminUser }) {
  const [models, setModels] = useState([])
  const [selectedModelId, setSelectedModelId] = useState(null)
  const [form, setForm] = useState(cloneForm(EMPTY_FORM))
  const [initialForm, setInitialForm] = useState(cloneForm(EMPTY_FORM))
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const canWrite = adminUser?.role === 'super_admin'
  const isDirty = useMemo(
    () => formFingerprint(form) !== formFingerprint(initialForm),
    [form, initialForm]
  )

  const showModelNotice = useCallback(
    (message, type = 'info', title = '') => {
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
    },
    []
  )

  const applyEditorForm = useCallback((nextModel) => {
    const nextForm = modelToForm(nextModel)
    setSelectedModelId(nextForm.id)
    setForm(cloneForm(nextForm))
    setInitialForm(cloneForm(nextForm))
  }, [])

  const loadModels = useCallback(
    async ({ showLoading = true, preferredId = null } = {}) => {
      try {
        if (showLoading) setLoading(true)
        const data = await getAdminDeviceModels()
        const normalizedModels = Array.isArray(data)
          ? data.map(normalizeModel)
          : []

        setModels(normalizedModels)

        const preferredModel = normalizedModels.find(
          (model) => String(model.id) === String(preferredId)
        )
        const firstModel =
          preferredModel ||
          normalizedModels.find((model) => model.isActive) ||
          normalizedModels[0]

        applyEditorForm(firstModel || EMPTY_FORM)
        return normalizedModels
      } catch (error) {
        console.error(error)
        showModelNotice(error.message || 'Failed to load device models', 'error')
        return []
      } finally {
        if (showLoading) setLoading(false)
      }
    },
    [applyEditorForm, showModelNotice]
  )

  useEffect(() => {
    let active = true

    getAdminDeviceModels()
      .then((data) => {
        if (!active) return
        const normalizedModels = Array.isArray(data)
          ? data.map(normalizeModel)
          : []
        const firstModel =
          normalizedModels.find((model) => model.isActive) ||
          normalizedModels[0]

        setModels(normalizedModels)
        applyEditorForm(firstModel || EMPTY_FORM)
      })
      .catch((error) => {
        if (!active) return
        console.error(error)
        showModelNotice(error.message || 'Failed to load device models', 'error')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [applyEditorForm, showModelNotice])

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
  const selectedModel = models.find(
    (model) => String(model.id) === String(selectedModelId)
  )
  const lockedDefinition = getLockedModelDefinition(form.modelKey)

  function guardUnsavedChanges() {
    if (!isDirty) return false
    showModelNotice(
      'Save or discard the current changes before opening another model.',
      'info',
      'Unsaved changes'
    )
    return true
  }

  function scrollEditorIntoView() {
    if (!window.matchMedia('(max-width: 980px)').matches) return
    requestAnimationFrame(() => {
      document
        .getElementById('admin-model-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function selectModel(model) {
    if (String(model.id) === String(selectedModelId)) {
      scrollEditorIntoView()
      return
    }
    if (guardUnsavedChanges()) return

    applyEditorForm(model)
    scrollEditorIntoView()
  }

  function startCreate(template = EMPTY_FORM) {
    if (guardUnsavedChanges()) return

    const nextForm = modelToForm({ ...template, id: null })
    setSelectedModelId(null)
    setForm(cloneForm(nextForm))
    setInitialForm(cloneForm(EMPTY_FORM))
    scrollEditorIntoView()
  }

  function duplicateModel(model = selectedModel) {
    if (!model || guardUnsavedChanges()) return

    const nextForm = modelToForm({
      ...model,
      id: null,
      modelKey: getDuplicateKey(model.modelKey, models),
      modelName: `${model.modelName} Copy`,
      isActive: false,
      metrics: model.metrics.map((metric) => ({ ...metric })),
    })
    setSelectedModelId(null)
    setForm(cloneForm(nextForm))
    setInitialForm(cloneForm(EMPTY_FORM))
    scrollEditorIntoView()
  }

  function discardChanges() {
    if (form.id) {
      setForm(cloneForm(initialForm))
      return
    }

    const fallback =
      models.find((model) => model.isActive) || models[0] || EMPTY_FORM
    applyEditorForm(fallback)
  }

  function updateField(name, value) {
    if (lockedDefinition && ['modelKey', 'modelName'].includes(name)) return

    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function updateMetric(index, name, value) {
    if (
      lockedDefinition &&
      ['defaultName', 'defaultType', 'defaultUnit', 'defaultIcon'].includes(name)
    ) {
      return
    }

    setForm((current) => ({
      ...current,
      metrics: current.metrics.map((metric, metricIndex) =>
        metricIndex === index ? { ...metric, [name]: value } : metric
      ),
    }))
  }

  function addMetric() {
    if (lockedDefinition) return

    setForm((current) => {
      if (current.metrics.length >= 100) {
        showModelNotice('A model can contain up to 100 values.', 'error')
        return current
      }

      const nextIndex = current.metrics.length + 1
      return {
        ...current,
        metrics: [
          ...current.metrics,
          {
            metricKey: `metric_${nextIndex}`,
            defaultName: `Value ${nextIndex}`,
            defaultType: 'custom',
            defaultUnit: '',
            defaultIcon: 'Activity',
            sortOrder: nextIndex - 1,
          },
        ],
      }
    })
  }

  function removeMetric(index) {
    if (lockedDefinition) return

    setForm((current) => ({
      ...current,
      metrics: reindexMetrics(
        current.metrics.filter((_, metricIndex) => metricIndex !== index)
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
    const invalidMetric = form.metrics.find(
      (metric) => !metric.defaultName.trim() || !metric.defaultType.trim()
    )

    if (!modelKey || !modelName) {
      showModelNotice('Model Key and Model Name are required', 'error')
      return
    }

    if (!/^[a-z0-9_-]{2,60}$/.test(modelKey)) {
      showModelNotice(
        'Model Key must use 2-60 lowercase letters, numbers, dash or underscore.',
        'error'
      )
      return
    }

    if (invalidMetric) {
      showModelNotice(
        'Every default value requires a Display Name and Type.',
        'error'
      )
      return
    }

    try {
      setSaving(true)
      const effectiveForm = applyLockedModelDefinition(form)
      const metrics = reindexMetrics(effectiveForm.metrics).map((metric) => ({
        ...metric,
        defaultName: metric.defaultName.trim(),
        defaultType: metric.defaultType.trim(),
        defaultUnit: metric.defaultUnit.trim(),
        defaultIcon: metric.defaultIcon.trim() || 'Activity',
      }))
      const payload = {
        modelKey: effectiveForm.modelKey.trim(),
        modelName: effectiveForm.modelName.trim(),
        metricCount: metrics.length,
        description: form.description.trim(),
        isActive: Boolean(form.isActive),
        metrics,
      }

      let savedModel
      if (form.id) {
        savedModel = await updateAdminDeviceModel(form.id, payload)
        showModelNotice('Model updated', 'success')
      } else {
        savedModel = await createAdminDeviceModel(payload)
        showModelNotice('Model created', 'success')
      }

      await loadModels({
        showLoading: false,
        preferredId: savedModel?.id || form.id,
      })
    } catch (error) {
      console.error(error)
      showModelNotice(error.message || 'Failed to save model', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(model = selectedModel) {
    if (!model) return
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
      await loadModels({ showLoading: false, preferredId: model.id })
    } catch (error) {
      console.error(error)
      showModelNotice(error.message || 'Failed to deactivate model', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRestore(model = selectedModel) {
    if (!model) return
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
      await loadModels({ showLoading: false, preferredId: model.id })
    } catch (error) {
      console.error(error)
      showModelNotice(error.message || 'Failed to restore model', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-page admin-models-page">
      <PageHeader
        eyebrow="Device Catalog"
        title="Device Models"
        description="จัดการรุ่นอุปกรณ์และค่าเริ่มต้นที่ใช้ในหน้า Create Device"
        meta={
          <>
            <span className="page-chip">{summary.total} Models</span>
            <span className="page-chip">{summary.active} Active</span>
          </>
        }
        actions={
          <button
            type="button"
            className="primary-button"
            onClick={() => startCreate(EMPTY_FORM)}
            disabled={saving || !canWrite}
          >
            <Plus size={17} aria-hidden="true" />
            Create Model
          </button>
        }
      />

      {notice ? (
        <div className="admin-notice admin-model-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">
            <X size={16} aria-hidden="true" />
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

      <div className="admin-model-workspace">
        <article className="admin-panel admin-model-catalog-panel">
          <div className="admin-model-catalog-top">
            <div>
              <p className="eyebrow">Model catalog</p>
              <h3>Registered Models</h3>
              <span>
                {filteredModels.length} of {models.length} records
              </span>
            </div>

            <UnifiedSelect
              value={String(pageSize)}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(1)
              }}
              aria-label="Models per page"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={String(size)}>
                  {size} rows
                </option>
              ))}
            </UnifiedSelect>
          </div>

          <div className="admin-model-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Search name, key or description"
              aria-label="Search device models"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setPage(1)
                }}
                aria-label="Clear search"
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="admin-model-filter-tabs" role="group" aria-label="Filter model status">
            {[
              ['all', 'All'],
              ['active', 'Active'],
              ['inactive', 'Inactive'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={statusFilter === value ? 'active' : ''}
                onClick={() => {
                  setStatusFilter(value)
                  setPage(1)
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="admin-model-catalog-body">
            {loading ? (
              <LoadingState title="Loading device models..." rows={5} />
            ) : filteredModels.length === 0 ? (
              <EmptyState
                title="No device models found"
                description="Clear the search or select another status filter."
              />
            ) : (
              <div className="admin-model-list" role="list">
                {pagedModels.map((model) => {
                  const selected =
                    String(model.id) === String(selectedModelId)

                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="listitem"
                      className={`admin-model-list-item${selected ? ' selected' : ''}`}
                      onClick={() => selectModel(model)}
                    >
                      <span className="admin-model-list-icon">
                        <Cpu size={19} aria-hidden="true" />
                      </span>

                      <span className="admin-model-list-content">
                        <span className="admin-model-list-title">
                          <strong>{model.modelName}</strong>
                          <StatusBadge
                            status={model.isActive ? 'active' : 'offline'}
                            label={model.isActive ? 'Active' : 'Inactive'}
                          />
                        </span>
                        <code>{model.modelKey}</code>
                        <small>{model.description || 'No description'}</small>
                        <span className="admin-model-list-meta">
                          <span>{model.metricCount} Values</span>
                          <span>{model.deviceCount} Devices</span>
                        </span>
                      </span>

                      {selected ? (
                        <CheckCircle2
                          className="admin-model-selected-mark"
                          size={18}
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {filteredModels.length > 0 ? (
            <div className="admin-models-pagination">
              <span>
                {pageStart + 1}-
                {Math.min(pageStart + pageSize, filteredModels.length)} of{' '}
                {filteredModels.length}
              </span>
              <div>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={currentPage >= totalPages}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </article>

        <article
          id="admin-model-editor"
          className="admin-panel admin-model-editor-panel"
        >
          <div className="admin-model-editor-header">
            <div>
              <div className="admin-model-editor-heading-line">
                <p className="eyebrow">{form.id ? 'Edit model' : 'New model'}</p>
                {isDirty ? <span className="admin-model-unsaved">Unsaved</span> : null}
              </div>
              <h3>{form.id ? form.modelName || 'Device Model' : 'Create Device Model'}</h3>
              <span>
                {form.id
                  ? `${form.metrics.length} default values · ${selectedModel?.deviceCount || 0} assigned devices`
                  : 'Complete the information and add the values used by this model.'}
              </span>
            </div>

            <div className="admin-model-editor-actions">
              {form.id ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => duplicateModel()}
                  disabled={saving || !canWrite}
                >
                  <Copy size={16} aria-hidden="true" />
                  Duplicate
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => startCreate(DEFAULT_ESP32_FORM)}
                  disabled={saving || !canWrite || isDirty}
                >
                  ESP32 Template
                </button>
              )}

              {form.id && selectedModel ? (
                selectedModel.isActive ? (
                  <button
                    type="button"
                    className="admin-model-danger-button"
                    onClick={() => handleDelete()}
                    disabled={saving || !canWrite}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-model-restore-button"
                    onClick={() => handleRestore()}
                    disabled={saving || !canWrite}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    Restore
                  </button>
                )
              ) : null}
            </div>
          </div>

          {!canWrite ? (
            <div className="admin-model-readonly-note">
              This account has read-only access. Super admin permission is required
              to create, edit, restore or deactivate models.
            </div>
          ) : null}

          <form className="admin-model-form" onSubmit={handleSubmit}>
            <section className="admin-model-form-section">
              <div className="admin-model-section-heading">
                <div>
                  <h4>Model Information</h4>
                  <span>Identification and availability in Create Device.</span>
                </div>
              </div>

              <div className="admin-model-general-grid">
                <label>
                  <span>Model Name</span>
                  <input
                    value={form.modelName}
                    onChange={(event) =>
                      updateField('modelName', event.target.value)
                    }
                    placeholder="dot-TH-W1"
                    disabled={saving || !canWrite || Boolean(lockedDefinition)}
                    maxLength={80}
                    required
                  />
                  <small>Name displayed in Admin and Dashboard.</small>
                </label>

                <label>
                  <span>Model Key</span>
                  <span className="admin-model-key-input">
                    <input
                      value={form.modelKey}
                      onChange={(event) =>
                        updateField('modelKey', makeModelKey(event.target.value))
                      }
                      placeholder="esp32_dht3"
                      disabled={saving || !canWrite || Boolean(lockedDefinition)}
                      maxLength={60}
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateField('modelKey', makeModelKey(form.modelName))
                      }
                      disabled={saving || !canWrite || Boolean(lockedDefinition) || !form.modelName.trim()}
                    >
                      Generate
                    </button>
                  </span>
                  <small>Firmware/API key. Avoid changing it after deployment.</small>
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
                    maxLength={500}
                    disabled={saving || !canWrite}
                  />
                  <small>{form.description.length}/500 characters</small>
                </label>

                <label className="admin-model-active-field">
                  <span>Availability</span>
                  <span className="admin-model-toggle-control">
                    <input
                      type="checkbox"
                      checked={Boolean(form.isActive)}
                      onChange={(event) =>
                        updateField('isActive', event.target.checked)
                      }
                      disabled={saving || !canWrite}
                    />
                    <span aria-hidden="true" />
                    <strong>
                      {form.isActive
                        ? 'Available in Create Device'
                        : 'Hidden from Create Device'}
                    </strong>
                  </span>
                </label>
              </div>
            </section>

            <section className="admin-model-form-section admin-model-values-section">
              <div className="admin-model-section-heading">
                <div>
                  <h4>Default Values</h4>
                  <span>
                    {lockedDefinition
                      ? `${lockedDefinition.modelName} is fixed to Temperature (°C, Thermometer) and Humidity (%RH, Droplets).`
                      : 'These values are copied to every new device created from this model.'}
                  </span>
                </div>
                {lockedDefinition ? (
                  <span className="page-chip">Fixed 2 Values</span>
                ) : (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={addMetric}
                    disabled={saving || !canWrite || form.metrics.length >= 100}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Add Value
                  </button>
                )}
              </div>

              {form.metrics.length === 0 ? (
                <div className="admin-model-empty-values">
                  <EmptyState
                    title="No default values"
                    description="Add the first value, such as Temperature or Humidity."
                  />
                  <button
                    type="button"
                    className="primary-button"
                    onClick={addMetric}
                    disabled={saving || !canWrite}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Add First Value
                  </button>
                </div>
              ) : (
                <div className="admin-model-value-list">
                  {form.metrics.map((metric, index) => (
                    <article
                      className="admin-model-value-row"
                      key={`${metric.metricKey}-${index}`}
                    >
                      <div className="admin-model-value-row-header">
                        <div className="admin-model-value-index">
                          <strong>{index + 1}</strong>
                          <div>
                            <span>Default Value {index + 1}</span>
                            <code>{metric.metricKey}</code>
                          </div>
                        </div>

                        {!lockedDefinition ? (
                          <button
                            type="button"
                            className="admin-model-remove-value"
                            onClick={() => removeMetric(index)}
                            disabled={saving || !canWrite}
                            aria-label={`Remove ${metric.defaultName || `Value ${index + 1}`}`}
                            title="Remove value"
                          >
                            <Trash2 size={16} aria-hidden="true" />
                            <span>Remove</span>
                          </button>
                        ) : null}
                      </div>

                      <div className="admin-model-value-fields">
                        <label>
                          <span>Display Name</span>
                          <input
                            value={metric.defaultName}
                            onChange={(event) =>
                              updateMetric(index, 'defaultName', event.target.value)
                            }
                            placeholder="Temperature"
                            maxLength={80}
                            disabled={saving || !canWrite || Boolean(lockedDefinition)}
                            required
                          />
                        </label>

                        <label>
                          <span>Type</span>
                          <input
                            list="admin-model-type-suggestions"
                            value={metric.defaultType}
                            onChange={(event) =>
                              updateMetric(index, 'defaultType', event.target.value)
                            }
                            placeholder="custom"
                            maxLength={40}
                            disabled={saving || !canWrite || Boolean(lockedDefinition)}
                            required
                          />
                        </label>

                        <label>
                          <span>Unit</span>
                          <input
                            value={metric.defaultUnit}
                            onChange={(event) =>
                              updateMetric(index, 'defaultUnit', event.target.value)
                            }
                            placeholder="°C"
                            maxLength={24}
                            disabled={saving || !canWrite || Boolean(lockedDefinition)}
                          />
                        </label>

                        <label>
                          <span>Icon</span>
                          <input
                            list="admin-model-icon-suggestions"
                            value={metric.defaultIcon}
                            onChange={(event) =>
                              updateMetric(index, 'defaultIcon', event.target.value)
                            }
                            placeholder="Activity"
                            maxLength={40}
                            disabled={saving || !canWrite || Boolean(lockedDefinition)}
                          />
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <datalist id="admin-model-type-suggestions">
                {TYPE_SUGGESTIONS.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
              <datalist id="admin-model-icon-suggestions">
                {ICON_SUGGESTIONS.map((icon) => (
                  <option key={icon} value={icon} />
                ))}
              </datalist>
            </section>

            <div className="admin-model-form-footer">
              <div>
                <strong>
                  {form.metrics.length} Value{form.metrics.length === 1 ? '' : 's'}
                </strong>
                <span>
                  {isDirty
                    ? 'Changes have not been saved.'
                    : form.id
                      ? 'This model is up to date.'
                      : 'Add information to create a model.'}
                </span>
              </div>

              <div className="admin-model-footer-actions">
                {isDirty ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={discardChanges}
                    disabled={saving}
                  >
                    Discard
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving || !canWrite || !isDirty}
                >
                  {saving
                    ? 'Saving...'
                    : form.id
                      ? 'Save Changes'
                      : 'Create Model'}
                </button>
              </div>
            </div>
          </form>
        </article>
      </div>
    </section>
  )
}

export default AdminModels
