import crypto from 'crypto'

function normalizeRequestId(value) {
  if (!value) return ''

  const firstValue = Array.isArray(value) ? value[0] : value
  return String(firstValue)
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, 80)
}

export function requestContext(req, res, next) {
  const requestId = normalizeRequestId(req.headers['x-request-id']) || crypto.randomUUID()

  req.requestId = requestId
  res.setHeader('x-request-id', requestId)

  next()
}
