import { useLocation, useNavigate } from 'react-router-dom'

const TABS = [
  { path: '/dashboard',           exact: true,  label: 'Accueil',    icon: '🏠' },
  { path: '/dashboard/nutrition',               label: 'Nutrition',  icon: '🍎' },
  { path: '/dashboard/calendar',                label: 'Calendrier', icon: '📅' },
  { path: '/dashboard/coach',                   label: 'Coach',      icon: '🤖' },
  { path: '/dashboard/profile',                 label: 'Profil',     icon: '👤' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav
      role="navigation"
      aria-label="Navigation principale"
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-slate-200 flex justify-around z-40 safe-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.04)]"
    >
      {TABS.map(tab => {
        const isActive = tab.exact
          ? location.pathname === '/dashboard' || location.pathname === '/dashboard/'
          : location.pathname.startsWith(tab.path)
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-[56px] text-[11px] transition-colors active:bg-slate-50 ${
              isActive ? 'text-primary font-semibold' : 'text-slate-400'
            }`}
          >
            <span aria-hidden className="text-xl leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
