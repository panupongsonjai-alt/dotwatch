const CONFIRM_KEYWORDS = {
  delete: 'delete',
  resetSecret: 'reset secret',
}

function buildConfirmMessage({ title, targetName, description, keyword }) {
  return [
    title,
    targetName ? `Target: ${targetName}` : null,
    description,
    `พิมพ์คำว่า "${keyword}" เพื่อยืนยัน`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function confirmTypedAction({
  keyword,
  title = 'Confirm Action',
  targetName = '',
  description = '',
}) {
  const expectedKeyword = String(keyword || '').trim()
  const typedValue = window.prompt(
    buildConfirmMessage({
      title,
      targetName,
      description,
      keyword: expectedKeyword,
    }),
    ''
  )

  return typedValue === expectedKeyword
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
  })
}
