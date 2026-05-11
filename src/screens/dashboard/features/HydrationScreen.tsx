import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { sb } from '../../../lib/supabase'
import { todayISO } from '../../../utils/calculations'
import ScreenHeader from '../../../components/layout/ScreenHeader'
import type { DashboardHook } from '../../../hooks/useDashboardData'

const QUICK_AMOUNTS = [150, 200, 330, 500, 750, 1000]
const GOAL_KEY = (uid: string) => `hirow_water_goal_${uid}`

export default function HydrationScreen({ data }: { data: DashboardHook }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { todayWater, weekWater, reload } = data

  const defaultGoal = Math.round((profile?.weight_kg ?? 70) * 35)
  const [goal, setGoal] = useState(() => {
    if (!user) return defaultGoal
    const saved = localStorage.getItem(GOAL_KEY(user.id))
    return saved ? parseInt(saved) : defaultGoal
  })
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState(String(goal))
  const [customInput, setCustomInput] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    setGoal(prev => {
      const saved = user ? localStorage.getItem(GOAL_KEY(user.id)) : null
      return saved ? parseInt(saved) : defaultGoal
    })
  }, [user, defaultGoal])

  const pct = Math.min(todayWater / goal, 1)
  const remaining = Math.max(goal - todayWater, 0)

  const addWater = async (ml: number) => {
    if (!user || adding) return
    setAdding(true)
    try {
      await sb.rpc('add_water', { p_amount_ml: ml, p_date: todayISO() })
      await reload()
    } finally {
      setAdding(false)
    }
  }

  const resetToday = async () => {
    if (!user) return
    if (!confirm('Réinitialiser l\'eau du jour ?')) return
    await sb.rpc('reset_water', { p_date: todayISO() })
    await reload()
  }

  const saveGoal = () => {
    const val = parseInt(goalInput)
    if (!isNaN(val) && val >= 500 && val <= 6000 && user) {
      setGoal(val)
      localStorage.setItem(GOAL_KEY(user.id), String(val))
    }
    setEditingGoal(false)
  }

  const addCustom = () => {
    const val = parseInt(customInput)
    if (!isNaN(val) && val > 0) {
      addWater(val)
      setCustomInput('')
    }
  }

  // Build 7-day history
  const days: { date: string; label: string; ml: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const date = d.toISOString().slice(0, 10)
    const label = i === 0 ? "Auj." : ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][d.getDay()]
    const entry = weekWater.find(w => w.logged_date === date)
    days.push({ date, label, ml: entry?.amount_ml ?? 0 })
  }
  const maxMl = Math.max(...days.map(d => d.ml), goal)
  const avgMl = Math.round(days.reduce((s, d) => s + d.ml, 0) / 7)
  const daysGoalMet = days.filter(d => d.ml >= goal).length

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      <ScreenHeader
        title="Hydratation 💧"
        subtitle={`Objectif : ${(goal / 1000).toFixed(1)}L/jour`}
        back="/dashboard"
        variant="blue"
        rightSlot={
          <button
            onClick={() => { setGoalInput(String(goal)); setEditingGoal(true) }}
            aria-label="Modifier l'objectif"
            className="bg-white/20 text-white text-xs font-semibold px-3 py-2 min-h-[44px] rounded-full active:bg-white/30 transition-colors"
          >
            ✏️ Objectif
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {/* Goal editor */}
        {editingGoal && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-blue-100">
            <p className="text-sm font-bold text-slate-700 mb-3">Objectif quotidien</p>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-base focus:outline-none focus:border-blue-400"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                placeholder="ex: 2500"
              />
              <span className="flex items-center text-sm text-slate-500">ml</span>
              <button onClick={saveGoal} className="bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold">
                Sauver
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">Recommandation selon votre poids : {defaultGoal}ml</p>
          </div>
        )}

        {/* Today big ring */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-4 text-center">Aujourd'hui</p>
          <div className="flex items-center justify-center mb-4">
            <div className="relative w-36 h-36">
              <svg className="w-36 h-36 -rotate-90" viewBox="0 0 144 144">
                <circle cx="72" cy="72" r="60" fill="none" stroke="#e0f2fe" strokeWidth="14" />
                <circle
                  cx="72" cy="72" r="60" fill="none"
                  stroke="url(#waterGrad)" strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 60}`}
                  strokeDashoffset={`${2 * Math.PI * 60 * (1 - pct)}`}
                  className="transition-all duration-700"
                />
                <defs>
                  <linearGradient id="waterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold text-blue-600">{(todayWater / 1000).toFixed(1)}L</p>
                <p className="text-xs text-slate-400">/ {(goal / 1000).toFixed(1)}L</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-1">
            <div className="bg-blue-50 rounded-xl p-2 text-center">
              <p className="text-sm font-bold text-blue-600">{Math.round(pct * 100)}%</p>
              <p className="text-[10px] text-slate-400">Progression</p>
            </div>
            <div className="bg-cyan-50 rounded-xl p-2 text-center">
              <p className="text-sm font-bold text-cyan-600">{remaining > 0 ? `${remaining}ml` : '✓'}</p>
              <p className="text-[10px] text-slate-400">Restant</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-2 text-center">
              <p className="text-sm font-bold text-slate-600">{Math.round(todayWater / 250)}</p>
              <p className="text-[10px] text-slate-400">Verres</p>
            </div>
          </div>
        </div>

        {/* Quick add */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-3">Ajouter</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {QUICK_AMOUNTS.map(ml => (
              <button
                key={ml}
                onClick={() => addWater(ml)}
                disabled={adding}
                className="py-2.5 text-sm bg-blue-50 text-blue-700 font-semibold rounded-xl hover:bg-blue-100 active:scale-95 transition-all border border-blue-100 disabled:opacity-50"
              >
                +{ml >= 1000 ? `${ml / 1000}L` : `${ml}ml`}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-base focus:outline-none focus:border-blue-400 bg-slate-50"
              placeholder="Quantité en ml..."
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
            />
            <button
              onClick={addCustom}
              disabled={adding || !customInput}
              className="bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40 active:scale-95 transition-all"
            >
              +
            </button>
          </div>
          {todayWater > 0 && (
            <button
              onClick={resetToday}
              className="mt-3 text-xs text-slate-400 hover:text-red-400 transition-colors w-full text-center"
            >
              Réinitialiser aujourd'hui
            </button>
          )}
        </div>

        {/* 7-day history */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">7 derniers jours</p>
            <div className="flex gap-3 text-xs text-slate-500">
              <span>Moy. <strong className="text-blue-600">{(avgMl / 1000).toFixed(1)}L</strong></span>
              <span>Objectif <strong className="text-green-600">{daysGoalMet}/7j</strong></span>
            </div>
          </div>
          <div className="flex items-end gap-1.5 h-24">
            {days.map(d => {
              const barPct = maxMl > 0 ? d.ml / maxMl : 0
              const metGoal = d.ml >= goal
              const isToday = d.date === todayISO()
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: '72px' }}>
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ${
                        metGoal ? 'bg-gradient-to-t from-blue-500 to-cyan-400' :
                        d.ml > 0 ? 'bg-blue-200' : 'bg-slate-100'
                      } ${isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                      style={{ height: `${Math.max(barPct * 72, d.ml > 0 ? 4 : 0)}px` }}
                    />
                  </div>
                  <p className={`text-[10px] font-semibold ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                    {d.label}
                  </p>
                  {d.ml > 0 && (
                    <p className="text-[9px] text-slate-400">{(d.ml / 1000).toFixed(1)}L</p>
                  )}
                </div>
              )
            })}
          </div>
          {/* Goal line indicator */}
          <div className="mt-2 flex items-center gap-2">
            <div className="w-4 h-0.5 bg-blue-400 rounded" />
            <p className="text-[10px] text-slate-400">Barres bleues pleines = objectif atteint</p>
          </div>
        </div>

      </div>
    </div>
  )
}
