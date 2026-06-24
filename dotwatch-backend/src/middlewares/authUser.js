import { admin, firebaseReady } from '../config/firebaseAdmin.js'

export async function authUser(req, res, next) {
  if (!firebaseReady) {
    return res.status(500).json({
      message: 'Firebase Admin not configured',
    })
  }

  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
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

    return res.status(401).json({
      message: 'Invalid token',
    })
  }
}
