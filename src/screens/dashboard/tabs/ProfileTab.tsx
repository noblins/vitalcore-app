import { useState } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { calcMacroTargets } from '../../../utils/calculations'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import JournalModal from '../modals/JournalModal'
import PaymentModal from '../modals/PaymentModal'
import MealSuggestModal from '../modals/MealSuggestModal'
import type { DashboardHook } from '../../../hooks/useDashboardData'

export default function ProfileTab({ data }: { data: DashboardHook }) {
  const { profile, logout } = useAuth()
  const [showJournal, setShowJournal] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [suggestMeal, setSuggestMeal] = useState<{ type: string; label: string; cal: number } | null>(null)
  const isPremium = profile?.subscription_plan === 'premium'

  const targets = profile?.tdee
    ? calcMacroTargets(profile.tdee, profile.weight_kg ?? 70, profile.goal ?? 'maintain')
    : null

  const GOAL_LABELS: Record<string, { label: string; explain: string }> = {
    lose:     { label: 'Perte de poids',  explain: `TDEE (${profile?.tdee ?? 0}) − 500 kcal de déficit` },
    gain:     { label: 'Prise de masse',  explain: `TDEE (${profile?.tdee ?? 0}) + 300 kcal de surplus` },
    maintain: { label: 'Maintien',        explain: `Égal au TDEE (${profile?.tdee ?? 0} kcal)` },
    health:   { label: 'Santé générale',  explain: `Basé sur le TDEE (${profile?.tdee ?? 0} kcal)` },
  }

  const goalInfo = GOAL_LABELS[profile?.goal ?? '']

  const MEAL_SPLIT = [
    { name: 'Petit-déjeuner', type: 'breakfast', pct: 0.25, emoji: '🌅' },
    { name: 'Déjeuner',       type: 'lunch',     pct: 0.35, emoji: '☀️' },
    { name: 'Collation',      type: 'snack',     pct: 0.10, emoji: '🍎' },
    { name: 'Dîner',          type: 'dinner',    pct: 0.30, emoji: '🌙' },
  ]

  return (
    <div className="p-4">
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 -mx-4 -mt-4 mb-4">
        <h1 className="text-xl font-bold">Profil</h1>
      </div>

      {/* Profile header */}
      <Card gradient>
        <p className="text-lg font-bold mb-0.5">{profile?.full_name || 'Utilisateur'}</p>
        <p className="text-sm opacity-80 mb-3">{profile?.email}</p>
        <span className="bg-white/20 text-white text-xs font-bold px-2 py-1 rounded">
          {isPremium ? '⭐ Premium' : 'Gratuit'}
        </span>
      </Card>

      {/* Stats */}
      <Card>
        <p className="text-sm font-semibold text-slate-700 mb-3">Statistiques</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Poids actuel', value: `${profile?.weight_kg ?? '–'} kg` },
            { label: 'Poids cible', value: `${profile?.target_weight_kg ?? '–'} kg` },
            { label: 'Taille', value: `${profile?.height_cm ?? '–'} cm` },
            { label: 'Âge', value: `${profile?.age ?? '–'} ans` },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-primary">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Plan nutritionnel */}
      {targets && (
        <Card>
          <p className="text-sm font-semibold text-slate-700 mb-4">🎯 Mon plan nutritionnel</p>

          {/* Calorie target */}
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl p-4 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-3xl font-bold text-slate-800">{targets.targetCal}
                  <span className="text-base font-normal text-slate-500"> kcal/jour</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">{goalInfo?.label}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">TDEE</p>
                <p className="text-base font-bold text-slate-600">{profile?.tdee}</p>
              </div>
            </div>
            {goalInfo && (
              <p className="text-xs text-slate-400 mt-2 border-t border-slate-200 pt-2">{goalInfo.explain}</p>
            )}
          </div>

          {/* Macro targets */}
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Répartition macros</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Protéines', val: targets.proteinG, kcal: targets.proteinG * 4, color: 'text-blue-500', bg: 'bg-blue-50', dot: 'bg-blue-400' },
              { label: 'Glucides',  val: targets.carbsG,  kcal: targets.carbsG * 4,  color: 'text-amber-500', bg: 'bg-amber-50', dot: 'bg-amber-400' },
              { label: 'Graisses', val: targets.fatG,   kcal: targets.fatG * 9,   color: 'text-pink-500', bg: 'bg-pink-50', dot: 'bg-pink-400' },
            ].map(m => {
              const pct = Math.round((m.kcal / targets.targetCal) * 100)
              return (
                <div key={m.label} className={`${m.bg} rounded-xl p-3 text-center`}>
                  <p className={`text-xl font-bold ${m.color}`}>{m.val}g</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{m.label}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{pct}% · {m.kcal} kcal</p>
                </div>
              )
            })}
          </div>

          {/* Meal distribution */}
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Répartition par repas — cliquez pour des idées ✨</p>
          <div className="flex flex-col gap-2">
            {MEAL_SPLIT.map(m => {
              const cal = Math.round(targets.targetCal * m.pct)
              return (
                <button
                  key={m.name}
                  onClick={() => setSuggestMeal({ type: m.type, label: m.name, cal })}
                  className="flex items-center justify-between bg-slate-50 hover:bg-primary/5 active:bg-primary/10 rounded-xl px-3 py-2.5 transition-colors w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <span>{m.emoji}</span>
                    <span className="text-sm font-semibold text-slate-700">{m.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary">~{cal} kcal</span>
                    <span className="text-xs text-slate-400">({m.pct * 100}%)</span>
                    <span className="text-slate-300 text-xs">›</span>
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <Button fullWidth onClick={() => setShowJournal(true)}>📔 Journal</Button>
        <Button fullWidth variant="secondary" onClick={() => setShowPayment(true)}>💳 Abonnement</Button>
        <Button fullWidth variant="ghost" onClick={logout}>Déconnexion</Button>
      </div>

      {showJournal && <JournalModal onClose={() => setShowJournal(false)} />}
      {showPayment && <PaymentModal onClose={() => setShowPayment(false)} />}
      {suggestMeal && (
        <MealSuggestModal
          mealType={suggestMeal.type}
          mealLabel={suggestMeal.label}
          targetCal={suggestMeal.cal}
          onClose={() => setSuggestMeal(null)}
          onAdded={() => data.reload()}
        />
      )}
    </div>
  )
}
