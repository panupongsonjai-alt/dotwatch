import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { Activity, Lock, Mail, ShieldCheck } from 'lucide-react'
import {
  auth,
  firebaseConfigError,
  firebaseConfigHelp,
  isFirebaseConfigured,
} from '../services/firebase'

function LoginPage({ error }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState('')

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!auth) {
      setLocalError(
        firebaseConfigError ||
          'Firebase Admin Auth is not configured. Please check apps/admin/.env.local'
      )
      return
    }

    try {
      setLoading(true)
      setLocalError('')

      await signInWithEmailAndPassword(auth, form.email, form.password)
    } catch (signInError) {
      console.error(signInError)
      setLocalError('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบ Email หรือ Password')
    } finally {
      setLoading(false)
    }
  }

  const authConfigError = !isFirebaseConfigured

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <Activity size={22} />
          </div>

          <div>
            <strong>dotWatch Admin</strong>
            <span>Control Center</span>
          </div>
        </div>

        <div className="auth-heading">
          <ShieldCheck size={34} />
          <h1>Admin Sign In</h1>
          <p>สำหรับผู้ดูแลระบบ dotWatch เท่านั้น</p>
        </div>

        {authConfigError ? (
          <div className="auth-config-card">
            <strong>Admin auth is not configured</strong>
            <span>สร้างไฟล์ {firebaseConfigHelp.localEnvFile} แล้วใส่ Firebase Web SDK config ให้ครบ</span>
            <ul>
              {firebaseConfigHelp.requiredEnvNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error || localError ? <div className="auth-error">{error || localError}</div> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <div className="auth-input">
              <Mail size={17} />
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                disabled={authConfigError}
                required
              />
            </div>
          </label>

          <label>
            Password
            <div className="auth-input">
              <Lock size={17} />
              <input
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                disabled={authConfigError}
                required
              />
            </div>
          </label>

          <button type="submit" disabled={loading || authConfigError}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="auth-note">
          บัญชีต้องมี role เป็น <strong>admin</strong> หรือ{' '}
          <strong>super_admin</strong>
        </p>
      </section>
    </main>
  )
}

export default LoginPage
