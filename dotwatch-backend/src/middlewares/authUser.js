export async function authUser(req, res, next) {
  const devUser = {
    uid: 'dev-user',
    email: 'dev@example.com',
  }

  req.firebaseUser = devUser
  req.user = devUser

  return next()
}
