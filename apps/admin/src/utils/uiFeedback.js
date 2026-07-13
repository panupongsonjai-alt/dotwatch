export const ADMIN_UI_TOAST_EVENT = 'dotwatch-admin:ui-toast'
export const ADMIN_UI_CONFIRM_EVENT = 'dotwatch-admin:ui-confirm'

let sequence = 0

function nextId(prefix) {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}

export function showAdminToast({
  type = 'info',
  title = '',
  message = '',
  duration = 4800,
} = {}) {
  if (typeof window === 'undefined') return
  if (!title && !message) return

  window.dispatchEvent(
    new CustomEvent(ADMIN_UI_TOAST_EVENT, {
      detail: { id: nextId('admin-toast'), type, title, message, duration },
    })
  )
}

export function confirmAdminDelete({
  title,
  targetName = '',
  description = '',
} = {}) {
  if (typeof window === 'undefined') return Promise.resolve(false)

  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent(ADMIN_UI_CONFIRM_EVENT, {
        detail: {
          id: nextId('admin-confirm'),
          keyword: 'Delete',
          title: title || 'Confirm Delete',
          targetName,
          description: description || 'This action cannot be undone.',
          resolve,
        },
      })
    )
  })
}
