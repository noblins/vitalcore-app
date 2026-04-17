import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useDashboardData } from '../../hooks/useDashboardData'
import BottomNav from '../../components/layout/BottomNav'
import HomeTab from './tabs/HomeTab'
import NutritionTab from './tabs/NutritionTab'
import CoachTab from './tabs/CoachTab'
import ProfileTab from './tabs/ProfileTab'
import CalendarTab from './tabs/CalendarTab'
import FastingScreen from './features/FastingScreen'
import PhotosScreen from './features/PhotosScreen'
import GLP1Screen from './features/GLP1Screen'
import WeightScreen from './features/WeightScreen'
import SuggestionsScreen from './features/SuggestionsScreen'

const FEATURE_PATHS = ['/dashboard/fasting', '/dashboard/photos', '/dashboard/glp1', '/dashboard/weight', '/dashboard/suggestions']

export default function DashboardScreen() {
  const { user } = useAuth()
  const location = useLocation()
  const data = useDashboardData(user?.id)
  const isFeature = FEATURE_PATHS.some(p => location.pathname.startsWith(p))

  useEffect(() => { data.reload() }, [user?.id]) // eslint-disable-line

  return (
    <div className="max-w-[430px] mx-auto bg-slate-50 min-h-screen relative">
      <div className={isFeature ? '' : 'pb-[72px]'}>
        <Routes>
          <Route index element={<HomeTab data={data} />} />
          <Route path="nutrition" element={<NutritionTab data={data} />} />
          <Route path="calendar" element={<CalendarTab data={data} />} />
          <Route path="coach" element={<CoachTab data={data} />} />
          <Route path="profile" element={<ProfileTab data={data} />} />
          <Route path="fasting" element={<FastingScreen data={data} />} />
          <Route path="photos" element={<PhotosScreen data={data} />} />
          <Route path="glp1" element={<GLP1Screen data={data} />} />
          <Route path="weight" element={<WeightScreen data={data} />} />
          <Route path="suggestions" element={<SuggestionsScreen data={data} />} />
        </Routes>
      </div>
      {!isFeature && <BottomNav />}
    </div>
  )
}
