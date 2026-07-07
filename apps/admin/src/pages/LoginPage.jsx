import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { Activity, Lock, Mail, ShieldCheck } from 'lucide-react'
import { auth } from '../services/firebase'

function LoginPage({ error }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
  })
  const [localError, setLocalError] = useState('')
  const [loading, setLoading] = useState(false)

  function updateField(field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

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

        {error || localError ? (
          <div className="auth-error">{error || localError}</div>
        ) : null}

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
                onChange={(event) =>
                  updateField('password', event.target.value)
                }
                required
              />
            </div>
          </label>

          <button type="submit" disabled={loading}>
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
