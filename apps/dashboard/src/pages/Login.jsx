import { useState } from 'react'
import {
  loginWithEmail,
  registerWithEmail,
  resetPassword,
} from '../services/auth'
import { firebaseConfigHelp, isFirebaseConfigured } from '../services/firebase'
import { recordUserActivity } from '../services/activityTracker'
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from '../utils/uiFeedback'

function Login() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const isLogin = mode === 'login'
  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'

  async function handleSubmit(e) {
    e.preventDefault()

    if (!email) {
      const validationMessage = 'กรุณากรอกอีเมล'
      setError(validationMessage)
      showWarningToast(validationMessage)
      return
    }

    if (!isForgot && !password) {
      const validationMessage = 'กรุณากรอกรหัสผ่าน'
      setError(validationMessage)
      showWarningToast(validationMessage)
      return
    }

    if (isRegister && password.length < 6) {
      const validationMessage = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
      setError(validationMessage)
      showWarningToast(validationMessage)
      return
    }

    try {
      setSubmitting(true)
      setError('')
      setMessage('')

      if (isLogin) {
        await loginWithEmail(email.trim(), password)
        await recordUserActivity({
          activityType: 'session.login',
          title: 'Signed in',
          description: 'User signed in to dotWatch successfully.',
          severity: 'success',
          metadata: { method: 'email_password' },
        })
      }

      if (isRegister) {
        await registerWithEmail(email.trim(), password)
        await recordUserActivity({
          activityType: 'session.account_created',
          title: 'Account created',
          description: 'A new dotWatch account was created.',
          severity: 'success',
          metadata: { method: 'email_password' },
        })
      }

      if (isForgot) {
        await resetPassword(email.trim())
        const successMessage = 'ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว'
        setMessage(successMessage)
        showSuccessToast(successMessage)
      }
    } catch (err) {
      console.error(err)

      let errorMessage = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'

      if (!isFirebaseConfigured) {
        errorMessage =
          'ยังไม่ได้ตั้งค่า Firebase สำหรับ Dashboard ให้ตรวจไฟล์ apps/dashboard/.env.local'
      } else if (err.code === 'auth/invalid-credential') {
        errorMessage = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
      } else if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'อีเมลนี้ถูกใช้งานแล้ว'
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = 'ไม่พบบัญชีผู้ใช้นี้'
      }

      setError(errorMessage)
      showErrorToast(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setError('')
    setMessage('')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand">
            <span className="brand-dot"></span>

            <strong>dotWatch</strong>
          </div>
        </div>

        <h1>
          {isLogin && 'IoT Easy Monitoring'}
          {isRegister && 'Create account'}
          {isForgot && 'Reset password'}
        </h1>

        <p>
          {isLogin && 'Sign in to monitor your IoT devices.'}
          {isRegister && 'Create an account to start using dotWatch.'}
          {isForgot && 'Enter your email to receive a reset link.'}
        </p>

        {!isFirebaseConfigured && (
          <div className="auth-config-warning" role="alert">
            <strong>Dashboard auth is not configured</strong>
            <span>
              Create <code>{firebaseConfigHelp.localEnvFile}</code> and restart
              the dashboard dev server.
            </span>
            <small>
              Required: {firebaseConfigHelp.requiredEnvNames.join(', ')}
            </small>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          {!isForgot && (
            <label>
              Password
              <input
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-success">{message}</div>}

          <button
            type="submit"
            className="primary-button full"
            disabled={submitting || !isFirebaseConfigured}
          >
            {submitting && 'Processing...'}
            {!submitting && isLogin && 'Login'}
            {!submitting && isRegister && 'Create Account'}
            {!submitting && isForgot && 'Send Reset Link'}
          </button>
        </form>

        {isLogin && (
          <button
            type="button"
            className="ghost-button full"
            disabled={submitting}
            onClick={() => changeMode('forgot')}
          >
            Forgot password?
          </button>
        )}

        <button
          type="button"
          className="ghost-button full"
          disabled={submitting}
          onClick={() => changeMode(isRegister ? 'login' : 'register')}
        >
          {isRegister ? 'Back to login' : 'Create new account'}
        </button>

        {isForgot && (
          <button
            type="button"
            className="ghost-button full"
            disabled={submitting}
            onClick={() => changeMode('login')}
          >
            Back to login
          </button>
        )}
      </div>
    </div>
  )
}

export default Login
