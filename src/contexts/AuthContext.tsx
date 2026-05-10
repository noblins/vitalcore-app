import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { sb } from '../lib/supabase'
import type { Profile } from '../types'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  authError: string | null
  login: (email: string, password: string) => Promise<{ error?: string }>
  signup: (email: string, password: string) => Promise<{ error?: string; success?: string }>
  logout: () => Promise<void>
  refreshProfile: (userId?: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Reject a promise (or thenable) after `ms` milliseconds. */
function withTimeout<T>(p: PromiseLike<T>, ms: number, label = 'request'): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout`)), ms),
    ),
  ])
}

/** Fetch profile with timeout + retries. Returns null if not found, throws on persistent network error. */
async function fetchProfile(userId: string, opts: { retries?: number; timeoutMs?: number } = {}): Promise<Profile | null> {
  const retries = opts.retries ?? 2
  const timeoutMs = opts.timeoutMs ?? 4000

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(
        sb.from('profiles').select('*').eq('id', userId).maybeSingle(),
        timeoutMs,
        'fetchProfile',
      )
      const { data, error } = result as { data: Profile | null; error: unknown }
      if (error) {
        if (attempt === retries) throw error
      } else {
        return data ?? null
      }
    } catch (err) {
      if (attempt === retries) throw err
      // Exponential backoff : 250ms → 500ms → 1000ms
      await new Promise(r => setTimeout(r, 250 * Math.pow(2, attempt)))
    }
  }
  return null
}

const networkError = (msg: string) =>
  msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('load') || msg.includes('timeout')
    ? 'Connexion lente ou indisponible. Vérifiez votre connexion et réessayez.'
    : msg

// ── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    let initialDone = false

    const markDone = () => {
      if (!initialDone) { initialDone = true; if (mounted) setLoading(false) }
    }

    // Hard fallback : never block the splash screen for more than 6 seconds
    const timeout = setTimeout(markDone, 6000)

    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (event === 'TOKEN_REFRESHED') return

      if (session?.user) {
        // Set user first so ProtectedRoute lets us through
        setUser(session.user)
        try {
          const data = await fetchProfile(session.user.id)
          if (mounted) {
            setProfile(data)
            setAuthError(null)
          }
        } catch (err) {
          if (mounted) {
            // Don't block — let user navigate, but log the issue
            console.warn('Profile fetch failed:', err)
            setAuthError('Profil temporairement indisponible. Réessayez de vous reconnecter.')
          }
        }
      } else {
        if (mounted) { setUser(null); setProfile(null); setAuthError(null) }
      }

      // INITIAL_SESSION fires synchronously from localStorage — marks auth ready
      if (event === 'INITIAL_SESSION') markDone()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const login = useCallback(async (rawEmail: string, rawPassword: string): Promise<{ error?: string }> => {
    // Trim — mobile autocorrect / paste often adds whitespace
    const email = rawEmail.trim().toLowerCase()
    const password = rawPassword
    setAuthError(null)

    if (!email || !password) {
      return { error: 'Email et mot de passe requis.' }
    }

    try {
      const { data, error } = await withTimeout(
        sb.auth.signInWithPassword({ email, password }),
        15000,
        'signin',
      )
      if (error) {
        if (error.message === 'Invalid login credentials') {
          return { error: 'Email ou mot de passe incorrect.' }
        }
        return { error: networkError(error.message) }
      }
      if (data.user) {
        // onAuthStateChange will fire and load the profile.
        // We also fetch eagerly so login() resolves with profile available.
        try {
          const profileData = await fetchProfile(data.user.id, { timeoutMs: 5000, retries: 1 })
          setUser(data.user)
          setProfile(profileData)
        } catch {
          // Even if profile fails, we have a session — don't block login
          setUser(data.user)
        }
      }
      return {}
    } catch (err: any) {
      return { error: networkError(err?.message ?? 'Erreur de connexion') }
    }
  }, [])

  const signup = useCallback(async (rawEmail: string, rawPassword: string): Promise<{ error?: string; success?: string }> => {
    const email = rawEmail.trim().toLowerCase()
    const password = rawPassword
    setAuthError(null)

    if (!email || !password) {
      return { error: 'Email et mot de passe requis.' }
    }
    if (password.length < 8) {
      return { error: 'Mot de passe trop court (min 8 caractères).' }
    }

    try {
      // Use the actual origin so emailRedirectTo works in dev/staging/prod
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined
      const { data: signUpData, error: signUpError } = await withTimeout(
        sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }),
        15000,
        'signup',
      )
      if (signUpError) return { error: networkError(signUpError.message) }
      if (signUpData.user?.identities?.length === 0) {
        return { error: 'Un compte existe déjà avec cet email.' }
      }

      // If email confirmation is required, signIn will fail until confirmed
      const { data: signInData, error: signInError } = await withTimeout(
        sb.auth.signInWithPassword({ email, password }),
        15000,
        'signin',
      )
      if (signInError) {
        return { success: 'Inscription réussie ! Vérifiez votre email pour confirmer votre compte, puis connectez-vous.' }
      }
      if (signInData.user) {
        // The on_auth_user_created trigger creates the profile.
        // Fetch with retries to handle the race.
        try {
          const profileData = await fetchProfile(signInData.user.id, { timeoutMs: 5000, retries: 3 })
          setUser(signInData.user)
          setProfile(profileData)
        } catch {
          setUser(signInData.user)
        }
      }
      return {}
    } catch (err: any) {
      return { error: networkError(err?.message ?? 'Impossible de créer le compte') }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      // Local scope only — global would force logout on all devices
      await sb.auth.signOut()
    } catch (err) {
      console.warn('signOut error:', err)
    }
    setUser(null)
    setProfile(null)
    setAuthError(null)
  }, [])

  const refreshProfile = useCallback(async (userId?: string) => {
    const id = userId ?? user?.id
    if (!id) return
    try {
      const data = await fetchProfile(id)
      setProfile(data)
    } catch (err) {
      console.warn('refreshProfile failed:', err)
    }
  }, [user?.id])

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError, login, signup, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
