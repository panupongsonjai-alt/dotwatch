import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Info, Trash2, X } from 'lucide-react'
import {
  ADMIN_UI_CONFIRM_EVENT,
  ADMIN_UI_TOAST_EVENT,
} from '../../utils/uiFeedback'

function AdminConfirmationDialog({ confirmation, onResolve }) {
  const [typedValue, setTypedValue] = useState('')
  const expectedKeyword = String(confirmation.keyword || '').trim()
  const canConfirm = typedValue.trim() === expectedKeyword

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') onResolve(false)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onResolve])

  return (
    <div
      className="admin-confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onResolve(false)
      }}
    >
      <section className="admin-confirm-dialog" role="dialog" aria-modal="true">
        <div className="admin-confirm-header">
          <span>
            <Trash2 size={21} />
          </span>
          <div>
            <small>Typed confirmation required</small>
            <h2>{confirmation.title}</h2>
          </div>
          <button type="button" onClick={() => onResolve(false)}>
            <X size={18} />
          </button>
        </div>

        {confirmation.targetName && (
          <p className="admin-confirm-target">{confirmation.targetName}</p>
        )}

        <p>{confirmation.description}</p>

        <label>
          Type <strong>{expectedKeyword}</strong> to continue
          <input
            autoFocus
            value={typedValue}
            onChange={(event) => setTypedValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canConfirm) onResolve(true)
            }}
            autoComplete="off"
            spellCheck="false"
          />
        </label>

        <div className="admin-confirm-actions">
          <button type="button" onClick={() => onResolve(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="danger"
            disabled={!canConfirm}
            onClick={() => onResolve(true)}
          >
            Delete
          </button>
        </div>
      </section>
    </div>
  )
}

function UiFeedbackHost() {
  const [toasts, setToasts] = useState([])
  const [confirmQueue, setConfirmQueue] = useState([])
  const timersRef = useRef(new Map())
  const recentToastKeysRef = useRef(new Map())
  const active = confirmQueue[0] || null

  useEffect(() => {
    const timers = timersRef.current

    function dismissToast(id) {
      setToasts((current) => current.filter((toast) => toast.id !== id))
      const timer = timers.get(id)
      if (timer) window.clearTimeout(timer)
      timers.delete(id)
    }

    function handleToast(event) {
      const toast = event.detail || {}
      const dedupeKey = `${toast.type || 'info'}|${toast.title || ''}|${toast.message || ''}`
      const now = Date.now()

      if (now - (recentToastKeysRef.current.get(dedupeKey) || 0) < 1800) return
      recentToastKeysRef.current.set(dedupeKey, now)

      setToasts((current) => [...current.slice(-3), toast])

      const duration = Number(toast.duration)
      if (Number.isFinite(duration) && duration > 0) {
        const timer = window.setTimeout(() => dismissToast(toast.id), duration)
        timers.set(toast.id, timer)
      }
    }

    function handleConfirm(event) {
      if (event.detail?.resolve) {
        setConfirmQueue((current) => [...current, event.detail])
      }
    }

    window.addEventListener(ADMIN_UI_TOAST_EVENT, handleToast)
    window.addEventListener(ADMIN_UI_CONFIRM_EVENT, handleConfirm)

    return () => {
      window.removeEventListener(ADMIN_UI_TOAST_EVENT, handleToast)
      window.removeEventListener(ADMIN_UI_CONFIRM_EVENT, handleConfirm)
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])

  function resolveActive(result) {
    if (!active) return
    active.resolve(result)
    setConfirmQueue((current) => current.slice(1))
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="admin-popup-toast-viewport" aria-live="polite">
        {toasts.map((toast) => {
          const Icon =
            toast.type === 'success'
              ? CheckCircle2
              : toast.type === 'error'
                ? AlertCircle
                : Info

          return (
            <article
              key={toast.id}
              className={`admin-popup-toast ${toast.type || 'info'}`}
              role={toast.type === 'error' ? 'alert' : 'status'}
            >
              <Icon size={20} />
              <div>
                {toast.title && <strong>{toast.title}</strong>}
                {toast.message && <p>{toast.message}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => {
                  setToasts((current) =>
                    current.filter((item) => item.id !== toast.id)
                  )
                  const timer = timersRef.current.get(toast.id)
                  if (timer) window.clearTimeout(timer)
                  timersRef.current.delete(toast.id)
                }}
              >
                <X size={16} />
              </button>
            </article>
          )
        })}
      </div>

      {active && (
        <AdminConfirmationDialog
          key={active.id}
          confirmation={active}
          onResolve={resolveActive}
        />
      )}
    </>,
    document.body
  )
}

export default UiFeedbackHost
