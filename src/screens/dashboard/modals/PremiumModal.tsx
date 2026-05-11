import { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { callEdge } from '../../../lib/supabase'
import Button from '../../../components/ui/Button'

const FEATURES = [
  'Repas illimités',
  'Scan IA des repas',
  'Jeûne intermittent',
  'Photos de progression',
  'Suivi GLP-1',
  'Journal premium',
]

export default function PremiumModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, loading])

  const upgrade = async () => {
    if (!user || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await callEdge('create-checkout', {})
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Erreur de paiement. Réessayez.')
      }
    } catch {
      setError('Erreur de connexion. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-modal-title"
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl w-full max-w-[430px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" aria-hidden />
        <h2 id="premium-modal-title" className="text-xl font-bold text-slate-800 mb-1">✨ Hirow Premium</h2>
        <p className="text-sm text-slate-500 mb-4">Déverrouillez toutes les fonctionnalités avancées.</p>
        <div className="text-4xl font-bold text-primary mb-4">
          9.99€<span className="text-base font-normal text-slate-400">/mois</span>
        </div>
        <ul className="text-sm text-slate-600 mb-5 space-y-2">
          {FEATURES.map(f => (
            <li key={f} className="flex items-center gap-2">
              <span className="text-green-500 font-bold" aria-hidden>✓</span> {f}
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">{error}</p>
        )}
        <Button fullWidth onClick={upgrade} className="mb-2" disabled={loading}>
          {loading ? 'Chargement...' : 'Upgrade Maintenant'}
        </Button>
        <Button fullWidth variant="ghost" onClick={onClose} disabled={loading}>Plus tard</Button>
      </div>
    </div>
  )
}
