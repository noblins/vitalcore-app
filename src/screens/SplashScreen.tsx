import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function SplashScreen() {
  const { user, profile, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => {
      if (!user) navigate('/welcome', { replace: true })
      else if (!profile?.onboarding_completed && !(profile?.height_cm && profile?.weight_kg && profile?.goal)) navigate('/onboarding', { replace: true })
      else navigate('/dashboard', { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [loading, user, profile, navigate])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-primary to-secondary gap-4">
      <div className="text-6xl">💚</div>
      <div className="text-white text-3xl font-bold tracking-tight">VitalCore</div>
      <div className="text-white/70 text-sm">Chargement...</div>
    </div>
  )
}
