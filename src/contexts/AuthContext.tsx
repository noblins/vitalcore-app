import React, { createContext, useContext, useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { sb } from '../lib/supabase'
import type { Profile } from '../types'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  signup: (email: string, password: string) => Promise<{ error?: string; success?: string }>
  logout: () => Promise<void>
  refreshProfile: (userId?: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (userId: string): Promise<Profile | null> => {
    const { data } = await sb.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    return data
  }

  useEffect(() => {
    // Safety timeout — never stay on loading screen more than 6 seconds
    const timeout = setTimeout(() => setLoading(false), 6000)

    sb.auth.getSession().then(async ({ data }) => {
      try {
        if (data.session?.user) {
          setUser(data.session.user)
          await loadProfile(data.session.user.id)
        }
      } catch {
        // profile load failed, continue without it
      } finally {
        clearTimeout(timeout)
        setLoading(false)
      }
    }).catch(() => { clearTimeout(timeout); setLoading(false) })

    const { data: { subscription } } = sb.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id)
        } else {
          setUser(null)
          setProfile(null)
        }
      } catch {
        // ignore profile errors on auth change
      }
    })

    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  const networkError = (msg: string) =>
    msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('load')
      ? 'Impossible de contacter le serveur. Vérifiez votre connexion ou que le projet Supabase est actif.'
      : msg

  const login = async (email: string, password: string) => {
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) {
        const msg = error.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect.'
          : networkError(error.message)
        return { error: msg }
      }
      if (data.user) {
        setUser(data.user)
        await loadProfile(data.user.id)
      }
      return {}
    } catch (e: unknown) {
      return { error: 'Erreur de connexion. Vérifiez votre connexion internet.' }
    }
  }

  const signup = async (email: string, password: string) => {
    try {
      const { data: signUpData, error: signUpError } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: 'https://vitalcore-app.vercel.app' },
      })
      if (signUpError) return { error: networkError(signUpError.message) }
      if (!signUpData.user?.identities?.length) return { error: 'Un compte existe déjà avec cet email.' }

      const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({ email, password })
      if (signInError) {
        return { success: 'Inscription réussie ! Vérifiez votre email pour confirmer votre compte, puis connectez-vous.' }
      }
      if (signInData.user) {
        setUser(signInData.user)
        await sb.from('profiles').insert({
          id: signInData.user.id,
          email: signInData.user.email,
          full_name: '',
          subscription_plan: 'free',
        })
        await loadProfile(signInData.user.id)
      }
      return {}
    } catch (e: unknown) {
      return { error: 'Impossible de créer le compte. Vérifiez votre connexion internet.' }
    }
  }

  const logout = async () => {
    await sb.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const refreshProfile = async (userId?: string) => {
    const id = userId ?? user?.id
    if (id) await loadProfile(id)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, signup, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
