import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshUser = useCallback(async () => {
    try {
      const { user: currentUser } = await api('/auth/me')
      if (currentUser.role !== 'super_admin') {
        setUser(null)
        setError('This account is not authorized for Super Admin access.')
        return null
      }
      setUser(currentUser)
      setError('')
      return currentUser
    } catch (requestError) {
      if (requestError.message === 'Authentication required.' || requestError.message === 'Session is invalid or expired.' || requestError.message === 'Session is no longer active.') {
        setUser(null)
        setError('')
        return null
      }
      setError(requestError.message)
      throw requestError
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser().catch(() => {})
  }, [refreshUser])

  const signIn = useCallback(async (credential) => {
    const response = await api('/auth/google/super-admin', { method: 'POST', body: { credential } })
    if (response.user.role !== 'super_admin') throw new Error('This account is not authorized for Super Admin access.')
    setUser(response.user)
    setError('')
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({ user, loading, error, signIn, signOut, refreshUser }), [user, loading, error, signIn, signOut, refreshUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider.')
  return value
}
