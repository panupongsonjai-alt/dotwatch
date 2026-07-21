import { useEffect, useMemo, useState } from 'react'
import ThaiAddressModule from 'react-thai-address'
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
  getCustomerProfile,
  getProfileLanguage,
  saveCustomerProfile,
} from '../utils/profileStorage'
import {
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
  UnifiedSelect,
} from '../components/common'
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from '../utils/uiFeedback'

function Profile() {
  const thaiAddress = ThaiAddressModule.default || ThaiAddressModule
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
  const [customerProfile, setCustomerProfile] = useState(getCustomerProfile)

  const email = user?.email || '-'
  const browserName = getBrowserName()
  const operatingSystem = getOperatingSystem()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const securityScore = user?.emailVerified ? '85%' : '65%'
  const addressRows = useMemo(() => thaiAddress.search({ province: '' }, 10000), [])
  const provinces = useMemo(
    () => [...new Set(addressRows.map((item) => item.province))].sort((a, b) => a.localeCompare(b, 'th')),
    [addressRows]
  )
  const districts = useMemo(
    () => [...new Set(addressRows.filter((item) => item.province === customerProfile.province).map((item) => item.city))].sort((a, b) => a.localeCompare(b, 'th')),
    [addressRows, customerProfile.province]
  )
  const subdistricts = useMemo(
    () => [...new Set(addressRows.filter((item) => item.province === customerProfile.province && item.city === customerProfile.district).map((item) => item.tumbon))].sort((a, b) => a.localeCompare(b, 'th')),
    [addressRows, customerProfile.province, customerProfile.district]
  )
  const requiredCustomerFields = ['fullName', 'phone', 'customerType', 'houseNumber', 'province', 'district', 'subdistrict', 'postalCode']
  const completedCustomerFields = requiredCustomerFields.filter((field) =>
    String(customerProfile[field] || '').trim()
  ).length
  const profileCompletion = Math.round(
    (completedCustomerFields / requiredCustomerFields.length) * 100
  )
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
      const normalizedDisplayName = displayName.trim()
      const normalizedCustomerProfile = {
        ...customerProfile,
        fullName: customerProfile.fullName.trim(),
        phone: customerProfile.phone.trim(),
        lineId: customerProfile.lineId.trim(),
        organization: customerProfile.organization.trim(),
        houseNumber: customerProfile.houseNumber.trim(),
        buildingVillage: customerProfile.buildingVillage.trim(),
        moo: customerProfile.moo.trim(),
        soi: customerProfile.soi.trim(),
        road: customerProfile.road.trim(),
        district: customerProfile.district.trim(),
        subdistrict: customerProfile.subdistrict.trim(),
        province: customerProfile.province.trim(),
        postalCode: customerProfile.postalCode.trim(),
      }

      if (!normalizedDisplayName || !normalizedCustomerProfile.fullName || !normalizedCustomerProfile.phone) {
        throw new Error('กรุณากรอกชื่อที่แสดง ชื่อ–นามสกุล และเบอร์โทรให้ครบ')
      }

      await updateProfile(user, { displayName: normalizedDisplayName })
      setDisplayName(normalizedDisplayName)
      setCustomerProfile(saveCustomerProfile(normalizedCustomerProfile))
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
      const errorMessage = err?.message || 'ไม่สามารถบันทึกข้อมูลได้'
      setError(errorMessage)
      showErrorToast(errorMessage)
    } finally {
      setSavingProfile(false)
    }
  }

  function handlePostalCodeChange(value) {
    const postalCode = value.replace(/\D/g, '').slice(0, 5)
    const matches = postalCode.length === 5
      ? thaiAddress.search({ zipcode: postalCode }, 100)
      : []
    const provinceMatches = [...new Set(matches.map((item) => item.province))]
    const districtMatches = [...new Set(matches.map((item) => item.city))]
    const subdistrictMatches = [...new Set(matches.map((item) => item.tumbon))]

    setCustomerProfile((current) => ({
      ...current,
      postalCode,
      province: provinceMatches.length === 1 ? provinceMatches[0] : current.province,
      district: districtMatches.length === 1
        ? districtMatches[0]
        : districtMatches.includes(current.district) ? current.district : '',
      subdistrict: subdistrictMatches.length === 1
        ? subdistrictMatches[0]
        : subdistrictMatches.includes(current.subdistrict) ? current.subdistrict : '',
    }))
  }

  return (
    <div className="page app-page profile-page profile-v3-page">
      <PageHeader
        eyebrow="Account Center"
        title="Profile"
        description="จัดการข้อมูลบัญชี ข้อมูลติดต่อ และข้อมูลลูกค้าสำหรับผู้ดูแลระบบ"
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
        <StatCard
          label="Profile Completion"
          value={`${profileCompletion}%`}
          hint={profileCompletion === 100 ? 'Complete' : 'Required information'}
          tone={profileCompletion === 100 ? 'success' : 'warning'}
        />
      </section>

      <section className="profile-v3-layout">
        <div className="profile-v3-main">
          <section className="app-card">
            <SectionHeader
              title="Customer Information"
              description="ข้อมูลบัญชีและข้อมูลลูกค้าสำหรับการดูแล ติดต่อกลับ และแสดงในระบบ Admin"
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
                Account Organization
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
              <label>
                ชื่อ–นามสกุล <span className="profile-required">*</span>
                <input
                  value={customerProfile.fullName}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, fullName: e.target.value })}
                  placeholder="ชื่อและนามสกุลจริง"
                  autoComplete="name"
                />
              </label>
              <label>
                เบอร์โทรศัพท์ <span className="profile-required">*</span>
                <input
                  value={customerProfile.phone}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, phone: e.target.value })}
                  placeholder="08x-xxx-xxxx"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </label>
              <label>
                LINE ID
                <input
                  value={customerProfile.lineId}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, lineId: e.target.value })}
                  placeholder="LINE ID สำหรับติดต่อ"
                />
              </label>
              <label>
                ประเภทลูกค้า <span className="profile-required">*</span>
                <UnifiedSelect
                  value={customerProfile.customerType}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, customerType: e.target.value })}
                  aria-label="ประเภทลูกค้า"
                >
                  <option value="individual">บุคคลทั่วไป</option>
                  <option value="business">บริษัท / ธุรกิจ</option>
                  <option value="government">หน่วยงานราชการ</option>
                  <option value="education">สถานศึกษา</option>
                </UnifiedSelect>
              </label>
              <label>
                บริษัท / หน่วยงาน
                <input
                  value={customerProfile.organization}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, organization: e.target.value })}
                  placeholder="ชื่อบริษัทหรือหน่วยงาน"
                  autoComplete="organization"
                />
              </label>
              <label>
                บ้านเลขที่ <span className="profile-required">*</span>
                <input
                  value={customerProfile.houseNumber}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, houseNumber: e.target.value })}
                  placeholder="เช่น 123/45"
                  autoComplete="address-line1"
                />
              </label>
              <label>
                หมู่บ้าน / อาคาร
                <input
                  value={customerProfile.buildingVillage}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, buildingVillage: e.target.value })}
                  placeholder="ชื่อหมู่บ้านหรืออาคาร"
                  autoComplete="address-line2"
                />
              </label>
              <label>
                หมู่ที่
                <input
                  value={customerProfile.moo}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, moo: e.target.value })}
                  placeholder="เช่น 5"
                />
              </label>
              <label>
                ซอย
                <input
                  value={customerProfile.soi}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, soi: e.target.value })}
                  placeholder="ชื่อซอย"
                />
              </label>
              <label>
                ถนน
                <input
                  value={customerProfile.road}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, road: e.target.value })}
                  placeholder="ชื่อถนน"
                />
              </label>
              <label>
                จังหวัด <span className="profile-required">*</span>
                <UnifiedSelect
                  value={customerProfile.province}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, province: e.target.value, district: '', subdistrict: '' })}
                  aria-label="จังหวัด"
                >
                  <option value="">เลือกจังหวัด</option>
                  {provinces.map((province) => <option key={province} value={province}>{province}</option>)}
                </UnifiedSelect>
              </label>
              <label>
                อำเภอ / เขต <span className="profile-required">*</span>
                <UnifiedSelect
                  value={customerProfile.district}
                  onChange={(e) => setCustomerProfile({ ...customerProfile, district: e.target.value, subdistrict: '' })}
                  disabled={!customerProfile.province}
                  aria-label="อำเภอหรือเขต"
                >
                  <option value="">เลือกอำเภอ / เขต</option>
                  {districts.map((district) => <option key={district} value={district}>{district}</option>)}
                </UnifiedSelect>
              </label>
              <label>
                ตำบล / แขวง <span className="profile-required">*</span>
                <UnifiedSelect
                  value={customerProfile.subdistrict}
                  onChange={(e) => {
                    const subdistrict = e.target.value
                    const match = addressRows.find((item) => item.province === customerProfile.province && item.city === customerProfile.district && item.tumbon === subdistrict)
                    setCustomerProfile({ ...customerProfile, subdistrict, postalCode: match ? String(match.zipcode) : customerProfile.postalCode })
                  }}
                  disabled={!customerProfile.district}
                  aria-label="ตำบลหรือแขวง"
                >
                  <option value="">เลือกตำบล / แขวง</option>
                  {subdistricts.map((subdistrict) => <option key={subdistrict} value={subdistrict}>{subdistrict}</option>)}
                </UnifiedSelect>
              </label>
              <label>
                รหัสไปรษณีย์ <span className="profile-required">*</span>
                <input
                  value={customerProfile.postalCode}
                  onChange={(e) => handlePostalCodeChange(e.target.value)}
                  placeholder="รหัสไปรษณีย์ 5 หลัก"
                  inputMode="numeric"
                  maxLength={5}
                  autoComplete="postal-code"
                />
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
          <section className="app-card profile-v3-admin-card">
            <SectionHeader
              title="Admin Data Status"
              description="สถานะข้อมูลสำหรับผู้ดูแลระบบ"
            />
            <div className="profile-v3-completion">
              <div>
                <strong>{profileCompletion}%</strong>
                <span>{completedCustomerFields}/{requiredCustomerFields.length} รายการสำคัญ</span>
              </div>
              <progress max="100" value={profileCompletion}>{profileCompletion}%</progress>
            </div>
            <StatusBadge status="warning" label="Saved on this device" />
            <p className="profile-v3-admin-note">
              ข้อมูลถูกเก็บเป็นฉบับร่างในอุปกรณ์นี้ และจัดรูปแบบพร้อมเชื่อมส่งไป Admin เมื่อเปิดใช้งานฐานข้อมูลอีกครั้ง
            </p>
          </section>
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
