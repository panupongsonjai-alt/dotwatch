import { RotateCcw, Save, Trash2 } from 'lucide-react'
import { useDeviceMetrics } from '../hooks/useDeviceMetrics'
import { createBlankMetric } from '../utils/metricDisplayConfig'
import { METRIC_ICON_OPTIONS, MetricIcon } from '../utils/metricIcons'
import { confirmDeleteAction } from '../utils/typedConfirm'


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

  function handleSelect(iconName, event) {
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
          <MetricIcon name={selectedIcon} size={16} />
          <span>{selectedIcon}</span>
        </span>
      </summary>

      <div className="metric-icon-dropdown-menu">
        {METRIC_ICON_OPTIONS.map((iconName) => {
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
              onClick={(event) => handleSelect(iconName, event)}
              disabled={disabled}
            >
              <MetricIcon name={iconName} size={16} />
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
    const metric = draftMetrics[indexToRemove]
    const ok = confirmDeleteAction({
      title: 'Confirm Delete Metric',
      targetName:
        metric?.metric_name ||
        metric?.metric_key ||
        `Metric ${indexToRemove + 1}`,
      description:
        'Metric นี้จะถูกลบออกจากรายการ Draft กรุณาพิมพ์ delete เพื่อยืนยัน',
    })

    if (!ok) return

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
    <section className="metric-config-panel metric-config-panel-v2 metric-config-panel-easy metric-config-panel-clean">
      <div className="metric-config-toolbar">
        <div>
          <span className="page-eyebrow">Display Fields</span>
          <strong>
            {visibleMetricCount}/{draftMetrics.length} Visible
          </strong>
        </div>

        <button
          type="button"
          className="ghost-button"
          onClick={addMetric}
          disabled={loading || saving}
        >
          Add Metric
        </button>
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
        <div className="metric-config-list-clean">
          {draftMetrics.map((metric, index) => {
            const metricLabel =
              metric.metric_name || metric.metric_key || `Metric ${index + 1}`

            return (
              <article
                className="metric-config-card-clean metric-config-row-clean"
                key={metric.id ? `metric-${metric.id}` : `metric-${index}`}
                aria-label={`Configure ${metricLabel}`}
              >
                <div className="metric-config-card-clean-grid">
                  <label className="metric-config-field metric-config-field-name">
                    <span>Metric Name</span>
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
                  </label>

                  <label className="metric-config-field metric-config-field-unit">
                    <span>Unit</span>
                    <input
                      value={metric.unit || ''}
                      placeholder="°C, %, kWh"
                      onChange={(event) =>
                        updateMetric(index, 'unit', event.target.value)
                      }
                      disabled={loading || saving}
                    />
                  </label>

                  <div className="metric-config-field metric-config-field-icon">
                    <span>Icon</span>
                    <MetricIconPicker
                      value={metric.icon}
                      disabled={loading || saving}
                      onChange={(iconName) =>
                        updateMetric(index, 'icon', iconName)
                      }
                    />
                  </div>

                  <div className="metric-config-field metric-config-field-visible">
                    <span>Display</span>
                    <label
                      className={
                        metric.visible !== false
                          ? 'metric-visible-toggle active'
                          : 'metric-visible-toggle'
                      }
                    >
                      <input
                        type="checkbox"
                        checked={metric.visible !== false}
                        onChange={(event) =>
                          updateMetric(index, 'visible', event.target.checked)
                        }
                        disabled={loading || saving}
                      />
                      <span>
                        {metric.visible !== false ? 'Visible' : 'Hidden'}
                      </span>
                    </label>
                  </div>

                  <div className="metric-config-row-action">
                    <button
                      type="button"
                      className="delete-btn square metric-config-delete-btn"
                      onClick={() => removeMetric(index)}
                      disabled={loading || saving}
                      title={`Delete ${metricLabel}`}
                      aria-label={`Delete ${metricLabel}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="metric-config-actions metric-config-footer-actions">
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
