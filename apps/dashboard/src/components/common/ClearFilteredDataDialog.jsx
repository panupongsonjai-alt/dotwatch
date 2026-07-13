import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Trash2, X } from 'lucide-react'

function ClearFilteredDataDialog({
  open,
  title,
  description,
  summaryItems = [],
  confirmationKeyword = 'Delete',
  confirmationHelp = '',
  confirmLabel = 'Delete',
  busyLabel = 'Deleting...',
  busy = false,
  onClose,
  onConfirm,
  idPrefix = 'filtered-clear',
}) {
  const [typedValue, setTypedValue] = useState('')
  const expectedKeyword = String(confirmationKeyword || 'Delete').trim()
  const canConfirm = typedValue.trim() === expectedKeyword

  useEffect(() => {
    if (open) setTypedValue('')
  }, [open])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose?.()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [busy, onClose, open])

  if (!open || typeof document === 'undefined') return null

  const titleId = `${idPrefix}-dialog-title`
  const descriptionId = `${idPrefix}-dialog-description`

  return createPortal(
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
            <span>Typed confirmation required</span>
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

        <p id={descriptionId} className="history-clear-dialog-description">
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

        <label className="history-clear-confirm-typed">
          <span>
            พิมพ์คำว่า <strong>{expectedKeyword}</strong> เพื่อยืนยัน
          </span>
          {confirmationHelp && <small>{confirmationHelp}</small>}
          <input
            autoFocus
            value={typedValue}
            onChange={(event) => setTypedValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canConfirm && !busy) onConfirm?.()
            }}
            disabled={busy}
            autoComplete="off"
            spellCheck="false"
          />
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
            disabled={!canConfirm || busy}
          >
            <Trash2 size={16} aria-hidden="true" />
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}

export default ClearFilteredDataDialog
