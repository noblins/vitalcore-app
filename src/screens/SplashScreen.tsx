import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingScreen from '../components/layout/LoadingScreen'

export default function SplashScreen() {
  const { user, profile, loading, authError } = useAuth()
  const navigate = useNavigate()
  const profileTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (loading) return

    if (!user) {
      navigate('/welcome', { replace: true })
      return
    }

    // If profile fetch errored, go to welcome — user can retry login
    if (!profile && authError) {
      navigate('/welcome', { replace: true })
      return
    }

    if (!profile) {
      // User logged in but profile not yet loaded — wait up to 6s, then go to welcome
      // (better than dashboard which would show LoadingScreen forever)
      if (!profileTimeoutRef.current) {
        profileTimeoutRef.current = setTimeout(() => {
          navigate('/welcome', { replace: true })
        }, 6000)
      }
      return
    }

    if (profileTimeoutRef.current) {
      clearTimeout(profileTimeoutRef.current)
      profileTimeoutRef.current = null
    }

    const isOnboarded = !!(profile.onboarding_completed || (profile.height_cm && profile.weight_kg && profile.goal))
    navigate(isOnboarded ? '/dashboard' : '/onboarding', { replace: true })
  }, [loading, user, profile, authError, navigate])

  useEffect(() => {
    return () => {
      if (profileTimeoutRef.current) clearTimeout(profileTimeoutRef.current)
    }
  }, [])

  return <LoadingScreen />
}
