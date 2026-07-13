import { requestTypedConfirmation } from './uiFeedback'

const CONFIRM_KEYWORDS = {
  delete: 'Delete',
  resetSecret: 'Reset Secret',
}

export function confirmTypedAction({
  keyword,
  title = 'Confirm Action',
  targetName = '',
  description = '',
  confirmLabel = 'Confirm',
  danger = true,
}) {
  return requestTypedConfirmation({
    keyword: String(keyword || '').trim(),
    title,
    targetName,
    description,
    confirmLabel,
    danger,
  })
}

export function confirmDeleteAction({
  title = 'Confirm Delete',
  targetName = '',
  description = 'รายการนี้จะถูกลบและไม่สามารถย้อนกลับได้',
} = {}) {
  return confirmTypedAction({
    keyword: CONFIRM_KEYWORDS.delete,
    title,
    targetName,
    description,
    confirmLabel: 'Delete',
    danger: true,
  })
}

export function confirmResetSecretAction({
  title = 'Confirm Reset Secret',
  targetName = '',
  description = 'Secret เดิมจะใช้งานไม่ได้ทันทีหลัง Reset',
} = {}) {
  return confirmTypedAction({
    keyword: CONFIRM_KEYWORDS.resetSecret,
    title,
    targetName,
    description,
    confirmLabel: 'Reset Secret',
    danger: true,
  })
}
