import { useNavigate } from 'react-router-dom'

interface ScreenHeaderProps {
  title: string
  subtitle?: string
  /** If provided, shows a back arrow that navigates to this path. */
  back?: string
  /** Slot rendered at the top-right (e.g. settings icon, badge). */
  rightSlot?: React.ReactNode
  /** Color variant — defaults to primary teal/blue gradient. */
  variant?: 'primary' | 'blue'
  className?: string
}

const VARIANTS = {
  primary: 'bg-gradient-to-br from-primary to-secondary',
  blue:    'bg-gradient-to-br from-blue-500 to-cyan-400',
}

/**
 * Common screen header that respects the iPhone notch (safe-area-inset-top).
 * Use as the first child inside an element with `min-h-dvh` (or page root).
 */
export default function ScreenHeader({
  title,
  subtitle,
  back,
  rightSlot,
  variant = 'primary',
  className = '',
}: ScreenHeaderProps) {
  const navigate = useNavigate()
  return (
    <header
      className={`${VARIANTS[variant]} text-white px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center gap-3 ${className}`}
    >
      {back && (
        <button
          type="button"
          aria-label="Retour"
          onClick={() => navigate(back)}
          className="text-white/90 text-2xl leading-none -ml-1 px-2 py-1 min-w-[44px] min-h-[44px] flex items-center justify-center active:bg-white/10 rounded-lg transition-colors"
        >
          ←
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold truncate">{title}</h1>
        {subtitle && <p className="text-xs opacity-80 truncate">{subtitle}</p>}
      </div>
      {rightSlot}
    </header>
  )
}
