import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'

function ClearFilteredDataDialog({
  open,
  title,
  description,
  summaryItems = [],
  confirmText = 'ยืนยันการลบข้อมูล',
  confirmLabel = 'ยืนยันการลบ',
  busyLabel = 'กำลังลบข้อมูล...',
  busy = false,
  onClose,
  onConfirm,
  idPrefix = 'filtered-clear',
}) {
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (open) setConfirmed(false)
  }, [open])

  if (!open) return null

  const titleId = `${idPrefix}-dialog-title`
  const descriptionId = `${idPrefix}-dialog-description`

  return (
    <div
      className="history-clear-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.()
      }}
    >
      <section
        className="history-clear-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="history-clear-dialog-header">
          <div className="history-clear-dialog-icon">
            <AlertTriangle size={22} aria-hidden="true" />
          </div>

          <div>
            <span>Confirm destructive action</span>
            <h2 id={titleId}>{title}</h2>
          </div>

          <button
            type="button"
            className="history-clear-dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="ปิดหน้าต่างยืนยัน"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <p
          id={descriptionId}
          className="history-clear-dialog-description"
        >
          {description}
        </p>

        <dl className="history-clear-summary">
          {summaryItems.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>

        <label className="history-clear-confirm-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={busy}
          />
          <span>{confirmText}</span>
        </label>

        <div className="history-clear-dialog-actions">
          <button
            type="button"
            className="history-clear-cancel-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="history-clear-confirm-button"
            onClick={onConfirm}
            disabled={!confirmed || busy}
          >
            <Trash2 size={16} aria-hidden="true" />
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

export default ClearFilteredDataDialog
