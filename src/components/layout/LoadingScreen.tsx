import { useEffect, useState } from 'react'
import { useOnline } from '../../hooks/useOnline'

interface LoadingScreenProps {
  label?: string
  /** Show a "Reload" button after this many ms (default 8s). */
  stuckAfterMs?: number
}

/**
 * Splash-style loading screen that adapts when the user is stuck:
 * - shows online/offline status,
 * - offers a reload button after `stuckAfterMs`,
 * - tells the user to check their connection.
 */
export default function LoadingScreen({ label = 'Chargement...', stuckAfterMs = 8000 }: LoadingScreenProps) {
  const online = useOnline()
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setStuck(true), stuckAfterMs)
    return () => clearTimeout(t)
  }, [stuckAfterMs])

  return (
    <div className="flex flex-col items-center justify-center px-6 gap-4"
      style={{ minHeight: '100dvh', background: 'linear-gradient(to bottom right, #4fd1c5, #3b82f6)' }}>
      <span className="text-white text-3xl font-bold tracking-tight">VitalCore</span>
      <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      <span className="text-white/80 text-sm">{label}</span>

      {!online && (
        <div className="bg-white/15 border border-white/30 rounded-xl px-4 py-2 text-white text-sm">
          📡 Hors ligne — vérifiez votre connexion
        </div>
      )}

      {stuck && (
        <div className="flex flex-col items-center gap-3 mt-4 max-w-xs text-center">
          <p className="text-white/90 text-sm">
            Le chargement prend du temps. Cela peut être un problème de connexion ou de cache.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-white text-primary font-semibold px-4 py-2 rounded-lg active:scale-95 transition-transform"
          >
            Recharger l'application
          </button>
        </div>
      )}
    </div>
  )
}
