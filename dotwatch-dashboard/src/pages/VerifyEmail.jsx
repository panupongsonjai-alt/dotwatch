import { useState } from 'react'
import { resendVerificationEmail } from '../services/auth'
import { useAuth } from '../context/AuthContext'

function VerifyEmail() {
  const { user, logout } = useAuth()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  async function handleResend() {
    try {
      setSending(true)
      setError('')
      setMessage('')

      await resendVerificationEmail()
      setMessage('ส่งอีเมลยืนยันอีกครั้งแล้ว กรุณาตรวจสอบกล่องจดหมาย')
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถส่งอีเมลยืนยันได้ กรุณาลองใหม่ภายหลัง')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand">
            <span className="brand-dot"></span>
            <div>
              <strong>dotWatch</strong>
              <small>IoT Easy Monitoring</small>
            </div>
          </div>
        </div>

        <h1>Verify your email</h1>

        <p>
          กรุณายืนยันอีเมลก่อนใช้งานระบบ Dashboard
          <br />
          ระบบได้ส่งลิงก์ไปที่:
          <br />
          <strong>{user?.email}</strong>
        </p>

        {message && <div className="auth-success">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        <button
          type="button"
          className="primary-button full"
          onClick={handleResend}
          disabled={sending}
        >
          {sending ? 'กำลังส่ง...' : 'ส่งอีเมลยืนยันอีกครั้ง'}
        </button>

        <button
          type="button"
          className="ghost-button full"
          onClick={logout}
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  )
}

export default VerifyEmail