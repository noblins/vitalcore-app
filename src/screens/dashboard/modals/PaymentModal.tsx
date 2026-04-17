import { useAuth } from '../../../contexts/AuthContext'
import { getFreshToken, EDGE_URL } from '../../../lib/supabase'
import Button from '../../../components/ui/Button'

export default function PaymentModal({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuth()
  const isPremium = profile?.subscription_plan === 'premium'

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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-[430px] p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">💳 Abonnement</h2>
        <p className="text-sm text-slate-600 mb-1">
          Plan actuel: <strong>{isPremium ? '⭐ Premium' : 'Gratuit'}</strong>
        </p>
        {!isPremium && (
          <>
            <div className="text-3xl font-bold text-primary my-4">
              9.99€<span className="text-base font-normal text-slate-400">/mois</span>
            </div>
            <Button fullWidth onClick={upgrade} className="mb-2">Upgrade à Premium</Button>
          </>
        )}
        <Button fullWidth variant="ghost" onClick={onClose}>Fermer</Button>
      </div>
    </div>
  )
}
