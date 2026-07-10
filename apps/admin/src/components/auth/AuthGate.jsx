import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firebaseConfigError } from '../../services/firebase'
import LoginPage from '../../pages/LoginPage'
import LoadingState from '../common/LoadingState'

function AuthGate({ children, getAdminMe, onReady }) {
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [adminUser, setAdminUser] = useState(null)
  const [checking, setChecking] = useState(Boolean(auth))
  const [error, setError] = useState(firebaseConfigError || '')

  useEffect(() => {
    if (!auth) {
      onReady?.(null)
      setChecking(false)
      return undefined
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      setAdminUser(null)
      setError('')

      if (!user) {
        onReady?.(null)
        setChecking(false)
        return
      }

      try {
        setChecking(true)

        const me = await getAdminMe()
        const role = me?.role

        if (role !== 'admin' && role !== 'super_admin') {
          await auth.signOut()

          setError(
            'บัญชีนี้ไม่มีสิทธิ์เข้า dotWatch Admin กรุณาใช้บัญชี Admin หรือ Super Admin'
          )
          onReady?.(null)
          setChecking(false)
          return
        }

        setAdminUser(me)
        onReady?.(me)
      } catch (fetchError) {
        console.error(fetchError)
        setError(fetchError.message || 'ไม่สามารถตรวจสอบสิทธิ์ Admin ได้')
        onReady?.(null)
      } finally {
        setChecking(false)
      }
    })

    return unsubscribe
  }, [getAdminMe, onReady])

  if (checking) {
    return (
      <div className="auth-screen">
        <LoadingState title="Checking admin access..." />
      </div>
    )
  }

  if (!firebaseUser || !adminUser) {
    return <LoginPage error={error} />
  }

  return children
}

export default AuthGate
