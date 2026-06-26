import { env } from '../config/env.js'

export function errorHandler(error, req, res, next) {
  const status = error.status || error.statusCode || 500
  const isServerError = status >= 500

  console.error({
    message: error.message,
    stack: error.stack,
    method: req.method,
    path: req.originalUrl,
    status,
  })

  res.status(status).json({
    message:
      env.isDevelopment || !isServerError
        ? error.message || 'Internal server error'
        : 'Internal server error',
  })
}
