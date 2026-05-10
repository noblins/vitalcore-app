import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import LoadingScreen from './components/layout/LoadingScreen'
import SplashScreen from './screens/SplashScreen'
import WelcomeScreen from './screens/WelcomeScreen'
import LoginScreen from './screens/auth/LoginScreen'
import SignupScreen from './screens/auth/SignupScreen'
import OnboardingScreen from './screens/onboarding/OnboardingScreen'
import DashboardScreen from './screens/dashboard/DashboardScreen'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return user ? <>{children}</> : <Navigate to="/welcome" replace />
}

function OnboardedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, authError } = useAuth()
  // While loading the profile, show the loader (with stuck-detection + reload button)
  if (loading || (user && !profile && !authError)) {
    return <LoadingScreen label="Chargement du profil..." />
  }
  // If profile fetch errored persistently — let the user retry by going through login
  if (user && !profile && authError) {
    return <Navigate to="/welcome" replace />
  }
  const isOnboarded = !!(profile?.onboarding_completed || (profile?.height_cm && profile?.weight_kg && profile?.goal))
  return isOnboarded ? <>{children}</> : <Navigate to="/onboarding" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route path="/welcome" element={<WelcomeScreen />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/signup" element={<SignupScreen />} />
      <Route path="/onboarding" element={
        <ProtectedRoute><OnboardingScreen /></ProtectedRoute>
      } />
      <Route path="/dashboard/*" element={
        <ProtectedRoute>
          <OnboardedRoute>
            <DashboardScreen />
          </OnboardedRoute>
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
