import { useLocation, useNavigate } from 'react-router-dom'

const TABS = [
  { path: '/dashboard', exact: true, label: 'Accueil', icon: '🏠' },
  { path: '/dashboard/nutrition', label: 'Nutrition', icon: '🍎' },
  { path: '/dashboard/calendar', label: 'Calendrier', icon: '📅' },
  { path: '/dashboard/coach', label: 'Coach', icon: '🤖' },
  { path: '/dashboard/profile', label: 'Profil', icon: '👤' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-slate-200 flex justify-around z-50 safe-bottom">
      {TABS.map(tab => {
        const isActive = tab.exact
          ? location.pathname === '/dashboard' || location.pathname === '/dashboard/'
          : location.pathname.startsWith(tab.path)
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-[11px] transition-colors ${
              isActive ? 'text-primary font-semibold' : 'text-slate-400'
            }`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
