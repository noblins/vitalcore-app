import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import SplashScreen from './screens/SplashScreen'
import WelcomeScreen from './screens/WelcomeScreen'
import LoginScreen from './screens/auth/LoginScreen'
import SignupScreen from './screens/auth/SignupScreen'
import OnboardingScreen from './screens/onboarding/OnboardingScreen'
import DashboardScreen from './screens/dashboard/DashboardScreen'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary to-secondary">
      <span className="text-white text-2xl font-bold">VitalCore</span>
    </div>
  )
  return user ? <>{children}</> : <Navigate to="/welcome" replace />
}

function OnboardedRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
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
