const DEFAULT_MAX_AUTH_AGE_SECONDS = 5 * 60
const MAX_CLOCK_SKEW_SECONDS = 60

export function requireRecentAuthentication(req, res, next) {
  const authTime = Number(req.firebaseUser?.auth_time)
  const nowSeconds = Math.floor(Date.now() / 1000)
  const authAgeSeconds = nowSeconds - authTime

  if (
    !Number.isFinite(authTime) ||
    authAgeSeconds < -MAX_CLOCK_SKEW_SECONDS ||
    authAgeSeconds > DEFAULT_MAX_AUTH_AGE_SECONDS
  ) {
    return res.status(403).json({
      code: 'RECENT_AUTH_REQUIRED',
      message:
        'กรุณายืนยันรหัสผ่านของบัญชีอีกครั้งก่อนดูหรือ Reset Device Secret',
      maxAuthAgeSeconds: DEFAULT_MAX_AUTH_AGE_SECONDS,
    })
  }

  next()
}
