import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Trash2,
  X,
} from 'lucide-react'
import { UI_CONFIRM_EVENT, UI_TOAST_EVENT } from '../../utils/uiFeedback'

const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  critical: AlertTriangle,
  info: Info,
}

function UiFeedbackHost() {
  const [toasts, setToasts] = useState([])
  const [confirmQueue, setConfirmQueue] = useState([])
  const [typedValue, setTypedValue] = useState('')
  const timersRef = useRef(new Map())
  const recentToastKeysRef = useRef(new Map())

  const activeConfirmation = confirmQueue[0] || null
  const expectedKeyword = String(activeConfirmation?.keyword || '').trim()
  const canConfirm = typedValue.trim() === expectedKeyword

  useEffect(() => {
    function dismissToast(id) {
      setToasts((current) => current.filter((toast) => toast.id !== id))
      const timer = timersRef.current.get(id)
      if (timer) window.clearTimeout(timer)
      timersRef.current.delete(id)
    }

    function handleToast(event) {
      const toast = event.detail || {}
      const now = Date.now()
      const explicitDedupeKey = String(toast.dedupeKey || '')
      const contentDedupeKey = `${toast.type || 'info'}|${toast.message || toast.title || ''}`
      const dedupeKeys = [explicitDedupeKey, contentDedupeKey].filter(Boolean)
      const isDuplicate = dedupeKeys.some(
        (key) => now - (recentToastKeysRef.current.get(key) || 0) < 1800
      )

      if (isDuplicate) return
      dedupeKeys.forEach((key) => recentToastKeysRef.current.set(key, now))

      setToasts((current) => [...current.slice(-3), toast])

      const duration = Number(toast.duration)
      if (Number.isFinite(duration) && duration > 0) {
        const timer = window.setTimeout(() => dismissToast(toast.id), duration)
        timersRef.current.set(toast.id, timer)
      }
    }

    function handleConfirmation(event) {
      const confirmation = event.detail
      if (!confirmation?.resolve) return
      setConfirmQueue((current) => [...current, confirmation])
    }

    window.addEventListener(UI_TOAST_EVENT, handleToast)
    window.addEventListener(UI_CONFIRM_EVENT, handleConfirmation)

    return () => {
      window.removeEventListener(UI_TOAST_EVENT, handleToast)
      window.removeEventListener(UI_CONFIRM_EVENT, handleConfirmation)
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
      timersRef.current.clear()
      setConfirmQueue((current) => {
        current.forEach((confirmation) => confirmation.resolve(false))
        return []
      })
    }
  }, [])

  useEffect(() => {
    setTypedValue('')
  }, [activeConfirmation?.id])

  useEffect(() => {
    if (!activeConfirmation || typeof document === 'undefined') return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        activeConfirmation.resolve(false)
        setConfirmQueue((current) => current.slice(1))
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeConfirmation])

  const toastNodes = useMemo(
    () =>
      toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.type] || Info
        return (
          <article
            key={toast.id}
            className={`dw-popup-toast ${toast.type || 'info'}`}
            role={
              toast.type === 'error' || toast.type === 'critical'
                ? 'alert'
                : 'status'
            }
          >
            <span className="dw-popup-toast-icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <div className="dw-popup-toast-copy">
              {toast.title && <strong>{toast.title}</strong>}
              {toast.message && <p>{toast.message}</p>}
            </div>
            <button
              type="button"
              className="dw-popup-toast-close"
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
      }),
    [toasts]
  )

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <div
        className="dw-popup-toast-viewport"
        aria-live="polite"
        aria-atomic="false"
      >
        {toastNodes}
      </div>

      {activeConfirmation && (
        <div
          className="dw-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return
            activeConfirmation.resolve(false)
            setConfirmQueue((current) => current.slice(1))
          }}
        >
          <section
            className="dw-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dw-confirm-title"
            aria-describedby="dw-confirm-description"
          >
            <div className="dw-confirm-header">
              <span
                className={`dw-confirm-icon ${activeConfirmation.danger ? 'danger' : ''}`}
              >
                {activeConfirmation.danger ? (
                  <Trash2 size={22} />
                ) : (
                  <AlertTriangle size={22} />
                )}
              </span>
              <div>
                <span>Typed confirmation required</span>
                <h2 id="dw-confirm-title">{activeConfirmation.title}</h2>
              </div>
              <button
                type="button"
                className="dw-confirm-close"
                aria-label="Close confirmation"
                onClick={() => {
                  activeConfirmation.resolve(false)
                  setConfirmQueue((current) => current.slice(1))
                }}
              >
                <X size={18} />
              </button>
            </div>

            {activeConfirmation.targetName && (
              <div className="dw-confirm-target">
                <span>Target</span>
                <strong>{activeConfirmation.targetName}</strong>
              </div>
            )}

            <p id="dw-confirm-description" className="dw-confirm-description">
              {activeConfirmation.description ||
                'This action cannot be undone.'}
            </p>

            <label className="dw-confirm-typed-field">
              <span>
                Type <strong>{expectedKeyword}</strong> to continue
              </span>
              <input
                autoFocus
                value={typedValue}
                onChange={(event) => setTypedValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canConfirm) {
                    activeConfirmation.resolve(true)
                    setConfirmQueue((current) => current.slice(1))
                  }
                }}
                autoComplete="off"
                spellCheck="false"
              />
            </label>

            <div className="dw-confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  activeConfirmation.resolve(false)
                  setConfirmQueue((current) => current.slice(1))
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={
                  activeConfirmation.danger ? 'danger-button' : 'primary-button'
                }
                disabled={!canConfirm}
                onClick={() => {
                  activeConfirmation.resolve(true)
                  setConfirmQueue((current) => current.slice(1))
                }}
              >
                {activeConfirmation.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </>,
    document.body
  )
}

export default UiFeedbackHost
