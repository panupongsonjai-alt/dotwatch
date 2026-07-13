export const UI_TOAST_EVENT = 'dotwatch:ui-toast'
export const UI_CONFIRM_EVENT = 'dotwatch:ui-confirm'

let sequence = 0

function nextId(prefix) {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}

export function showUiToast({
  type = 'info',
  title = '',
  message = '',
  duration = 4800,
  dedupeKey = '',
} = {}) {
  if (typeof window === 'undefined') return

  const normalizedMessage = String(message || '').trim()
  const normalizedTitle = String(title || '').trim()

  if (!normalizedMessage && !normalizedTitle) return

  window.dispatchEvent(
    new CustomEvent(UI_TOAST_EVENT, {
      detail: {
        id: nextId('toast'),
        type,
        title: normalizedTitle,
        message: normalizedMessage,
        duration,
        dedupeKey:
          String(dedupeKey || '').trim() ||
          `${type}|${normalizedTitle}|${normalizedMessage}`,
      },
    })
  )
}

export function showSuccessToast(message, options = {}) {
  showUiToast({ type: 'success', title: 'Success', message, ...options })
}

export function showErrorToast(message, options = {}) {
  showUiToast({
    type: 'error',
    title: 'Unable to complete action',
    message,
    ...options,
  })
}

export function showWarningToast(message, options = {}) {
  showUiToast({ type: 'warning', title: 'Please check', message, ...options })
}

export function showInfoToast(message, options = {}) {
  showUiToast({ type: 'info', title: 'Information', message, ...options })
}

export function requestTypedConfirmation({
  keyword = 'Delete',
  title = 'Confirm action',
  targetName = '',
  description = '',
  confirmLabel = 'Confirm',
  danger = true,
} = {}) {
  if (typeof window === 'undefined') return Promise.resolve(false)

  const expectedKeyword = String(keyword || '').trim()

  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent(UI_CONFIRM_EVENT, {
        detail: {
          id: nextId('confirm'),
          keyword: expectedKeyword,
          title,
          targetName,
          description,
          confirmLabel,
          danger,
          resolve,
        },
      })
    )
  })
}
