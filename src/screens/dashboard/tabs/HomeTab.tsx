import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { sb } from '../../../lib/supabase'
import { todayISO } from '../../../utils/calculations'
import Card from '../../../components/ui/Card'
import PremiumModal from '../modals/PremiumModal'
import type { DashboardHook } from '../../../hooks/useDashboardData'

const WATER_AMOUNTS = [200, 330, 500, 750]

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  emoji, title, main, sub, pct, color, onClick,
}: {
  emoji: string; title: string; main: string; sub: string
  pct?: number; color: string; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-left w-full active:scale-95 transition-transform"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xl">{emoji}</span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${color}`}>{sub}</span>
      </div>
      <p className="text-xl font-bold text-slate-800 leading-tight">{main}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{title}</p>
      {pct !== undefined && (
        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(pct, 100)}%`, background: 'linear-gradient(to right, #4fd1c5, #3b82f6)' }}
          />
        </div>
      )}
    </button>
  )
}

export default function HomeTab({ data }: { data: DashboardHook }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [showPremium, setShowPremium] = useState(false)
  const { meals, weightLogs, todayWater, weekWater, weekMeals, activeMed, loading, reload } = data

  // ── Today ──────────────────────────────────────────────────────────────────
  const todayCal   = meals.reduce((s, m) => s + (m.calories  || 0), 0)
  const todayProt  = meals.reduce((s, m) => s + (m.protein_g || 0), 0)
  const todayCarbs = meals.reduce((s, m) => s + (m.carbs_g   || 0), 0)
  const todayFat   = meals.reduce((s, m) => s + (m.fat_g     || 0), 0)
  const isPremium  = profile?.subscription_plan === 'premium'
  const tdee       = profile?.tdee ?? 0
  const calPct     = tdee > 0 ? Math.min((todayCal / tdee) * 100, 100) : 0

  // ── Water ──────────────────────────────────────────────────────────────────
  const waterGoal     = Math.round((profile?.weight_kg ?? 70) * 35)
  const waterPct      = Math.min(todayWater / waterGoal, 1)
  const waterLitres   = (todayWater / 1000).toFixed(1)
  const waterGoalL    = (waterGoal / 1000).toFixed(1)

  // ── Weight ─────────────────────────────────────────────────────────────────
  const currentWeight = weightLogs[0]?.weight_kg ?? profile?.weight_kg ?? 0
  const targetWeight  = profile?.target_weight_kg ?? 0
  const startWeight   = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight_kg : currentWeight
  const weightPct     = startWeight !== targetWeight
    ? Math.min(Math.max((startWeight - currentWeight) / (startWeight - targetWeight) * 100, 0), 100)
    : 100
  const weightTrend   = weightLogs.length >= 2
    ? weightLogs[0].weight_kg - (weightLogs.find(l => {
        const d = new Date(l.logged_date)
        return (Date.now() - d.getTime()) >= 5 * 86400000
      })?.weight_kg ?? weightLogs[weightLogs.length - 1].weight_kg)
    : 0

  // ── KPI : eau 7j ───────────────────────────────────────────────────────────
  const avgWater7  = weekWater.length > 0
    ? weekWater.reduce((s, w) => s + w.amount_ml, 0) / 7
    : 0
  const waterAdh   = waterGoal > 0 ? Math.round(avgWater7 / waterGoal * 100) : 0

  // ── KPI : nutrition 7j ─────────────────────────────────────────────────────
  const daysWithFood = new Set(weekMeals.map(m => m.meal_date)).size
  const avgCal7      = weekMeals.length > 0
    ? Math.round(weekMeals.reduce((s, m) => s + (m.calories || 0), 0) / Math.max(daysWithFood, 1))
    : 0

  // ── KPI : GLP-1 ────────────────────────────────────────────────────────────
  const injDue      = activeMed && activeMed.next_injection <= todayISO()
  const daysUntilInj = activeMed?.next_injection
    ? Math.floor((new Date(activeMed.next_injection + 'T12:00:00').getTime() - Date.now()) / 86400000)
    : null

  const goalLabel = profile?.goal === 'lose' ? '↓ Perte' : profile?.goal === 'gain' ? '↑ Muscle' : '→ Maintien'

  const addWater = async (ml: number) => {
    if (!user) return
    const today = todayISO()
    const { data: existing } = await sb.from('water_logs').select('id, amount_ml')
      .eq('user_id', user.id).eq('logged_date', today).maybeSingle()
    if (existing) {
      await sb.from('water_logs').update({ amount_ml: existing.amount_ml + ml }).eq('id', existing.id)
    } else {
      await sb.from('water_logs').insert({ user_id: user.id, amount_ml: ml, logged_date: today })
    }
    await reload()
  }

  if (loading) return (
    <div className="p-4">
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 -mx-4 -mt-4 mb-4">
        <h1 className="text-xl font-bold">VitalCore</h1>
        <p className="text-sm opacity-80">Votre assistant santé</p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="bg-white rounded-2xl p-4 h-24 animate-pulse border border-slate-100">
            <div className="h-3 bg-slate-100 rounded w-2/3 mb-2" />
            <div className="h-6 bg-slate-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="p-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 -mx-4 -mt-4 mb-4">
        <h1 className="text-xl font-bold">VitalCore</h1>
        <p className="text-sm opacity-80">Votre assistant santé</p>
      </div>

      <p className="text-lg font-semibold text-slate-800 mb-4">
        Bonjour {profile?.full_name?.split(' ')[0] || 'Ami'} 👋
      </p>

      {!isPremium && (
        <div
          className="bg-gradient-to-r from-amber-400 to-amber-500 text-white p-4 rounded-xl mb-4 text-center font-semibold cursor-pointer active:scale-95 transition-transform"
          onClick={() => setShowPremium(true)}
        >
          ✨ Upgrade à Premium — 9.99€/mois
        </div>
      )}

      {/* ── KPI GLOBAUX ─────────────────────────────────────────────────────── */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Progression globale</p>
      <div className="grid grid-cols-2 gap-3 mb-4">

        {/* Poids */}
        <KpiCard
          emoji="⚖️"
          title="Progression poids"
          main={`${weightPct.toFixed(0)}%`}
          sub={weightTrend === 0 ? 'Stable' : weightTrend < 0 ? `${weightTrend.toFixed(1)}kg` : `+${weightTrend.toFixed(1)}kg`}
          pct={weightPct}
          color={weightTrend < -0.1 ? 'bg-green-100 text-green-700' : weightTrend > 0.1 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}
          onClick={() => navigate('/dashboard/weight')}
        />

        {/* Eau 7j */}
        <KpiCard
          emoji="💧"
          title="Hydratation moy. 7j"
          main={`${(avgWater7 / 1000).toFixed(1)}L`}
          sub={`${waterAdh}% objectif`}
          pct={waterAdh}
          color={waterAdh >= 80 ? 'bg-blue-100 text-blue-700' : waterAdh >= 50 ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'}
        />

        {/* Nutrition 7j */}
        <KpiCard
          emoji="🍽️"
          title="Calories moy. 7j"
          main={avgCal7 > 0 ? `${avgCal7} kcal` : '— kcal'}
          sub={`${daysWithFood}/7 jours`}
          pct={tdee > 0 && avgCal7 > 0 ? Math.min(avgCal7 / tdee * 100, 100) : 0}
          color={daysWithFood >= 5 ? 'bg-green-100 text-green-700' : daysWithFood >= 3 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}
          onClick={() => navigate('/dashboard/nutrition')}
        />

        {/* GLP-1 */}
        {activeMed ? (
          <KpiCard
            emoji="💉"
            title={activeMed.medication_name}
            main={injDue ? 'Aujourd\'hui !' : daysUntilInj !== null ? `J-${daysUntilInj}` : '—'}
            sub={injDue ? '⚠️ Due' : 'Prochaine inj.'}
            color={injDue ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-purple-100 text-purple-700'}
            onClick={() => navigate('/dashboard/glp1')}
          />
        ) : (
          <KpiCard
            emoji="📅"
            title="Calendrier"
            main={`${daysWithFood}/7`}
            sub="jours tracés"
            pct={daysWithFood / 7 * 100}
            color="bg-slate-100 text-slate-500"
            onClick={() => navigate('/dashboard/calendar')}
          />
        )}
      </div>

      {/* ── AUJOURD'HUI ──────────────────────────────────────────────────────── */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Aujourd'hui</p>

      {/* TDEE + Calories */}
      <Card gradient>
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-xs opacity-80 uppercase tracking-wide">TDEE</p>
            <p className="text-3xl font-bold">{tdee}</p>
            <p className="text-xs opacity-70">kcal objectif</p>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-80">Objectif</p>
            <p className="text-base font-semibold">{goalLabel}</p>
          </div>
        </div>
        <div className="flex justify-between items-center mb-1.5">
          <p className="text-sm opacity-90">Consommé : <strong>{todayCal} kcal</strong></p>
          <p className="text-sm opacity-90">{calPct.toFixed(0)}%</p>
        </div>
        <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${calPct}%` }} />
        </div>
      </Card>

      {/* Macros */}
      <Card>
        <p className="text-sm font-semibold text-slate-700 mb-3">Macronutriments</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Protéines (g)', value: todayProt.toFixed(0) },
            { label: 'Glucides (g)',  value: todayCarbs.toFixed(0) },
            { label: 'Graisses (g)', value: todayFat.toFixed(0) },
          ].map(m => (
            <div key={m.label} className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-secondary">{m.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── HYDRATATION ─────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">💧</span>
            <p className="text-sm font-semibold text-slate-700">Hydratation</p>
          </div>
          <p className="text-sm font-bold text-blue-600">{waterLitres}L / {waterGoalL}L</p>
        </div>

        <div className="relative h-5 bg-blue-50 rounded-full overflow-hidden mb-3 border border-blue-100">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${waterPct * 100}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-bold text-blue-800 drop-shadow-sm">
              {Math.round(waterPct * 100)}%
            </span>
          </div>
        </div>

        <div className="flex justify-center gap-1.5 mb-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className={`text-base transition-all ${
              i < Math.round(waterPct * 8) ? 'opacity-100' : 'opacity-20'
            }`}>💧</span>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {WATER_AMOUNTS.map(ml => (
            <button
              key={ml}
              onClick={() => addWater(ml)}
              className="py-2 text-xs bg-blue-50 text-blue-700 font-semibold rounded-lg hover:bg-blue-100 active:scale-95 transition-all border border-blue-100"
            >
              +{ml}ml
            </button>
          ))}
        </div>

        {todayWater > 0 && (
          <button
            className="mt-2 text-xs text-slate-400 hover:text-red-400 transition-colors w-full text-center"
            onClick={async () => {
              if (!user) return
              await sb.from('water_logs').update({ amount_ml: 0 })
                .eq('user_id', user.id).eq('logged_date', todayISO())
              await reload()
            }}
          >
            Réinitialiser
          </button>
        )}
      </Card>

      {/* ── NAVIGATION FEATURES ─────────────────────────────────────────────── */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Modules</p>
      <div className="grid grid-cols-2 gap-3">
        <Card feature onClick={() => navigate('/dashboard/weight')}>
          <div className="flex justify-between items-start mb-1">
            <h3 className="font-bold text-blue-800">⚖️ Poids</h3>
            <span className="text-xs text-slate-400">{currentWeight}kg</span>
          </div>
          <p className="text-sm text-blue-600">Objectif : {targetWeight}kg</p>
        </Card>

        <div className="relative">
          {injDue && (
            <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full z-10 animate-pulse" />
          )}
          <Card feature onClick={() => navigate('/dashboard/glp1')}>
            <h3 className="font-bold text-blue-800 mb-1">💉 GLP-1</h3>
            <p className="text-sm text-blue-600">
              {injDue ? '⚠️ Injection due !' : activeMed ? activeMed.medication_name : 'Suivi injections'}
            </p>
          </Card>
        </div>

        <Card feature onClick={() => navigate('/dashboard/photos')}>
          <h3 className="font-bold text-blue-800 mb-1">📸 Photos</h3>
          <p className="text-sm text-blue-600">Suivi de progression</p>
        </Card>

        <Card feature onClick={() => navigate('/dashboard/fasting')}>
          <h3 className="font-bold text-blue-800 mb-1">⏱️ Jeûne</h3>
          <p className="text-sm text-blue-600">Jeûne intermittent</p>
        </Card>
      </div>

      {showPremium && <PremiumModal onClose={() => setShowPremium(false)} />}
    </div>
  )
}
