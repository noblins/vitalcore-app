import React, { useState, useEffect } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { sb } from '../../../lib/supabase'
import { useCalendarData } from '../../../hooks/useCalendarData'
import type { DashboardHook } from '../../../hooks/useDashboardData'

const DAYS_FR   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const WATER_AMOUNTS = [200, 330, 500, 750]

type DayMeal = { id: string; food_name: string; calories: number }

export default function CalendarTab({ data }: { data: DashboardHook }) {
  const { user, profile } = useAuth()
  const { monthData, loading, loadMonth } = useCalendarData(user?.id)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Day detail state
  const [dayMeals, setDayMeals] = useState<DayMeal[]>([])
  const [weightInput, setWeightInput] = useState('')
  const [saving, setSaving] = useState(false)

  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  useEffect(() => {
    loadMonth(year, month)
    setSelectedDay(null)
  }, [year, month]) // eslint-disable-line

  useEffect(() => {
    if (!selectedDay || !user) { setDayMeals([]); return }
    sb.from('meals')
      .select('id, food_name, calories')
      .eq('user_id', user.id)
      .eq('meal_date', selectedDay)
      .order('created_at')
      .then(({ data: rows }) => setDayMeals(rows ?? []))
  }, [selectedDay, user])

  const today       = new Date().toISOString().slice(0, 10)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const formatDate = (day: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const tdee      = profile?.tdee ?? 0
  const waterGoal = Math.round((profile?.weight_kg ?? 70) * 35)
  const selData   = selectedDay ? monthData[selectedDay] : null
  const hasData   = selData && (selData.calories > 0 || selData.water_ml > 0 || selData.weight_kg !== null)
  const isFuture  = (d: string) => d > today

  // ── Actions ────────────────────────────────────────────────────────────────
  const addWaterForDay = async (ml: number) => {
    if (!user || !selectedDay) return
    const { data: existing } = await sb.from('water_logs')
      .select('id, amount_ml').eq('user_id', user.id).eq('logged_date', selectedDay).maybeSingle()
    if (existing) {
      await sb.from('water_logs').update({ amount_ml: existing.amount_ml + ml }).eq('id', existing.id)
    } else {
      await sb.from('water_logs').insert({ user_id: user.id, amount_ml: ml, logged_date: selectedDay })
    }
    loadMonth(year, month)
    if (selectedDay === today) data.reload()
  }

  const logWeightForDay = async () => {
    if (!user || !selectedDay || !weightInput) return
    const w = parseFloat(weightInput)
    if (isNaN(w) || w < 20 || w > 500) return
    setSaving(true)
    // Upsert: update if entry already exists for that day
    const { data: existing } = await sb.from('weight_logs')
      .select('id').eq('user_id', user.id).eq('logged_date', selectedDay).maybeSingle()
    if (existing) {
      await sb.from('weight_logs').update({ weight_kg: w }).eq('id', existing.id)
    } else {
      await sb.from('weight_logs').insert({ user_id: user.id, weight_kg: w, logged_date: selectedDay })
    }
    if (selectedDay === today) {
      await sb.from('profiles').update({ weight_kg: w }).eq('id', user.id)
    }
    setWeightInput('')
    setSaving(false)
    loadMonth(year, month)
    data.reload()
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 -mx-4 -mt-4 mb-4">
        <h1 className="text-xl font-bold">Calendrier</h1>
        <p className="text-sm opacity-80">Suivi jour par jour</p>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 text-lg font-bold active:scale-95 transition-transform"
        >‹</button>
        <h2 className="font-bold text-slate-800">{MONTHS_FR[month - 1]} {year}</h2>
        <button
          onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 text-lg font-bold active:scale-95 transition-transform"
        >›</button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_FR.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className={`grid grid-cols-7 gap-1 ${loading ? 'opacity-50' : ''}`}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr  = formatDate(day)
          const d        = monthData[dateStr]
          const isToday  = dateStr === today
          const future   = isFuture(dateStr)
          const isSelected = selectedDay === dateStr
          const hasD     = !!d && (d.calories > 0 || d.water_ml > 0 || d.weight_kg !== null)

          return (
            <button
              key={i}
              onClick={() => !future && setSelectedDay(isSelected ? null : dateStr)}
              disabled={future}
              className={`relative flex flex-col items-center justify-center rounded-xl py-2 min-h-[52px] transition-all active:scale-95 ${
                isSelected ? 'bg-gradient-to-br from-primary to-secondary text-white shadow-md'
                : isToday  ? 'bg-primary/10 text-primary font-bold border-2 border-primary/40'
                : future   ? 'opacity-20 cursor-default'
                : hasD     ? 'bg-white shadow-sm border border-slate-100'
                : 'bg-slate-50'
              }`}
            >
              <span className="text-sm font-semibold leading-none">{day}</span>
              {hasD && !isSelected && (
                <div className="flex gap-0.5 mt-1.5">
                  {d.calories > 0        && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  {d.water_ml > 0        && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                  {d.weight_kg !== null  && <span className="w-1.5 h-1.5 rounded-full bg-secondary" />}
                  {d.has_measurements    && <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 justify-center mt-3 mb-4">
        {[['bg-primary','Calories'],['bg-blue-400','Eau'],['bg-secondary','Poids'],['bg-purple-400','Mensur.']].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className={`w-2 h-2 rounded-full ${c} inline-block`} />{l}
          </span>
        ))}
      </div>

      {/* ── Day detail + edit ── */}
      {selectedDay && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          {/* Title */}
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 px-4 py-3 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 capitalize text-sm">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </h3>
            <button onClick={() => setSelectedDay(null)} className="text-slate-400 text-2xl leading-none">×</button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* ── Stats du jour ── */}
            {hasData ? (
              <>
                {selData!.calories > 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-semibold text-slate-700">🔥 Calories</span>
                      <span className="text-sm font-bold text-primary">
                        {selData!.calories}{tdee > 0 ? ` / ${tdee} kcal` : ' kcal'}
                      </span>
                    </div>
                    {tdee > 0 && (
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
                        <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                          style={{ width: `${Math.min(selData!.calories / tdee * 100, 100)}%` }} />
                      </div>
                    )}
                    {/* Macros */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Protéines', val: selData!.protein.toFixed(0) },
                        { label: 'Glucides',  val: selData!.carbs.toFixed(0) },
                        { label: 'Graisses',  val: selData!.fat.toFixed(0) },
                      ].map(m => (
                        <div key={m.label} className="bg-slate-50 rounded-lg p-2 text-center">
                          <p className="text-base font-bold text-secondary">{m.val}g</p>
                          <p className="text-[10px] text-slate-500">{m.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selData!.water_ml > 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-semibold text-slate-700">💧 Hydratation</span>
                      <span className="text-sm font-bold text-blue-600">
                        {(selData!.water_ml / 1000).toFixed(1)}L / {(waterGoal / 1000).toFixed(1)}L
                      </span>
                    </div>
                    <div className="w-full h-2 bg-blue-50 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full"
                        style={{ width: `${Math.min(selData!.water_ml / waterGoal * 100, 100)}%` }} />
                    </div>
                  </div>
                )}

                {selData!.weight_kg !== null && (
                  <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                    <span className="text-sm font-semibold text-slate-700">⚖️ Poids</span>
                    <span className="text-xl font-bold text-primary">
                      {selData!.weight_kg}<span className="text-sm font-normal text-slate-500"> kg</span>
                    </span>
                  </div>
                )}

                {selData!.has_measurements && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">📐 Mensurations</p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { key: 'waist_cm',  label: 'Taille'   },
                        { key: 'hips_cm',   label: 'Hanches'  },
                        { key: 'chest_cm',  label: 'Poitrine' },
                        { key: 'arm_cm',    label: 'Bras'     },
                        { key: 'thigh_cm',  label: 'Cuisse'   },
                      ] as const).map(m => {
                        const v = selData![m.key]
                        if (v == null) return null
                        return (
                          <span key={m.key} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500">{m.label} </span>
                            <span className="font-bold text-secondary">{v}cm</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-3xl mb-2">📭</p>
                <p className="text-sm text-slate-400">Aucune donnée pour ce jour</p>
              </div>
            )}

            {/* ── Repas du jour ── */}
            {dayMeals.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Repas</p>
                <div className="flex flex-col gap-1.5">
                  {dayMeals.map(m => (
                    <div key={m.id} className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-slate-700">{m.food_name}</span>
                      <span className="text-xs font-semibold text-slate-500">{m.calories} kcal</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Ajouter eau ── */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                💧 Ajouter de l'eau
              </p>
              <div className="grid grid-cols-4 gap-2">
                {WATER_AMOUNTS.map(ml => (
                  <button
                    key={ml}
                    onClick={() => addWaterForDay(ml)}
                    className="py-2 text-xs bg-blue-50 text-blue-700 font-semibold rounded-lg active:scale-95 transition-all border border-blue-100"
                  >
                    +{ml}ml
                  </button>
                ))}
              </div>
            </div>

            {/* ── Ajouter poids ── */}
            {selData?.weight_kg === null || !selData ? (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  ⚖️ Enregistrer le poids
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="ex: 75.5"
                    value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                  />
                  <button
                    onClick={logWeightForDay}
                    disabled={!weightInput || saving}
                    className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {saving ? '...' : 'OK'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
