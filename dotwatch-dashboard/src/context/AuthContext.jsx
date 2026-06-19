import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { listenAuthState, logout as authLogout } from '../services/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = listenAuthState(async (firebaseUser) => {
      if (firebaseUser) {
        await firebaseUser.reload()
      }

      setUser(firebaseUser)
      setAuthLoading(false)
    })

    return unsubscribe
  }, [])

  const value = useMemo(
    () => ({
      user,
      authLoading,
      isAuthenticated: Boolean(user),
      isEmailVerified: Boolean(user?.emailVerified),
      logout: authLogout,
    }),
    [user, authLoading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}