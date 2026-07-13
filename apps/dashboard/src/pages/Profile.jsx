import { useEffect, useState } from 'react'
import {
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../services/firebase'
import { recordUserActivity } from '../services/activityTracker'
import {
  getBrowserName,
  getOperatingSystem,
  getProfileLanguage,
} from '../utils/profileStorage'
import {
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '../components/common'
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from '../utils/uiFeedback'

function Profile() {
  const user = auth.currentUser

  const [language, setLanguage] = useState('th')
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
    displayName?.charAt(0).toUpperCase() ||
    email?.charAt(0).toUpperCase() ||
    'U'

  const createdAt = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleString('th-TH')
    : '-'

  const lastLoginAt = user?.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString('th-TH')
    : '-'

  useEffect(() => {
    setLanguage(getProfileLanguage())
  }, [])

  async function handleResetPassword() {
    if (!user?.email) {
      const validationMessage = 'ไม่พบอีเมลผู้ใช้งาน'
      setError(validationMessage)
      showWarningToast(validationMessage)
      return
    }

    try {
      setSendingReset(true)
      setMessage('')
      setError('')
      await sendPasswordResetEmail(auth, user.email)
      void recordUserActivity({
        activityType: 'profile.password_reset_requested',
        title: 'Password reset requested',
        description: 'A password reset email was requested from Profile.',
      })
      const successMessage = 'ส่งอีเมลสำหรับเปลี่ยนรหัสผ่านเรียบร้อย'
      setMessage(successMessage)
      showSuccessToast(successMessage)
    } catch (err) {
      console.error(err)
      const errorMessage = 'ไม่สามารถส่งอีเมลเปลี่ยนรหัสผ่านได้'
      setError(errorMessage)
      showErrorToast(errorMessage)
    } finally {
      setSendingReset(false)
    }
  }

  async function handleSendVerifyEmail() {
    if (!user) {
      const validationMessage = 'ไม่พบข้อมูลผู้ใช้งาน'
      setError(validationMessage)
      showWarningToast(validationMessage)
      return
    }

    try {
      setSendingVerify(true)
      setMessage('')
      setError('')
      await sendEmailVerification(user)
      void recordUserActivity({
        activityType: 'profile.verification_requested',
        title: 'Email verification requested',
        description: 'A new verification email was requested.',
      })
      const successMessage =
        'ส่งอีเมลยืนยันตัวตนเรียบร้อย กรุณาตรวจสอบกล่องอีเมล'
      setMessage(successMessage)
      showSuccessToast(successMessage)
    } catch (err) {
      console.error(err)
      const errorMessage = 'ไม่สามารถส่งอีเมลยืนยันตัวตนได้'
      setError(errorMessage)
      showErrorToast(errorMessage)
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
      void recordUserActivity({
        activityType: 'profile.updated',
        title: 'Profile updated',
        description: 'The account display name was updated.',
      })
      const successMessage = 'บันทึกข้อมูลโปรไฟล์เรียบร้อย'
      setMessage(successMessage)
      showSuccessToast(successMessage)
    } catch (err) {
      console.error(err)
      const errorMessage = 'ไม่สามารถบันทึกข้อมูลได้'
      setError(errorMessage)
      showErrorToast(errorMessage)
    } finally {
      setSavingProfile(false)
    }
  }

  return (
    <div className="page app-page profile-page profile-v3-page">
      <PageHeader
        eyebrow="Account Center"
        title="Profile"
        description="จัดการข้อมูลบัญชี ความปลอดภัย และ Session ปัจจุบัน"
        meta={
          <>
            <span>
              {user?.emailVerified
                ? 'Verified account'
                : 'Email verification required'}
            </span>
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
            <StatusBadge
              status={user?.emailVerified ? 'online' : 'warning'}
              label={user?.emailVerified ? 'Email Verified' : 'Not Verified'}
            />
            <StatusBadge
              status="muted"
              label={language === 'th' ? 'Thai' : 'English'}
            />
          </div>
        </div>
      </section>

      <section className="profile-v3-stat-grid">
        <StatCard
          label="Security Score"
          value={securityScore}
          hint={user?.emailVerified ? 'Good' : 'Needs review'}
          tone={user?.emailVerified ? 'success' : 'warning'}
        />
        <StatCard
          label="Email Status"
          value={user?.emailVerified ? 'Verified' : 'Pending'}
          hint="Account verification"
          tone={user?.emailVerified ? 'success' : 'warning'}
        />
        <StatCard label="Browser" value={browserName} hint={operatingSystem} />
        <StatCard label="Timezone" value={timezone} hint="Current session" />
      </section>

      <section className="profile-v3-layout">
        <div className="profile-v3-main">
          <section className="app-card">
            <SectionHeader
              title="Account Information"
              description="ข้อมูลหลักของบัญชี dotWatch"
            />
            <div className="profile-info-grid compact profile-v3-form-grid">
              <label>
                Display Name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display Name"
                />
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
                <input
                  value={
                    localStorage.getItem('organization') || 'Personal Account'
                  }
                  disabled
                />
              </label>
              <label>
                Device Access
                <input value="All Devices" disabled />
              </label>
            </div>
          </section>

          <section className="app-card">
            <SectionHeader
              title="Security"
              description="จัดการรหัสผ่านและการยืนยันอีเมล"
            />
            <div className="profile-v3-security-actions">
              <button
                type="button"
                className="security-action primary"
                onClick={handleResetPassword}
                disabled={sendingReset}
              >
                <span>✉️</span>
                <div>
                  <strong>
                    {sendingReset ? 'Sending...' : 'Password Reset Email'}
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
                      {sendingVerify ? 'Sending...' : 'Verify Email'}
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
          </section>
        </div>

        <aside className="profile-v3-side">
          <section className="app-card">
            <SectionHeader
              title="Current Session"
              description="ข้อมูล Session ล่าสุด"
            />
            <div className="session-grid clean profile-v3-session-grid">
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
          </section>
        </aside>
      </section>
    </div>
  )
}

export default Profile
