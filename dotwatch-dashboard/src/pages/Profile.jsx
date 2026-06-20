import React, { useEffect, useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../services/firebase'

function Profile() {
  const user = auth.currentUser

  const [role, setRole] = useState('Admin')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setRole(localStorage.getItem('userRole') || 'Admin')
  }, [])

  function handleRoleChange(value) {
    setRole(value)
    localStorage.setItem('userRole', value)
  }

  async function handleResetPassword() {
    if (!user?.email) {
      setError('ไม่พบอีเมลผู้ใช้งาน')
      return
    }

    try {
      setSending(true)
      setMessage('')
      setError('')

      await sendPasswordResetEmail(auth, user.email)

      setMessage('ส่งอีเมลสำหรับเปลี่ยนรหัสผ่านเรียบร้อย')
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถส่งอีเมลเปลี่ยนรหัสผ่านได้')
    } finally {
      setSending(false)
    }
  }

  const displayName = user?.displayName || 'dotWatch User'
  const email = user?.email || '-'
  const firstLetter =
    displayName?.charAt(0).toUpperCase() ||
    email?.charAt(0).toUpperCase() ||
    'U'

  return (
    <div className="page">
      <section className="panel">
        <div className="section-title">
          <h2>Profile</h2>
          <p>ข้อมูลบัญชีผู้ใช้งานและความปลอดภัย</p>
        </div>

        <div className="profile-layout">
          <div className="profile-preview-card">
            <div className="profile-avatar large">{firstLetter}</div>

            <h3>{displayName}</h3>
            <p>{email}</p>

            <div className="profile-meta">
              <span className={`role-badge ${role.toLowerCase()}`}>{role}</span>

              <span
                className={
                  user?.emailVerified
                    ? 'email-badge verified'
                    : 'email-badge not-verified'
                }
              >
                {user?.emailVerified ? 'Email Verified' : 'Email Not Verified'}
              </span>
            </div>
          </div>

          <div className="profile-form-card">
            <div className="profile-section">
              <h3>Account Information</h3>

              <div className="profile-info-grid">
                <label>
                  Display Name
                  <input value={displayName} disabled />
                </label>

                <label>
                  Email
                  <input value={email} disabled />
                </label>

                <label>
                  Role
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                  >
                    <option value="Admin">Admin</option>
                    <option value="Operator">Operator</option>
                  </select>
                </label>

                <label>
                  Email Status
                  <input
                    value={user?.emailVerified ? 'Verified' : 'Not Verified'}
                    disabled
                  />
                </label>
              </div>
            </div>

            <div className="profile-section">
              <h3>Security</h3>

              <p className="profile-help-text">
                กดปุ่มด้านล่างเพื่อส่งลิงก์เปลี่ยนรหัสผ่านไปยังอีเมลของคุณ
              </p>

              {message && <div className="auth-success">{message}</div>}

              {error && <div className="auth-error">{error}</div>}

              <button
                type="button"
                className="primary-button"
                onClick={handleResetPassword}
                disabled={sending}
              >
                {sending ? 'Sending...' : 'Send Password Reset Email'}
              </button>
            </div>

            <div className="profile-section">
              <h3>User ID</h3>

              <input value={user?.uid || '-'} disabled />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Profile
