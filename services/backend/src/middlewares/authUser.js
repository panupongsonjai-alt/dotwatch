import { env } from '../config/env.js'
import { admin, firebaseReady } from '../config/firebaseAdmin.js'

function attachDevUser(req) {
  req.firebaseUser = {
    uid: env.devAuthUid,
    email: env.devAuthEmail,
    name: 'Local Development User',
  }

  req.user = req.firebaseUser
}

export async function authUser(req, res, next) {
  if (!firebaseReady) {
    if (env.isDevelopment && env.devAuthBypass) {
      attachDevUser(req)
      return next()
    }

    return res.status(500).json({
      message:
        'Firebase Admin not configured. For local development set DEV_AUTH_BYPASS=true, or configure Firebase Admin service account variables.',
    })
  }

  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    if (env.isDevelopment && env.devAuthBypass) {
      attachDevUser(req)
      return next()
    }

    return res.status(401).json({
      message: 'Missing token',
    })
  }

  try {
    const token = authHeader.replace('Bearer ', '')
    const decoded = await admin.auth().verifyIdToken(token)

    req.firebaseUser = decoded
    req.user = decoded

    next()
  } catch (error) {
    console.error('Firebase token error:', error.message)

    if (env.isDevelopment && env.devAuthBypass) {
      attachDevUser(req)
      return next()
    }

    return res.status(401).json({
      message: 'Invalid token',
    })
  }
}
