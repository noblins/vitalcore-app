import { useAuth } from '../../../contexts/AuthContext'
import { getFreshToken, EDGE_URL } from '../../../lib/supabase'
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

  const upgrade = async () => {
    if (!user) return
    const token = await getFreshToken()
    const res = await fetch(`${EDGE_URL}/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_id: user.id, price_id: 'price_premium' }),
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-slate-800 mb-1">✨ VitalCore Premium</h2>
        <p className="text-sm text-slate-500 mb-4">Déverrouillez toutes les fonctionnalités avancées.</p>
        <div className="text-4xl font-bold text-primary mb-4">9.99€<span className="text-base font-normal text-slate-400">/mois</span></div>
        <ul className="text-sm text-slate-600 mb-5 space-y-1.5">
          {FEATURES.map(f => (
            <li key={f} className="flex items-center gap-2">
              <span className="text-green-500 font-bold">✓</span> {f}
            </li>
          ))}
        </ul>
        <Button fullWidth onClick={upgrade} className="mb-2">Upgrade Maintenant</Button>
        <Button fullWidth variant="ghost" onClick={onClose}>Plus tard</Button>
      </div>
    </div>
  )
}
