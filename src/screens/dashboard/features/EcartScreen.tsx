import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { callEdge } from '../../../lib/supabase'
import { calcMacroTargets } from '../../../utils/calculations'
import ScreenHeader from '../../../components/layout/ScreenHeader'
import type { DashboardHook } from '../../../hooks/useDashboardData'

interface Analysis {
  estimated_cal: number
  verdict: 'ok' | 'modere' | 'important'
  surplus_cal: number
  message_principal: string
  details: string
  conseil: string
  macro_estimate: { protein_g: number; carbs_g: number; fat_g: number }
}

const VERDICT_CONFIG = {
  ok:        { emoji: '✅', label: 'Tout va bien !',  bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700'   },
  modere:    { emoji: '🟡', label: 'Écart modéré',    bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700'   },
  important: { emoji: '🔴', label: 'Écart important', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
}

export default function EcartScreen({ data }: { data: DashboardHook }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { meals } = data

  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState('')

  const todayCal = meals.reduce((s, m) => s + (m.calories || 0), 0)
  const targets = profile?.tdee
    ? calcMacroTargets(profile.tdee, profile.weight_kg ?? 70, profile.goal ?? 'maintain')
    : null

  const analyze = async () => {
    if (!description.trim()) return
    setLoading(true)
    setError('')
    setAnalysis(null)
    try {
      const res = await callEdge('analyze-ecart', {
        description,
        today_cal: todayCal,
        tdee: profile?.tdee ?? 2000,
        goal: profile?.goal ?? 'maintain',
        diet: profile?.diet ?? 'standard',
      })
      const json = await res.json()
      if (json.success) {
        setAnalysis(json.analysis)
      } else {
        setError(json.error ?? "Erreur lors de l'analyse")
      }
    } catch {
      setError('Erreur de connexion. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  const cfg = analysis ? (VERDICT_CONFIG[analysis.verdict] ?? VERDICT_CONFIG.modere) : null

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      <ScreenHeader
        title="Faire un écart 🍕"
        subtitle="Comprendre l'impact avant de décider"
        back="/dashboard/nutrition"
      />

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {/* Today context */}
        {targets && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Aujourd'hui</p>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {todayCal} <span className="text-sm font-normal text-slate-400">kcal consommées</span>
                </p>
                <p className="text-sm text-slate-500">Objectif : {targets.targetCal} kcal</p>
              </div>
              <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                todayCal <= targets.targetCal
                  ? 'bg-green-100 text-green-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
                {todayCal <= targets.targetCal
                  ? `${targets.targetCal - todayCal} kcal restantes`
                  : `+${todayCal - targets.targetCal} kcal dépassées`}
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all"
                style={{ width: `${Math.min(todayCal / targets.targetCal * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Input */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-slate-700 mb-1">Qu'est-ce que vous voulez manger ?</p>
          <p className="text-xs text-slate-400 mb-3">Décrivez l'écart envisagé, avec les quantités si possible</p>
          <textarea
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none bg-slate-50"
            placeholder="Ex: une pizza margherita + 2 verres de vin, un burger avec frites, un fondant au chocolat..."
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <button
            onClick={analyze}
            disabled={loading || !description.trim()}
            className="mt-3 w-full py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyse en cours…
              </span>
            ) : "🔍 Analyser l'impact"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600">{error}</div>
        )}

        {/* Result */}
        {analysis && cfg && (
          <div className={`${cfg.bg} border ${cfg.border} rounded-2xl p-4 flex flex-col gap-4`}>

            {/* Verdict */}
            <div className="flex items-center gap-3">
              <span className="text-3xl">{cfg.emoji}</span>
              <div className="flex-1">
                <p className={`font-bold text-base ${cfg.text}`}>{analysis.message_principal}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
              </div>
            </div>

            {/* Calories */}
            <div className="bg-white/70 rounded-xl p-3 flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-400">Estimation de l'écart</p>
                <p className="text-2xl font-bold text-slate-800">
                  {analysis.estimated_cal} <span className="text-sm font-normal text-slate-500">kcal</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Surplus journalier</p>
                <p className={`text-lg font-bold ${analysis.surplus_cal > 0 ? cfg.text : 'text-green-600'}`}>
                  {analysis.surplus_cal > 0 ? `+${analysis.surplus_cal}` : analysis.surplus_cal} kcal
                </p>
              </div>
            </div>

            {/* Macros */}
            {analysis.macro_estimate && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Prot.', val: analysis.macro_estimate.protein_g, color: 'text-blue-600',  bg: 'bg-blue-50'  },
                  { label: 'Gluc.', val: analysis.macro_estimate.carbs_g,   color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Lip.',  val: analysis.macro_estimate.fat_g,     color: 'text-pink-600',  bg: 'bg-pink-50'  },
                ].map(m => (
                  <div key={m.label} className={`${m.bg} rounded-xl p-2 text-center`}>
                    <p className={`text-sm font-bold ${m.color}`}>{m.val}g</p>
                    <p className="text-[10px] text-slate-400">{m.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Details */}
            <p className={`text-sm ${cfg.text} leading-relaxed`}>{analysis.details}</p>

            {/* Conseil */}
            {analysis.conseil && (
              <div className="bg-white/60 rounded-xl p-3 flex gap-2">
                <span className="text-base">💡</span>
                <p className="text-sm text-slate-600">{analysis.conseil}</p>
              </div>
            )}

            <button
              onClick={() => navigate('/dashboard/nutrition')}
              className="w-full py-3 bg-white/80 border border-white rounded-xl text-sm font-semibold text-slate-700 active:scale-95 transition-all"
            >
              Profitez-en ! Revenir à la nutrition →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
