import { findOrCreateUser } from '../services/user.service.js'

export async function loadUser(req, res, next) {
  try {
    const user = await findOrCreateUser({
      firebaseUid: req.user.uid,
      email: req.user.email,
    })

    req.dbUser = user
    next()
  } catch (error) {
    next(error)
  }
}