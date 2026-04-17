import React, { useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { sb, getFreshToken, EDGE_URL } from '../../../lib/supabase'
import { todayISO, calcMacroTargets } from '../../../utils/calculations'
import Button from '../../../components/ui/Button'
import { Alert } from '../../../components/ui/Card'
import type { DashboardHook } from '../../../hooks/useDashboardData'

// ── Meal type config ─────────────────────────────────────────────────────────
const MEAL_TYPES = [
  { id: 'breakfast', label: 'Petit-déjeuner', emoji: '🌅', pct: 0.25,
    grad: 'from-orange-400 to-amber-400',    light: 'bg-orange-50',  border: 'border-orange-100',  text: 'text-orange-600' },
  { id: 'lunch',     label: 'Déjeuner',       emoji: '☀️',  pct: 0.35,
    grad: 'from-emerald-400 to-green-500',   light: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600' },
  { id: 'snack',     label: 'Collation',      emoji: '🍎', pct: 0.10,
    grad: 'from-sky-400 to-blue-500',        light: 'bg-sky-50',     border: 'border-sky-100',     text: 'text-sky-600' },
  { id: 'dinner',    label: 'Dîner',          emoji: '🌙', pct: 0.30,
    grad: 'from-violet-400 to-purple-500',   light: 'bg-violet-50',  border: 'border-violet-100',  text: 'text-violet-600' },
] as const

type MealTypeId = typeof MEAL_TYPES[number]['id']

type MealRow = {
  id: string
  foodName: string
  calories: string
  protein: string
  carbs: string
  fat: string
  showMacros: boolean
}

const newRow = (): MealRow => ({
  id: Math.random().toString(36).slice(2),
  foodName: '', calories: '', protein: '', carbs: '', fat: '', showMacros: false,
})

export default function NutritionTab({ data }: { data: DashboardHook }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { meals, reload } = data

  const [activeMealType, setActiveMealType] = useState<MealTypeId | null>(null)
  const [rows, setRows] = useState<MealRow[]>([newRow()])
  const [scanning, setScanning]       = useState(false)
  const [scanPreview, setScanPreview] = useState('')
  const [scanInfo, setScanInfo]       = useState<{ details?: string; suggestions?: string; confidence?: string } | null>(null)
  const [msg, setMsg]                 = useState('')
  const [saving, setSaving]           = useState(false)

  // One scan input per meal type section
  const scanRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ── Targets & totals ──────────────────────────────────────────────────────
  const targets = profile?.tdee
    ? calcMacroTargets(profile.tdee, profile.weight_kg ?? 70, profile.goal ?? 'maintain')
    : null

  const totalCal   = meals.reduce((s, m) => s + (m.calories  || 0), 0)
  const totalProt  = meals.reduce((s, m) => s + (m.protein_g || 0), 0)
  const totalCarbs = meals.reduce((s, m) => s + (m.carbs_g   || 0), 0)
  const totalFat   = meals.reduce((s, m) => s + (m.fat_g     || 0), 0)

  const mealsByType = (typeId: MealTypeId) => meals.filter(m => (m.meal_type ?? 'lunch') === typeId)
  const calByType   = (typeId: MealTypeId) => mealsByType(typeId).reduce((s, m) => s + (m.calories || 0), 0)

  // ── Row helpers ───────────────────────────────────────────────────────────
  const updateRow = useCallback((id: string, patch: Partial<MealRow>) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r)), [])

  const removeRow = (id: string) =>
    setRows(rs => rs.length > 1 ? rs.filter(r => r.id !== id) : [newRow()])

  const openForm = (typeId: MealTypeId) => {
    if (activeMealType === typeId) { setActiveMealType(null); return }
    setActiveMealType(typeId)
    setRows([newRow()])
    setScanPreview('')
    setScanInfo(null)
  }

  const resetForm = () => {
    setActiveMealType(null)
    setRows([newRow()])
    setScanPreview('')
    setScanInfo(null)
  }

  // ── Save all rows ─────────────────────────────────────────────────────────
  const saveAll = async () => {
    const valid = rows.filter(r => r.foodName.trim() && r.calories)
    if (!valid.length || !user || !activeMealType) return
    setSaving(true)
    await sb.from('meals').insert(
      valid.map(r => ({
        user_id: user.id, meal_date: todayISO(),
        meal_type: activeMealType,
        food_name: r.foodName.trim(),
        calories:  parseInt(r.calories)    || 0,
        protein_g: parseFloat(r.protein)   || 0,
        carbs_g:   parseFloat(r.carbs)     || 0,
        fat_g:     parseFloat(r.fat)       || 0,
      }))
    )
    resetForm()
    setMsg(`${valid.length} aliment${valid.length > 1 ? 's' : ''} ajouté${valid.length > 1 ? 's' : ''} ✓`)
    setTimeout(() => setMsg(''), 3000)
    setSaving(false)
    await reload()
  }

  const deleteMeal = async (id: string) => {
    await sb.from('meals').delete().eq('id', id)
    await reload()
  }

  // ── Scan ─────────────────────────────────────────────────────────────────
  const handleScan = async (typeId: MealTypeId, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (activeMealType !== typeId) {
      setActiveMealType(typeId)
      setRows([newRow()])
    }
    setScanning(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const b64 = ev.target?.result?.toString().split(',')[1] ?? ''
      setScanPreview(ev.target?.result?.toString() ?? '')
      setScanInfo(null)
      try {
        const token = await getFreshToken()
        const res = await fetch(`${EDGE_URL}/analyze-meal-photo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ image_base64: b64, media_type: file.type || 'image/jpeg' }),
        })
        const result = await res.json()

        if (!res.ok) {
          if (res.status === 403) {
            setMsg('⭐ Fonctionnalité réservée aux comptes Premium')
            setTimeout(() => setMsg(''), 4000)
          }
          setScanning(false)
          return
        }

        // The function returns { success: true, analysis: { food_name, calories, ... } }
        const a = result.analysis ?? result
        setScanInfo({
          details:     a.details,
          suggestions: a.suggestions,
          confidence:  a.confidence,
        })
        setRows(rs => {
          const emptyIdx = rs.findIndex(r => !r.foodName)
          const filled = {
            ...rs[emptyIdx >= 0 ? emptyIdx : rs.length - 1],
            foodName: a.food_name   ?? '',
            calories: String(a.calories   ?? ''),
            protein:  String(a.protein_g  ?? ''),
            carbs:    String(a.carbs_g    ?? ''),
            fat:      String(a.fat_g      ?? ''),
            showMacros: true,
          }
          if (emptyIdx >= 0) return rs.map((r, i) => i === emptyIdx ? filled : r)
          return [...rs, { ...filled, id: Math.random().toString(36).slice(2) }]
        })
      } catch (err) { console.error('Scan error:', err) }
      setScanning(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const validCount = rows.filter(r => r.foodName.trim() && r.calories).length
  const calPct     = targets ? Math.min((totalCal / targets.targetCal) * 100, 100) : 0

  return (
    <div className="p-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 -mx-4 -mt-4 mb-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-xl font-bold">Nutrition</h1>
            <p className="text-sm opacity-80">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{totalCal}</p>
            <p className="text-xs opacity-80">/ {targets?.targetCal ?? '–'} kcal</p>
          </div>
        </div>
        {targets && (
          <>
            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${calPct}%` }} />
            </div>
            <div className="flex justify-between text-xs opacity-75">
              <span>{Math.max(targets.targetCal - totalCal, 0) > 0
                ? `${targets.targetCal - totalCal} kcal restantes`
                : 'Objectif atteint ✓'}</span>
              <span>P {Math.round(totalProt)}g · G {Math.round(totalCarbs)}g · L {Math.round(totalFat)}g</span>
            </div>
          </>
        )}
      </div>

      {msg && <Alert type="success">{msg}</Alert>}

      {/* Suggestions shortcut */}
      <button
        onClick={() => navigate('/dashboard/suggestions')}
        className="w-full flex items-center justify-between bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-2xl px-4 py-3 mb-4 active:scale-95 transition-transform"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">💡</span>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-800">Idées repas personnalisées</p>
            <p className="text-xs text-slate-500">Suggestions basées sur votre régime</p>
          </div>
        </div>
        <span className="text-primary font-bold text-lg">›</span>
      </button>

      {/* Macro mini bars */}
      {targets && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Protéines', done: totalProt,  goal: targets.proteinG, color: 'bg-blue-400' },
            { label: 'Glucides',  done: totalCarbs, goal: targets.carbsG,   color: 'bg-amber-400' },
            { label: 'Graisses',  done: totalFat,   goal: targets.fatG,     color: 'bg-pink-400' },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl p-2.5 shadow-sm border border-slate-100">
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-slate-500">{m.label}</span>
                <span className="font-bold text-slate-700">{Math.round(m.done)}g</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${m.color} rounded-full`}
                  style={{ width: `${Math.min(m.done / m.goal * 100, 100)}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 text-right">/ {m.goal}g</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Meal sections ── */}
      {MEAL_TYPES.map(type => {
        const typeMeals  = mealsByType(type.id)
        const typeCal    = calByType(type.id)
        const typeTarget = targets ? Math.round(targets.targetCal * type.pct) : null
        const typePct    = typeTarget ? Math.min((typeCal / typeTarget) * 100, 100) : 0
        const isOpen     = activeMealType === type.id

        return (
          <div key={type.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-3">
            {/* Header */}
            <div className={`bg-gradient-to-r ${type.grad} p-3`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{type.emoji}</span>
                  <div>
                    <p className="font-bold text-white text-sm">{type.label}</p>
                    {typeTarget && <p className="text-white/75 text-xs">Cible ~{typeTarget} kcal</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold text-xl">{typeCal}</p>
                  <p className="text-white/75 text-xs">kcal</p>
                </div>
              </div>
              {typeTarget && (
                <div className="mt-2 w-full h-1.5 bg-white/30 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full transition-all" style={{ width: `${typePct}%` }} />
                </div>
              )}
            </div>

            {/* Logged meals */}
            {typeMeals.length > 0 && (
              <div className="divide-y divide-slate-50">
                {typeMeals.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{m.food_name}</p>
                      <div className="flex gap-2 mt-0.5">
                        {m.protein_g > 0 && <span className="text-[11px] text-blue-500">{m.protein_g}g prot.</span>}
                        {m.carbs_g   > 0 && <span className="text-[11px] text-amber-500">{m.carbs_g}g gluc.</span>}
                        {m.fat_g     > 0 && <span className="text-[11px] text-pink-400">{m.fat_g}g gras</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className={`text-sm font-bold ${type.text}`}>{m.calories} kcal</span>
                      <button onClick={() => deleteMeal(m.id)}
                        className="text-slate-300 hover:text-red-400 text-sm transition-colors">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action bar */}
            <div className={`flex border-t ${type.border}`}>
              <button
                onClick={() => openForm(type.id)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  isOpen ? `${type.light} ${type.text}` : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {isOpen ? '✕ Fermer' : '+ Ajouter'}
              </button>
              <div className="w-px bg-slate-100" />
              <button
                onClick={() => scanRefs.current[type.id]?.click()}
                className="px-4 py-3 text-slate-400 hover:text-slate-600 text-sm transition-colors"
              >
                📷
              </button>
              <input
                ref={el => { scanRefs.current[type.id] = el }}
                type="file" accept="image/*" capture="environment"
                className="hidden"
                onChange={e => handleScan(type.id, e)}
              />
            </div>

            {/* ── Multi-row form (inline) ── */}
            {isOpen && (
              <div className={`${type.light} border-t ${type.border} p-3`}>
                {scanPreview && (
                  <img src={scanPreview} className="w-full max-h-32 object-cover rounded-xl mb-3" alt="scan" />
                )}
                {scanning && (
                  <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-500">
                    <span className="animate-spin">⏳</span> Claude analyse votre photo...
                  </div>
                )}
                {scanInfo && !scanning && (
                  <div className="bg-white rounded-xl border border-slate-100 p-3 mb-3 text-xs flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold px-1.5 py-0.5 rounded-full ${
                        scanInfo.confidence === 'high'   ? 'bg-green-100 text-green-700' :
                        scanInfo.confidence === 'medium' ? 'bg-orange-100 text-orange-600' :
                                                           'bg-slate-100 text-slate-500'
                      }`}>
                        {scanInfo.confidence === 'high' ? '✓ Haute confiance' :
                         scanInfo.confidence === 'medium' ? '~ Confiance moyenne' : '? Faible confiance'}
                      </span>
                    </div>
                    {scanInfo.details && (
                      <p className="text-slate-600">🔍 {scanInfo.details}</p>
                    )}
                    {scanInfo.suggestions && (
                      <p className="text-primary font-medium">💡 {scanInfo.suggestions}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2 mb-3">
                  {rows.map((row, idx) => (
                    <div key={row.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                      {/* Main line */}
                      <div className="flex items-center gap-2 p-2">
                        <span className="text-xs text-slate-300 w-4 text-center shrink-0">{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Nom de l'aliment"
                          value={row.foodName}
                          onChange={e => updateRow(row.id, { foodName: e.target.value })}
                          className="flex-1 text-sm px-2.5 py-1.5 bg-slate-50 rounded-lg focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/30 min-w-0"
                        />
                        <input
                          type="number"
                          placeholder="kcal"
                          value={row.calories}
                          onChange={e => updateRow(row.id, { calories: e.target.value })}
                          className="w-16 text-sm px-2 py-1.5 bg-slate-50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 text-center shrink-0"
                        />
                        <button
                          onClick={() => updateRow(row.id, { showMacros: !row.showMacros })}
                          className={`text-xs px-1.5 py-1.5 rounded-lg transition-colors shrink-0 ${
                            row.showMacros ? `${type.light} ${type.text}` : 'text-slate-300 hover:text-slate-500'
                          }`}
                          title="Ajouter macros"
                        >P/G/L</button>
                        <button
                          onClick={() => removeRow(row.id)}
                          className="text-slate-300 hover:text-red-400 text-base transition-colors shrink-0"
                        >×</button>
                      </div>
                      {/* Macros expansion */}
                      {row.showMacros && (
                        <div className="grid grid-cols-3 gap-2 px-3 pb-2">
                          {[
                            { key: 'protein' as const, label: 'Prot. g', color: 'text-blue-500' },
                            { key: 'carbs'   as const, label: 'Gluc. g', color: 'text-amber-500' },
                            { key: 'fat'     as const, label: 'Gras g',  color: 'text-pink-400' },
                          ].map(f => (
                            <div key={f.key}>
                              <p className={`text-[10px] font-semibold ${f.color} mb-1`}>{f.label}</p>
                              <input
                                type="number"
                                step="0.1"
                                placeholder="0"
                                value={row[f.key]}
                                onChange={e => updateRow(row.id, { [f.key]: e.target.value })}
                                className="w-full text-sm px-2 py-1.5 bg-slate-50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 text-center"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add row */}
                <button
                  onClick={() => setRows(rs => [...rs, newRow()])}
                  className={`w-full py-2.5 text-sm font-semibold ${type.text} border-2 border-dashed ${type.border} rounded-xl mb-3 transition-all active:scale-95`}
                >
                  + Ajouter une ligne
                </button>

                {/* Save */}
                <Button
                  fullWidth
                  onClick={saveAll}
                  disabled={saving || validCount === 0}
                >
                  {saving
                    ? 'Enregistrement...'
                    : `Enregistrer ${validCount > 0 ? `${validCount} aliment${validCount > 1 ? 's' : ''}` : ''}`}
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
