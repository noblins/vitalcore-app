import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { sb, callEdge } from '../../../lib/supabase'
import { todayISO, calcMacroTargets } from '../../../utils/calculations'
import type { DashboardHook } from '../../../hooks/useDashboardData'
import { Alert } from '../../../components/ui/Card'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Suggestion {
  name: string
  emoji: string
  description: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

// ── Meal config ───────────────────────────────────────────────────────────────
const MEAL_TYPES = [
  { id: 'breakfast', label: 'Petit-déjeuner', emoji: '🌅', pct: 0.25, color: 'bg-orange-500',  light: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-600'  },
  { id: 'lunch',     label: 'Déjeuner',       emoji: '☀️',  pct: 0.35, color: 'bg-emerald-500', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' },
  { id: 'snack',     label: 'Collation',      emoji: '🍎', pct: 0.10, color: 'bg-sky-500',     light: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-600'     },
  { id: 'dinner',    label: 'Dîner',          emoji: '🌙', pct: 0.30, color: 'bg-violet-500',  light: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-600'  },
] as const
type MealId = typeof MEAL_TYPES[number]['id']

// ── Preferences (localStorage) ────────────────────────────────────────────────
const PREFS_KEY = (uid: string) => `vitalcore_food_prefs_${uid}`

interface Prefs { liked: string[]; disliked: string[] }

function loadPrefs(uid: string): Prefs {
  try { return { liked: [], disliked: [], ...JSON.parse(localStorage.getItem(PREFS_KEY(uid)) ?? '{}') } }
  catch { return { liked: [], disliked: [] } }
}
function savePrefs(uid: string, p: Prefs) {
  localStorage.setItem(PREFS_KEY(uid), JSON.stringify(p))
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SuggestionsScreen({ data }: { data: DashboardHook }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { reload } = data

  const targets = profile?.tdee
    ? calcMacroTargets(profile.tdee, profile.weight_kg ?? 70, profile.goal ?? 'maintain')
    : null

  const [activeMeal, setActiveMeal]       = useState<MealId>('lunch')
  const [suggestions, setSuggestions]     = useState<Record<MealId, Suggestion[]>>({ breakfast: [], lunch: [], snack: [], dinner: [] })
  const [loadingMeal, setLoadingMeal]     = useState<MealId | null>(null)
  const [replacingIdx, setReplacingIdx]   = useState<number | null>(null)
  const [errors, setErrors]               = useState<Record<MealId, string>>({ breakfast: '', lunch: '', snack: '', dinner: '' })
  const [liked, setLiked]                 = useState<Set<string>>(new Set(user ? loadPrefs(user.id).liked : []))
  const [excluded, setExcluded]           = useState<Record<MealId, string[]>>({ breakfast: [], lunch: [], snack: [], dinner: [] })
  const [addedToday, setAddedToday]       = useState<Set<string>>(new Set())
  const [showPrefs, setShowPrefs]         = useState(false)
  const [prefs, setPrefs]                 = useState<Prefs>(user ? loadPrefs(user.id) : { liked: [], disliked: [] })

  // ── Fetch suggestions for a meal ──────────────────────────────────────────
  const fetchFor = useCallback(async (mealId: MealId, extraExclude: string[] = []) => {
    if (!user || !targets) return
    setLoadingMeal(mealId)
    setErrors(e => ({ ...e, [mealId]: '' }))
    const p = loadPrefs(user.id)
    const mt = MEAL_TYPES.find(m => m.id === mealId)!
    const targetCal = Math.round(targets.targetCal * mt.pct)
    const allExcluded = [...(excluded[mealId] ?? []), ...extraExclude]
    try {
      const res = await callEdge('suggest-meals', {
        meal_type: mealId,
        target_cal: targetCal,
        liked_foods: p.liked,
        disliked_foods: p.disliked,
        exclude_names: allExcluded,
        count: 3,
      })
      const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as Record<string, unknown>
      if (json.success) {
        const suggs = json.suggestions as Suggestion[]
        setSuggestions(s => ({ ...s, [mealId]: suggs }))
        setExcluded(e => ({ ...e, [mealId]: [...(e[mealId] ?? []), ...suggs.map(s => s.name)] }))
      } else {
        setErrors(e => ({ ...e, [mealId]: (json.error ?? json.message ?? 'Erreur') as string }))
      }
    } catch (err: unknown) {
      setErrors(e => ({ ...e, [mealId]: err instanceof Error ? err.message : 'Erreur réseau' }))
    } finally {
      setLoadingMeal(null)
    }
  }, [user, targets, excluded])

  const handleTabChange = (id: MealId) => {
    setActiveMeal(id)
    if (suggestions[id].length === 0 && !loadingMeal) fetchFor(id)
  }

  // Auto-load lunch on mount
  useEffect(() => { if (user && targets) fetchFor('lunch') }, []) // eslint-disable-line

  // ── Like ──────────────────────────────────────────────────────────────────
  const handleLike = (name: string) => {
    if (!user) return
    const p = loadPrefs(user.id)
    if (!p.liked.includes(name)) {
      p.liked = [...p.liked, name].slice(-30)
      savePrefs(user.id, p)
      setPrefs({ ...p })
    }
    setLiked(prev => new Set(prev).add(name))
  }

  const removeLike = (name: string) => {
    if (!user) return
    const p = loadPrefs(user.id)
    p.liked = p.liked.filter(n => n !== name)
    savePrefs(user.id, p)
    setPrefs({ ...p })
    setLiked(prev => { const s = new Set(prev); s.delete(name); return s })
  }

  const removeDislike = (name: string) => {
    if (!user) return
    const p = loadPrefs(user.id)
    p.disliked = p.disliked.filter(n => n !== name)
    savePrefs(user.id, p)
    setPrefs({ ...p })
  }

  // ── Dislike → replace ─────────────────────────────────────────────────────
  const handleDislike = async (mealId: MealId, idx: number, name: string) => {
    if (!user) return
    const p = loadPrefs(user.id)
    if (!p.disliked.includes(name)) {
      p.disliked = [...p.disliked, name].slice(-40)
      savePrefs(user.id, p)
      setPrefs({ ...p })
    }
    setReplacingIdx(idx)
    const allExcluded = [...(excluded[mealId] ?? []), ...suggestions[mealId].map(s => s.name)]
    const mt = MEAL_TYPES.find(m => m.id === mealId)!
    const targetCal = targets ? Math.round(targets.targetCal * mt.pct) : 400
    try {
      const res = await callEdge('suggest-meals', {
        meal_type: mealId,
        target_cal: targetCal,
        liked_foods: p.liked,
        disliked_foods: p.disliked,
        exclude_names: allExcluded,
        count: 1,
      })
      const json = await res.json().catch(() => ({})) as Record<string, unknown>
      if (json.success) {
        const suggs = json.suggestions as Suggestion[]
        if (suggs[0]) {
          setSuggestions(s => {
            const next = [...s[mealId]]
            next[idx] = suggs[0]
            return { ...s, [mealId]: next }
          })
          setExcluded(e => ({ ...e, [mealId]: [...(e[mealId] ?? []), suggs[0].name] }))
        }
      }
    } catch { /* silent */ }
    setReplacingIdx(null)
  }

  // ── Add to today ──────────────────────────────────────────────────────────
  const handleAdd = async (mealId: MealId, s: Suggestion) => {
    if (!user || addedToday.has(s.name)) return
    handleLike(s.name)
    await sb.from('meals').insert({
      user_id: user.id,
      meal_date: todayISO(),
      meal_type: mealId,
      food_name: s.name,
      calories: s.calories,
      protein_g: s.protein_g,
      carbs_g: s.carbs_g,
      fat_g: s.fat_g,
    })
    setAddedToday(prev => new Set(prev).add(s.name))
    reload()
  }

  const activeMt = MEAL_TYPES.find(m => m.id === activeMeal)!
  const activeSuggs = suggestions[activeMeal]
  const isLoading = loadingMeal === activeMeal
  const activeError = errors[activeMeal]
  const activeCal = targets ? Math.round(targets.targetCal * activeMt.pct) : null

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard/nutrition')} className="text-white/80 text-xl leading-none">←</button>
        <div>
          <h1 className="text-xl font-bold">Idées repas</h1>
          <p className="text-xs opacity-80">Suggestions personnalisées selon votre régime</p>
        </div>
        <button onClick={() => setShowPrefs(p => !p)} className="ml-auto text-white/80 text-sm font-semibold bg-white/20 px-3 py-1.5 rounded-full">
          ❤️ {prefs.liked.length}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Profile summary */}
        {targets && (
          <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-bold">Votre objectif</p>
                <p className="text-xl font-bold text-slate-800">{targets.targetCal} <span className="text-sm font-normal text-slate-400">kcal/jour</span></p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                profile?.goal === 'lose' ? 'bg-green-100 text-green-700' :
                profile?.goal === 'gain' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {profile?.goal === 'lose' ? '↓ Perte de poids' : profile?.goal === 'gain' ? '↑ Prise de masse' : '→ Maintien'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Protéines', val: `${targets.proteinG}g`, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Glucides',  val: `${targets.carbsG}g`,  color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'Lipides',   val: `${targets.fatG}g`,    color: 'text-pink-600',  bg: 'bg-pink-50' },
              ].map(m => (
                <div key={m.label} className={`${m.bg} rounded-xl p-2 text-center`}>
                  <p className={`text-sm font-bold ${m.color}`}>{m.val}</p>
                  <p className="text-[10px] text-slate-400">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preferences panel */}
        {showPrefs && (
          <div className="mx-4 mt-3 bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-sm font-bold text-slate-700 mb-3">Vos préférences alimentaires</p>
            {prefs.liked.length > 0 ? (
              <div className="mb-3">
                <p className="text-xs font-semibold text-green-600 mb-2">❤️ Aimés ({prefs.liked.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {prefs.liked.map(n => (
                    <span key={n} className="flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-xs px-2 py-1 rounded-full">
                      {n}
                      <button onClick={() => removeLike(n)} className="text-green-400 hover:text-red-400 font-bold leading-none">×</button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-3">Aucun aliment aimé pour l'instant. Cliquez ❤️ sur une suggestion !</p>
            )}
            {prefs.disliked.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 mb-2">🚫 Évités ({prefs.disliked.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {prefs.disliked.map(n => (
                    <span key={n} className="flex items-center gap-1 bg-red-50 border border-red-200 text-red-600 text-xs px-2 py-1 rounded-full">
                      {n}
                      <button onClick={() => removeDislike(n)} className="text-red-300 hover:text-green-500 font-bold leading-none">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Meal type tabs */}
        <div className="px-4 mt-4 grid grid-cols-4 gap-2">
          {MEAL_TYPES.map(mt => {
            const cal = targets ? Math.round(targets.targetCal * mt.pct) : null
            const isActive = activeMeal === mt.id
            return (
              <button
                key={mt.id}
                onClick={() => handleTabChange(mt.id as MealId)}
                className={`flex flex-col items-center py-3 px-1 rounded-2xl border-2 transition-all ${
                  isActive
                    ? `${mt.color} text-white border-transparent shadow-md`
                    : `bg-white ${mt.border} text-slate-600 hover:${mt.light}`
                }`}
              >
                <span className="text-xl mb-0.5">{mt.emoji}</span>
                <span className="text-[10px] font-bold leading-tight text-center">{mt.label.split('-')[0]}</span>
                {cal && <span className={`text-[9px] mt-0.5 font-semibold ${isActive ? 'text-white/80' : mt.text}`}>{cal} kcal</span>}
              </button>
            )
          })}
        </div>

        {/* Active meal section label */}
        <div className="flex items-center justify-between px-4 mt-4 mb-2">
          <div>
            <p className="text-sm font-bold text-slate-800">{activeMt.emoji} {activeMt.label}</p>
            {activeCal && <p className="text-xs text-slate-400">~{activeCal} kcal suggérées</p>}
          </div>
          <button
            onClick={() => fetchFor(activeMeal)}
            disabled={isLoading}
            className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {isLoading ? '…' : '🔄 Actualiser'}
          </button>
        </div>

        {/* Suggestions */}
        <div className="px-4 pb-6 flex flex-col gap-3">
          {isLoading && activeSuggs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Génération en cours…</p>
            </div>
          )}

          {activeError && (
            <Alert type="error">
              {activeError}
              <button onClick={() => fetchFor(activeMeal)} className="block mt-1 text-xs underline">Réessayer</button>
            </Alert>
          )}

          {!isLoading && activeSuggs.length === 0 && !activeError && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <span className="text-4xl">{activeMt.emoji}</span>
              <p className="text-sm text-slate-500">Cliquez sur "Actualiser" pour obtenir des idées de {activeMt.label.toLowerCase()}</p>
            </div>
          )}

          {activeSuggs.map((s, i) => {
            const isAdded  = addedToday.has(s.name)
            const isLiked  = liked.has(s.name)
            const isReplacing = replacingIdx === i
            return (
              <div
                key={s.name + i}
                className={`rounded-2xl border bg-white shadow-sm transition-all ${
                  isAdded ? 'border-green-200' : activeMt.border
                }`}
              >
                {isReplacing ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-3xl">{s.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 leading-tight">{s.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.description}</p>
                      </div>
                      <span className={`text-sm font-bold whitespace-nowrap ${activeMt.text}`}>{s.calories} kcal</span>
                    </div>

                    {/* Macros */}
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      {[
                        { label: 'Prot.',  val: s.protein_g, color: 'text-blue-600',   bg: 'bg-blue-50' },
                        { label: 'Gluc.',  val: s.carbs_g,   color: 'text-amber-600',  bg: 'bg-amber-50' },
                        { label: 'Lip.',   val: s.fat_g,     color: 'text-pink-600',   bg: 'bg-pink-50' },
                      ].map(m => (
                        <div key={m.label} className={`${m.bg} rounded-lg p-1.5 text-center`}>
                          <p className={`text-sm font-bold ${m.color}`}>{m.val}g</p>
                          <p className="text-[10px] text-slate-400">{m.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDislike(activeMeal, i, s.name)}
                        className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-base hover:bg-red-50 hover:border-red-200 transition-colors"
                        title="Ne pas revoir"
                      >🚫</button>

                      <button
                        onClick={() => handleAdd(activeMeal, s)}
                        disabled={isAdded}
                        className={`flex-1 h-10 rounded-xl text-sm font-semibold transition-colors ${
                          isAdded
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : `${activeMt.color} text-white hover:opacity-90`
                        }`}
                      >
                        {isAdded ? '✓ Ajouté au repas' : '➕ Ajouter au repas'}
                      </button>

                      <button
                        onClick={() => handleLike(s.name)}
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center text-base transition-all ${
                          isLiked
                            ? 'bg-red-50 border-red-300 scale-110'
                            : 'bg-slate-50 border-slate-200 hover:bg-red-50 hover:border-red-200'
                        }`}
                        title="J'aime"
                      >
                        {isLiked ? '❤️' : '🤍'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {activeSuggs.length > 0 && (
            <button
              onClick={() => fetchFor(activeMeal)}
              disabled={isLoading}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-400 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Génération…' : '🔄 Voir d\'autres idées'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
