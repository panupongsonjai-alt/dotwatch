export function requireAdmin(req, res, next) {
  const user = req.dbUser

  if (!user) {
    return res.status(401).json({
      message: 'Authentication required',
    })
  }

  const role = user.role || 'user'
  const allowedRoles = ['admin', 'super_admin']

  if (!allowedRoles.includes(role)) {
    return res.status(403).json({
      message: 'Admin access required',
    })
  }

  next()
}

export function requireSuperAdmin(req, res, next) {
  const user = req.dbUser

  if (!user) {
    return res.status(401).json({
      message: 'Authentication required',
    })
  }

  if (user.role !== 'super_admin') {
    return res.status(403).json({
      message: 'Super admin access required',
    })
  }

  next()
}
