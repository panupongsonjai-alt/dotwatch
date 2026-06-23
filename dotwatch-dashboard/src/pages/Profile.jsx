import React, { useEffect, useMemo, useState } from 'react'
import { sendEmailVerification, sendPasswordResetEmail, updateProfile } from 'firebase/auth'
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
import { EmptyState, PageHeader, SectionHeader, StatCard, StatusBadge } from '../components/common'

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
  const [displayName, setDisplayName] = useState(
    user?.displayName || 'dotWatch User'
  )
  const [savingProfile, setSavingProfile] = useState(false)

  const email = user?.email || '-'
  const browserName = getBrowserName()
  const operatingSystem = getOperatingSystem()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const securityScore = user?.emailVerified ? '85%' : '65%'
  const firstLetter =
    displayName?.charAt(0).toUpperCase() || email?.charAt(0).toUpperCase() || 'U'

  const createdAt = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleString('th-TH')
    : '-'

  const lastLoginAt = user?.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString('th-TH')
    : '-'

  const notificationItems = useMemo(
    () => [
      ['emailAlerts', 'Email Alerts', 'ส่งอีเมลเมื่อมีเหตุการณ์สำคัญ'],
      ['offlineAlerts', 'Device Offline Alerts', 'แจ้งเตือนเมื่ออุปกรณ์ Offline'],
      ['criticalAlerts', 'Critical Alarm Alerts', 'แจ้งเตือน Alarm ระดับ Critical'],
      ['weeklyReport', 'Weekly Report', 'ส่งสรุปรายงานรายสัปดาห์'],
    ],
    []
  )

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

  async function handleSaveProfile() {
    if (!user) return

    try {
      setSavingProfile(true)
      setMessage('')
      setError('')
      await updateProfile(user, { displayName })
      setMessage('บันทึกข้อมูลโปรไฟล์เรียบร้อย')
      setActivities(addProfileActivity(`เปลี่ยน Display Name เป็น "${displayName}"`))
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถบันทึกข้อมูลได้')
    } finally {
      setSavingProfile(false)
    }
  }

  function handleClearActivities() {
    setActivities(clearProfileActivities())
  }

  return (
    <div className="page app-page profile-page profile-v3-page">
      <PageHeader
        eyebrow="Account Center"
        title="Profile"
        description="จัดการข้อมูลบัญชี ความปลอดภัย การแจ้งเตือน และ Session ปัจจุบัน"
        meta={
          <>
            <span>{user?.emailVerified ? 'Verified account' : 'Email verification required'}</span>
            <span>{timezone}</span>
          </>
        }
        actions={
          <button
            type="button"
            className="primary-button"
            onClick={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        }
      />

      {message && <div className="auth-success">{message}</div>}
      {error && <div className="auth-error">{error}</div>}

      <section className="profile-v3-hero app-card">
        <div className="profile-v3-avatar">{firstLetter}</div>
        <div className="profile-v3-identity">
          <span className="page-eyebrow">Signed in as</span>
          <h2>{displayName || 'dotWatch User'}</h2>
          <p>{email}</p>
          <div className="profile-v3-badges">
            <StatusBadge status={user?.emailVerified ? 'online' : 'warning'} label={user?.emailVerified ? 'Email Verified' : 'Not Verified'} />
            <StatusBadge status="muted" label={language === 'th' ? 'Thai' : 'English'} />
          </div>
        </div>
      </section>

      <section className="profile-v3-stat-grid">
        <StatCard label="Security Score" value={securityScore} hint={user?.emailVerified ? 'Good' : 'Needs review'} tone={user?.emailVerified ? 'success' : 'warning'} />
        <StatCard label="Email Status" value={user?.emailVerified ? 'Verified' : 'Pending'} hint="Account verification" tone={user?.emailVerified ? 'success' : 'warning'} />
        <StatCard label="Browser" value={browserName} hint={operatingSystem} />
        <StatCard label="Timezone" value={timezone} hint="Current session" />
      </section>

      <section className="profile-v3-layout">
        <div className="profile-v3-main">
          <section className="app-card">
            <SectionHeader title="Account Information" description="ข้อมูลหลักของบัญชี dotWatch" />
            <div className="profile-info-grid compact profile-v3-form-grid">
              <label>
                Display Name
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display Name" />
              </label>
              <label>
                Email
                <input value={email} disabled />
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
                <input value={localStorage.getItem('organization') || 'Personal Account'} disabled />
              </label>
              <label>
                Device Access
                <input value="All Devices" disabled />
              </label>
            </div>
          </section>

          <section className="app-card">
            <SectionHeader title="Security" description="จัดการรหัสผ่านและการยืนยันอีเมล" />
            <div className="profile-v3-security-actions">
              <button type="button" className="security-action primary" onClick={handleResetPassword} disabled={sendingReset}>
                <span>✉️</span>
                <div>
                  <strong>{sendingReset ? 'Sending...' : 'Password Reset Email'}</strong>
                  <small>ส่งอีเมลสำหรับเปลี่ยนรหัสผ่าน</small>
                </div>
                <b>›</b>
              </button>

              {!user?.emailVerified ? (
                <button type="button" className="security-action" onClick={handleSendVerifyEmail} disabled={sendingVerify}>
                  <span>📧</span>
                  <div>
                    <strong>{sendingVerify ? 'Sending...' : 'Verify Email'}</strong>
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
          </section>

          <section className="app-card">
            <SectionHeader title="Notification Settings" description="เลือกประเภทการแจ้งเตือนที่ต้องการรับ" />
            <div className="profile-toggle-list profile-v3-toggle-list">
              {notificationItems.map(([key, label, description]) => (
                <label key={key}>
                  <div>
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </div>
                  <input type="checkbox" checked={notifications[key]} onChange={() => handleNotificationChange(key)} />
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="profile-v3-side">
          <section className="app-card">
            <SectionHeader title="Current Session" description="ข้อมูล Session ล่าสุด" />
            <div className="session-grid clean profile-v3-session-grid">
              <div><span>Browser</span><strong>{browserName}</strong></div>
              <div><span>Operating System</span><strong>{operatingSystem}</strong></div>
              <div><span>Timezone</span><strong>{timezone}</strong></div>
              <div><span>Language</span><strong>{language === 'th' ? 'Thai' : 'English'}</strong></div>
            </div>
          </section>

          <section className="app-card">
            <div className="profile-section-header">
              <SectionHeader title="Recent Activity" description="กิจกรรมล่าสุดของบัญชี" />
              {activities.length > 0 && (
                <button type="button" className="text-button" onClick={handleClearActivities}>Clear</button>
              )}
            </div>

            {activities.length === 0 ? (
              <EmptyState title="ยังไม่มีกิจกรรมล่าสุด" description="กิจกรรมสำคัญจะแสดงที่นี่" />
            ) : (
              <div className="activity-list profile-v3-activity-list">
                {activities.map((activity) => (
                  <div className="activity-item" key={activity.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>{activity.text}</strong>
                      <small>{new Date(activity.time).toLocaleString('th-TH')}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </section>
    </div>
  )
}

export default Profile
