import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { sb, callEdge } from '../../../lib/supabase'
import { todayISO } from '../../../utils/calculations'
import Button from '../../../components/ui/Button'
import { Alert } from '../../../components/ui/Card'

interface Suggestion {
  name: string
  emoji: string
  description: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

interface Props {
  mealType: string
  mealLabel: string
  targetCal: number
  onClose: () => void
  onAdded: () => void
}

const PREFS_KEY = (uid: string) => `vitalcore_food_prefs_${uid}`

function loadPrefs(uid: string): { liked: string[]; disliked: string[] } {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY(uid)) ?? '{}') } catch { return { liked: [], disliked: [] } }
}

function savePrefs(uid: string, prefs: { liked: string[]; disliked: string[] }) {
  localStorage.setItem(PREFS_KEY(uid), JSON.stringify(prefs))
}

async function callSuggest(body: object): Promise<Record<string, unknown>> {
  const res = await callEdge('suggest-meals', body)
  return res.json().catch(() => ({ error: `HTTP ${res.status}` }))
}

export default function MealSuggestModal({ mealType, mealLabel, targetCal, onClose, onAdded }: Props) {
  const { user } = useAuth()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [excluded, setExcluded] = useState<string[]>([])
  const [replacing, setReplacing] = useState<number | null>(null)

  const fetchSuggestions = useCallback(async (excludeNames: string[] = []) => {
    if (!user) return
    setLoading(true)
    setError('')
    const prefs = loadPrefs(user.id)
    try {
      const json = await callSuggest({
        meal_type: mealType,
        target_cal: targetCal,
        liked_foods: prefs.liked ?? [],
        disliked_foods: prefs.disliked ?? [],
        exclude_names: excludeNames,
        count: 3,
      })
      if (json.success) {
        const suggs = json.suggestions as Suggestion[]
        setSuggestions(suggs)
        setExcluded(prev => [...prev, ...suggs.map(s => s.name)])
      } else {
        setError((json.error ?? json.message ?? json.detail ?? 'Erreur inconnue') as string)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Impossible de contacter le serveur')
    } finally {
      setLoading(false)
    }
  }, [user, mealType, targetCal])

  useEffect(() => { fetchSuggestions([]) }, [fetchSuggestions])

  const handleLike = (s: Suggestion) => {
    if (!user) return
    const prefs = loadPrefs(user.id)
    if (!prefs.liked) prefs.liked = []
    if (!prefs.liked.includes(s.name)) prefs.liked.push(s.name)
    if (prefs.liked.length > 20) prefs.liked = prefs.liked.slice(-20)
    savePrefs(user.id, prefs)
  }

  const handleDislike = async (index: number, s: Suggestion) => {
    if (!user) return
    const prefs = loadPrefs(user.id)
    if (!prefs.disliked) prefs.disliked = []
    if (!prefs.disliked.includes(s.name)) prefs.disliked.push(s.name)
    if (prefs.disliked.length > 30) prefs.disliked = prefs.disliked.slice(-30)
    savePrefs(user.id, prefs)

    setReplacing(index)
    try {
      const newExcluded = [...excluded, ...suggestions.map(x => x.name)]
      const json = await callSuggest({
        meal_type: mealType,
        target_cal: targetCal,
        liked_foods: prefs.liked ?? [],
        disliked_foods: prefs.disliked ?? [],
        exclude_names: newExcluded,
        count: 1,
      })
      if (json.success) {
        const suggs = json.suggestions as Suggestion[]
        if (suggs[0]) {
          setExcluded(prev => [...prev, suggs[0].name])
          setSuggestions(prev => { const n = [...prev]; n[index] = suggs[0]; return n })
          setAddedIds(prev => { const n = new Set(prev); n.delete(s.name); return n })
        }
      }
    } catch { /* silent */ }
    setReplacing(null)
  }

  const handleAdd = async (s: Suggestion) => {
    if (!user || addedIds.has(s.name)) return
    handleLike(s)
    await sb.from('meals').insert({
      user_id: user.id,
      meal_date: todayISO(),
      meal_type: mealType,
      food_name: s.name,
      calories: s.calories,
      protein_g: s.protein_g,
      carbs_g: s.carbs_g,
      fat_g: s.fat_g,
    })
    setAddedIds(prev => new Set(prev).add(s.name))
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <p className="text-base font-bold text-slate-800">Suggestions · {mealLabel}</p>
            <p className="text-xs text-slate-400">~{targetCal} kcal · 👍 garde, 👎 remplace, ➕ ajoute</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && suggestions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Génération des suggestions…</p>
            </div>
          )}

          {error && (
            <Alert type="error">
              {error}
              <button className="block mt-1 text-xs underline" onClick={() => fetchSuggestions([])}>Réessayer</button>
            </Alert>
          )}

          <div className="flex flex-col gap-3">
            {suggestions.map((s, i) => {
              const isAdded = addedIds.has(s.name)
              const isReplacing = replacing === i
              return (
                <div key={s.name + i} className={`rounded-2xl border transition-all ${isAdded ? 'border-green-200 bg-green-50' : 'border-slate-100 bg-slate-50'}`}>
                  {isReplacing ? (
                    <div className="flex items-center justify-center py-8">
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
                        <span className="text-sm font-bold text-primary whitespace-nowrap">{s.calories} kcal</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[
                          { label: 'Prot.', val: s.protein_g, color: 'text-blue-600', bg: 'bg-blue-50' },
                          { label: 'Gluc.', val: s.carbs_g,   color: 'text-amber-600', bg: 'bg-amber-50' },
                          { label: 'Lip.',  val: s.fat_g,     color: 'text-pink-600',  bg: 'bg-pink-50' },
                        ].map(m => (
                          <div key={m.label} className={`${m.bg} rounded-lg px-2 py-1.5 text-center`}>
                            <p className={`text-sm font-bold ${m.color}`}>{m.val}g</p>
                            <p className="text-[10px] text-slate-400">{m.label}</p>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => handleDislike(i, s)} className="flex-1 py-2 rounded-xl bg-white border border-slate-200 text-base hover:bg-red-50 hover:border-red-200 transition-colors" title="Je n'aime pas">👎</button>
                        <button onClick={() => handleAdd(s)} disabled={isAdded} className={`flex-[2] py-2 rounded-xl text-sm font-semibold transition-colors ${isAdded ? 'bg-green-100 text-green-600 border border-green-200' : 'bg-primary text-white hover:bg-primary/90'}`}>
                          {isAdded ? '✓ Ajouté' : '➕ Ajouter au repas'}
                        </button>
                        <button onClick={() => handleLike(s)} className="flex-1 py-2 rounded-xl bg-white border border-slate-200 text-base hover:bg-yellow-50 hover:border-yellow-200 transition-colors" title="J'aime">👍</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-5 border-t border-slate-100">
          <Button fullWidth variant="secondary" onClick={() => fetchSuggestions(excluded)} disabled={loading}>
            {loading ? 'Génération…' : '🔄 Nouvelles suggestions'}
          </Button>
        </div>
      </div>
    </div>
  )
}
