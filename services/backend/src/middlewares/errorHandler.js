import { ZodError } from 'zod'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

// Common Postgres errors caused by client input. They used to surface as
// HTTP 500 (logged with a stack trace), e.g. a duplicate device code or a
// non-numeric id in the URL.
const POSTGRES_CLIENT_ERRORS = {
  '23505': { status: 409, message: 'Resource already exists' },
  '23503': { status: 409, message: 'Related resource not found or still in use' },
  '22P02': { status: 400, message: 'Invalid input' },
}

function getSafeErrorMessage(error, status) {
  const isServerError = status >= 500

  if (env.isDevelopment || !isServerError) {
    return error.message || 'Internal server error'
  }

  return 'Internal server error'
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    message: 'Not found',
    requestId: req.requestId,
  })
}

export function errorHandler(error, req, res, next) {
  const isValidationError = error instanceof ZodError
  const postgresClientError =
    !error.status && !error.statusCode ? POSTGRES_CLIENT_ERRORS[error.code] : null
  const status = isValidationError
    ? 400
    : error.status || error.statusCode || postgresClientError?.status || 500
  const isServerError = status >= 500

  const logPayload = {
    requestId: req.requestId,
    message: error.message,
    method: req.method,
    path: req.originalUrl,
    status,
    code: error.code,
  }

  if (env.isDevelopment || isServerError) {
    logger.error({
      ...logPayload,
      err: error,
    }, 'Request failed')
  } else {
    logger.warn(logPayload, 'Request warning')
  }

  const responsePayload = {
    message: postgresClientError?.message || getSafeErrorMessage(error, status),
    requestId: req.requestId,
  }

  if (error.code && !isServerError) {
    responsePayload.code = error.code
  }

  if (error.details && !isServerError) {
    responsePayload.details = error.details
  }

  if (isValidationError && !isServerError) {
    responsePayload.code = 'VALIDATION_ERROR'
    responsePayload.details = error.errors.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
  }

  res.status(status).json(responsePayload)
}
