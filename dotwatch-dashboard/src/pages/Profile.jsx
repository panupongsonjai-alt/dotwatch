import React, { useEffect, useState } from 'react'
import { sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../services/firebase'
import {
  addProfileActivity,
  clearProfileActivities,
  getBrowserName,
  getOperatingSystem,
  getProfileLanguage,
  getProfileNotifications,
  saveProfileNotifications,
} from '../utils/profileStorage'

function Profile() {
  const user = auth.currentUser

  const [language, setLanguage] = useState('th')
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    offlineAlerts: true,
    criticalAlerts: true,
    weeklyReport: false,
  })

  const [activities, setActivities] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sendingReset, setSendingReset] = useState(false)
  const [sendingVerify, setSendingVerify] = useState(false)

  const displayName = user?.displayName || 'dotWatch User'
  const email = user?.email || '-'
  const uid = user?.uid || '-'
  const providerId = user?.providerData?.[0]?.providerId || 'password'
  const browserName = getBrowserName()
  const operatingSystem = getOperatingSystem()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const securityScore = user?.emailVerified ? '85%' : '65%'

  const createdAt = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleString('th-TH')
    : '-'

  const lastLoginAt = user?.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString('th-TH')
    : '-'

  const firstLetter =
    displayName?.charAt(0).toUpperCase() ||
    email?.charAt(0).toUpperCase() ||
    'U'

  useEffect(() => {
    setLanguage(getProfileLanguage())
    setNotifications(getProfileNotifications())
    setActivities(addProfileActivity('เปิดหน้า Profile'))
  }, [])

  function handleNotificationChange(key) {
    const next = {
      ...notifications,
      [key]: !notifications[key],
    }

    setNotifications(next)
    saveProfileNotifications(next)
    setActivities(addProfileActivity('อัปเดตการตั้งค่าการแจ้งเตือน'))
  }

  async function handleResetPassword() {
    if (!user?.email) {
      setError('ไม่พบอีเมลผู้ใช้งาน')
      return
    }

    try {
      setSendingReset(true)
      setMessage('')
      setError('')

      await sendPasswordResetEmail(auth, user.email)

      setMessage('ส่งอีเมลสำหรับเปลี่ยนรหัสผ่านเรียบร้อย')
      setActivities(addProfileActivity('ส่งอีเมลเปลี่ยนรหัสผ่าน'))
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถส่งอีเมลเปลี่ยนรหัสผ่านได้')
    } finally {
      setSendingReset(false)
    }
  }

  async function handleSendVerifyEmail() {
    if (!user) {
      setError('ไม่พบข้อมูลผู้ใช้งาน')
      return
    }

    try {
      setSendingVerify(true)
      setMessage('')
      setError('')

      await sendEmailVerification(user)

      setMessage('ส่งอีเมลยืนยันตัวตนเรียบร้อย กรุณาตรวจสอบกล่องอีเมล')
      setActivities(addProfileActivity('ส่งอีเมลยืนยันตัวตน'))
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถส่งอีเมลยืนยันตัวตนได้')
    } finally {
      setSendingVerify(false)
    }
  }

  function handleClearActivities() {
    setActivities(clearProfileActivities())
  }

  return (
    <div className="page app-page profile-page">
      <section className="profile-shell app-page-stack">
        <div className="app-page-header profile-main-title">
          <div>
            <span className="page-eyebrow">Account</span>
            <h2>Profile</h2>
            <p>จัดการข้อมูลบัญชี ความปลอดภัย และการตั้งค่าส่วนตัว</p>
          </div>
        </div>

        {message && <div className="auth-success">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        <div className="profile-main-grid">
          <section className="profile-section app-card account-card">
            <div className="profile-card-title">
              <span className="profile-title-icon">👤</span>
              <h3>Account Information</h3>
            </div>

            <div className="profile-info-grid compact">
              <label>
                Display Name
                <input value={displayName} disabled />
              </label>

              <label>
                Email
                <input value={email} disabled />
              </label>

              <label>
                Email Status
                <input
                  value={user?.emailVerified ? 'Verified' : 'Not Verified'}
                  disabled
                />
              </label>

              <label>
                Account Created
                <input value={createdAt} disabled />
              </label>

              <label>
                Last Login
                <input value={lastLoginAt} disabled />
              </label>

              <label>
                Organization
                <input
                  value={
                    localStorage.getItem('organization') || 'Personal Account'
                  }
                  disabled
                />
              </label>

              <label>
                Timezone
                <input value={timezone} disabled />
              </label>

              <label>
                Language
                <input
                  value={language === 'th' ? 'Thai' : 'English'}
                  disabled
                />
              </label>

              <label>
                Account Type
                <input value="Standard" disabled />
              </label>

              <label>
                Device Access
                <input value="All Devices" disabled />
              </label>
            </div>
          </section>

          <section className="profile-section app-card security-section">
            <div className="profile-card-title">
              <span className="profile-title-icon">🛡️</span>
              <div>
                <h3>Security</h3>
                <p>จัดการรหัสผ่าน การยืนยันอีเมล และความปลอดภัยของบัญชี</p>
              </div>
            </div>

            <div className="security-score-card clean">
              <div className="security-score-main clean">
                <strong>{securityScore}</strong>
                <span>Security Score</span>
                <small>{user?.emailVerified ? 'Good' : 'Needs Review'}</small>
              </div>

              <div className="security-check-list clean">
                <div
                  className={
                    user?.emailVerified
                      ? 'security-check success'
                      : 'security-check warning'
                  }
                >
                  <span>{user?.emailVerified ? '✓' : '!'}</span>
                  <div>
                    <strong>
                      {user?.emailVerified
                        ? 'Email verified'
                        : 'Email not verified'}
                    </strong>
                    <p>
                      {user?.emailVerified
                        ? 'อีเมลของคุณได้รับการยืนยันแล้ว'
                        : 'แนะนำให้ยืนยันอีเมลก่อนใช้งานจริง'}
                    </p>
                  </div>
                  <em>{user?.emailVerified ? 'Secure' : 'Improve'}</em>
                </div>

                <div className="security-check success">
                  <span>✓</span>
                  <div>
                    <strong>Password reset available</strong>
                    <p>คุณสามารถรีเซ็ตรหัสผ่านได้</p>
                  </div>
                  <em>Secure</em>
                </div>

                <div className="security-check success">
                  <span>✓</span>
                  <div>
                    <strong>Account active</strong>
                    <p>บัญชีของคุณใช้งานได้ปกติ</p>
                  </div>
                  <em>Secure</em>
                </div>
              </div>
            </div>

            <div className="security-action-grid">
              <button
                type="button"
                className="security-action primary"
                onClick={handleResetPassword}
                disabled={sendingReset}
              >
                <span>✉️</span>
                <div>
                  <strong>
                    {sendingReset ? 'Sending...' : 'Send Password Reset Email'}
                  </strong>
                  <small>ส่งอีเมลสำหรับเปลี่ยนรหัสผ่าน</small>
                </div>
                <b>›</b>
              </button>

              {!user?.emailVerified ? (
                <button
                  type="button"
                  className="security-action"
                  onClick={handleSendVerifyEmail}
                  disabled={sendingVerify}
                >
                  <span>📧</span>
                  <div>
                    <strong>
                      {sendingVerify ? 'Sending...' : 'Send Email Verification'}
                    </strong>
                    <small>ส่งอีเมลยืนยันตัวตน</small>
                  </div>
                  <b>›</b>
                </button>
              ) : (
                <div className="security-action verified">
                  <span>✓</span>
                  <div>
                    <strong>Email Verified</strong>
                    <small>บัญชีนี้ยืนยันอีเมลแล้ว</small>
                  </div>
                </div>
              )}
            </div>

            <div className="current-session-card clean">
              <h4>Current Session</h4>

              <div className="session-grid clean">
                <div>
                  <span>Browser</span>
                  <strong>{browserName}</strong>
                </div>

                <div>
                  <span>Operating System</span>
                  <strong>{operatingSystem}</strong>
                </div>

                <div>
                  <span>Timezone</span>
                  <strong>{timezone}</strong>
                </div>

                <div>
                  <span>Language</span>
                  <strong>{language === 'th' ? 'Thai' : 'English'}</strong>
                </div>
              </div>
            </div>
          </section>

          <div className="profile-three-grid">
            <section className="profile-section app-card">
              <div className="profile-card-title">
                <span className="profile-title-icon">🔔</span>
                <h3>Notification Settings</h3>
              </div>

              <div className="profile-toggle-list">
                {Object.entries({
                  emailAlerts: 'Email Alerts',
                  offlineAlerts: 'Device Offline Alerts',
                  criticalAlerts: 'Critical Alarm Alerts',
                  weeklyReport: 'Weekly Report',
                }).map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={notifications[key]}
                      onChange={() => handleNotificationChange(key)}
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="profile-section app-card">
              <div className="profile-section app-card-header">
                <div className="profile-card-title">
                  <span className="profile-title-icon">🕘</span>
                  <h3>Recent Activity</h3>
                </div>

                {activities.length > 0 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={handleClearActivities}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="activity-list">
                {activities.length === 0 ? (
                  <p className="profile-help-text">ยังไม่มีกิจกรรมล่าสุด</p>
                ) : (
                  activities.map((activity) => (
                    <div className="activity-item" key={activity.id}>
                      <span className="activity-dot" />
                      <div>
                        <strong>{activity.text}</strong>
                        <small>
                          {new Date(activity.time).toLocaleString('th-TH')}
                        </small>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="profile-two-grid">
            <section className="profile-section app-card">
              <div className="profile-card-title">
                <span className="profile-title-icon">ℹ️</span>
                <h3>System Information</h3>
              </div>

              <div className="profile-info-grid one">
                <label>
                  User ID
                  <input value={uid} disabled />
                </label>

                <label>
                  Provider
                  <input value={providerId} disabled />
                </label>
              </div>
            </section>

            <section className="profile-section app-card danger-zone">
              <div className="profile-card-title">
                <span className="profile-title-icon danger">⚠️</span>
                <h3>Danger Zone</h3>
              </div>

              <p>
                ส่วนนี้เตรียมไว้สำหรับการจัดการบัญชีขั้นสูง เช่น ลบบัญชี
                หรือล้างข้อมูลส่วนตัวในอนาคต
              </p>

              <button type="button" className="danger-button" disabled>
                Delete Account
              </button>
            </section>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Profile
