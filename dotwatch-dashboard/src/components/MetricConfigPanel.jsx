import {
  Activity,
  Battery,
  Cpu,
  Droplets,
  Gauge,
  Power,
  RotateCcw,
  Save,
  Thermometer,
  Trash2,
  Wifi,
  Wind,
  Zap,
} from 'lucide-react'
import { useDeviceMetrics } from '../hooks/useDeviceMetrics'
import { createBlankMetric } from '../utils/metricDisplayConfig'
import { METRIC_ICON_OPTIONS } from '../utils/metricIcons'

const ICON_COMPONENTS = {
  Activity,
  Thermometer,
  Droplets,
  Gauge,
  Zap,
  Battery,
  Wifi,
  Wind,
  Power,
  Cpu,
}

function updateMetricList(metrics = [], metricIndex, key, value) {
  return metrics.map((metric, index) => {
    if (index !== metricIndex) return metric

    return {
      ...metric,
      [key]: value,
    }
  })
}

function reindexMetrics(metrics = []) {
  return metrics.map((metric, index) => ({
    ...metric,
    metric_key: metric.metric_key || `metric_${index + 1}`,
    sort_order: index,
  }))
}

function MetricIconPicker({ value, disabled, onChange }) {
  const selectedIcon = value || 'Activity'
  const SelectedIconComponent = ICON_COMPONENTS[selectedIcon] || Activity

  function handleSelect(event, iconName) {
    event.preventDefault()

    if (disabled) return

    onChange(iconName)

    const dropdown = event.currentTarget.closest('details')
    if (dropdown) {
      dropdown.removeAttribute('open')
    }
  }

  return (
    <details className="metric-icon-dropdown">
      <summary
        className="metric-icon-dropdown-summary"
        aria-label="Select metric icon"
      >
        <span className="metric-icon-dropdown-current">
          <SelectedIconComponent size={17} />
          <span>{selectedIcon}</span>
        </span>
      </summary>

      <div className="metric-icon-dropdown-menu">
        {METRIC_ICON_OPTIONS.map((iconName) => {
          const IconComponent = ICON_COMPONENTS[iconName] || Activity
          const isActive = selectedIcon === iconName

          return (
            <button
              key={iconName}
              type="button"
              className={
                isActive
                  ? 'metric-icon-dropdown-option active'
                  : 'metric-icon-dropdown-option'
              }
              onClick={(event) => handleSelect(event, iconName)}
              disabled={disabled}
            >
              <IconComponent size={17} />
              <span>{iconName}</span>
            </button>
          )
        })}
      </div>
    </details>
  )
}

export default function MetricConfigPanel({ deviceId }) {
  const {
    draftMetrics = [],
    setDraftMetrics,
    loading,
    saving,
    message,
    saveDraftMetrics,
    resetMetrics,
  } = useDeviceMetrics(deviceId)

  function addMetric() {
    setDraftMetrics((currentMetrics = []) =>
      reindexMetrics([
        ...currentMetrics,
        createBlankMetric(currentMetrics.length),
      ])
    )
  }

  function removeMetric(indexToRemove) {
    setDraftMetrics((currentMetrics = []) =>
      reindexMetrics(
        currentMetrics.filter((_, index) => index !== indexToRemove)
      )
    )
  }

  function updateMetric(index, key, value) {
    setDraftMetrics((currentMetrics = []) =>
      updateMetricList(currentMetrics, index, key, value)
    )
  }

  async function handleReset() {
    await resetMetrics()

    window.dispatchEvent(
      new CustomEvent('dotwatchMetricConfigChanged', {
        detail: { deviceId },
      })
    )
  }

  async function handleSave() {
    const success = await saveDraftMetrics(reindexMetrics(draftMetrics))

    if (success !== false) {
      window.dispatchEvent(
        new CustomEvent('dotwatchMetricConfigChanged', {
          detail: { deviceId },
        })
      )
    }

    return success
  }

  const visibleMetricCount = draftMetrics.filter(
    (metric) => metric.visible !== false
  ).length

  return (
    <section className="metric-config-panel metric-config-panel-v2">
      <div className="metric-config-header">
        <div>
          <h4>Metric Display</h4>
          <p>Configure metrics shown on Dashboard and Device Details.</p>
        </div>

        <div className="metric-config-actions">
          <span className="device-model-badge">
            {visibleMetricCount}/{draftMetrics.length} Visible
          </span>

          <button
            type="button"
            className="ghost-button"
            onClick={addMetric}
            disabled={loading || saving}
          >
            Add Metric
          </button>
        </div>
      </div>

      {message && <div className="metric-config-message">{message}</div>}

      {loading ? (
        <div className="app-empty-state">
          <h3>กำลังโหลด Metric</h3>
          <p>กำลังดึง Metric configuration ของ Device นี้</p>
        </div>
      ) : draftMetrics.length === 0 ? (
        <div className="app-empty-state">
          <h3>ยังไม่มี Metric</h3>
          <p>กด Add Metric เพื่อเพิ่มค่าที่ต้องการแสดงผล</p>
        </div>
      ) : (
        <div className="metric-config-table metric-config-table-v2">
          <div className="metric-config-table-head metric-config-table-head-v2">
            <span>Metric Name</span>
            <span>Unit</span>
            <span>Icon</span>
            <span>Visible</span>
            <span />
          </div>

          {draftMetrics.map((metric, index) => (
            <div
              className="metric-config-row metric-config-row-v2"
              key={metric.id ? `metric-${metric.id}` : `metric-${index}`}
            >
              <input
                value={metric.metric_name || ''}
                placeholder={`เช่น ${
                  index === 0 ? 'Supply Air' : 'Metric Name'
                }`}
                onChange={(event) =>
                  updateMetric(index, 'metric_name', event.target.value)
                }
                disabled={loading || saving}
              />

              <input
                value={metric.unit || ''}
                placeholder="เช่น °C, %, kWh"
                onChange={(event) =>
                  updateMetric(index, 'unit', event.target.value)
                }
                disabled={loading || saving}
              />

              <MetricIconPicker
                value={metric.icon}
                disabled={loading || saving}
                onChange={(iconName) => updateMetric(index, 'icon', iconName)}
              />

              <label className="metric-visible-toggle">
                <input
                  type="checkbox"
                  checked={metric.visible !== false}
                  onChange={(event) =>
                    updateMetric(index, 'visible', event.target.checked)
                  }
                  disabled={loading || saving}
                />
                Show
              </label>

              <button
                type="button"
                className="delete-btn square"
                onClick={() => removeMetric(index)}
                disabled={loading || saving}
                title="Delete metric"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="metric-config-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={handleReset}
          disabled={loading || saving}
        >
          <RotateCcw size={16} />
          Reset
        </button>

        <button
          type="button"
          className="save-btn metric-save-btn"
          onClick={handleSave}
          disabled={loading || saving}
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Display'}
        </button>
      </div>
    </section>
  )
}
