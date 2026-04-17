import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { sb } from '../../../lib/supabase'
import { todayISO } from '../../../utils/calculations'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import { Alert } from '../../../components/ui/Card'
import type { DashboardHook } from '../../../hooks/useDashboardData'
import type { WeightLog, BodyMeasurement } from '../../../types'

// ── Measurements config ──────────────────────────────────────────────────────
const MEASURES = [
  { key: 'waist_cm',  label: 'Taille',   icon: '📏', color: 'text-primary' },
  { key: 'hips_cm',   label: 'Hanches',  icon: '📐', color: 'text-secondary' },
  { key: 'chest_cm',  label: 'Poitrine', icon: '📏', color: 'text-purple-500' },
  { key: 'arm_cm',    label: 'Bras',     icon: '💪', color: 'text-orange-500' },
  { key: 'thigh_cm',  label: 'Cuisse',   icon: '🦵', color: 'text-pink-500' },
] as const

type MeasureKey = typeof MEASURES[number]['key']

// ── SVG color palette ────────────────────────────────────────────────────────
const C_TEAL    = '#4fd1c5'
const C_TEAL_DK = '#0f766e'
const C_BLUE    = '#3b82f6'
const C_ORANGE  = '#f97316'

// ── SVG Weight Chart ─────────────────────────────────────────────────────────
function WeightChart({ logs, targetWeight }: { logs: WeightLog[]; targetWeight: number }) {
  const sorted = [...logs].sort((a, b) => a.logged_date.localeCompare(b.logged_date)).slice(-20)
  if (sorted.length < 2) return (
    <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
      Ajoutez au moins 2 mesures pour voir le graphique
    </div>
  )

  const W = 320, H = 140
  const pad = { l: 36, r: 16, t: 16, b: 28 }
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b
  const weights = sorted.map(d => d.weight_kg)
  const allW = [...weights, targetWeight]
  const minW = Math.floor(Math.min(...allW)) - 0.5
  const maxW = Math.ceil(Math.max(...allW)) + 0.5
  const xPos = (i: number) => pad.l + (i / (sorted.length - 1)) * cW
  const yPos = (w: number) => pad.t + cH - ((w - minW) / (maxW - minW)) * cH
  const linePath = sorted.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(d.weight_kg).toFixed(1)}`).join(' ')
  const areaPath = linePath + ` L${xPos(sorted.length - 1).toFixed(1)},${(pad.t + cH).toFixed(1)} L${xPos(0).toFixed(1)},${(pad.t + cH).toFixed(1)} Z`
  const targetY = yPos(targetWeight)
  const ticks = [minW + 0.5, Math.round((minW + maxW) / 2 * 2) / 2, maxW - 0.5]
  const firstDate = new Date(sorted[0].logged_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const lastDate  = new Date(sorted[sorted.length - 1].logged_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={C_TEAL} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C_TEAL} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => <line key={i} x1={pad.l} y1={yPos(t)} x2={W - pad.r} y2={yPos(t)} stroke="#f1f5f9" strokeWidth="1" />)}
      <path d={areaPath} fill="url(#wGrad)" />
      <line x1={pad.l} y1={targetY} x2={W - pad.r} y2={targetY} stroke={C_BLUE} strokeWidth="1.5" strokeDasharray="5 3" />
      <text x={W - pad.r - 2} y={targetY - 5} fontSize="8.5" fill={C_BLUE} textAnchor="end" fontWeight="600">Objectif {targetWeight}kg</text>
      <path d={linePath} fill="none" stroke={C_TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {sorted.map((d, i) => (
        <g key={i}>
          <circle cx={xPos(i)} cy={yPos(d.weight_kg)} r={i === sorted.length - 1 ? 5 : 3} fill="white" stroke={C_TEAL} strokeWidth="2" />
          {i === sorted.length - 1 && (
            <text x={xPos(i)} y={yPos(d.weight_kg) - 9} fontSize="10.5" fill={C_TEAL_DK} textAnchor="middle" fontWeight="700">{d.weight_kg}kg</text>
          )}
        </g>
      ))}
      {ticks.map((t, i) => <text key={i} x={pad.l - 5} y={yPos(t) + 4} fontSize="9" fill="#94a3b8" textAnchor="end">{t}</text>)}
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + cH} stroke="#e2e8f0" />
      <line x1={pad.l} y1={pad.t + cH} x2={W - pad.r} y2={pad.t + cH} stroke="#e2e8f0" />
      <text x={pad.l} y={H - 4} fontSize="9" fill="#94a3b8">{firstDate}</text>
      <text x={W - pad.r} y={H - 4} fontSize="9" fill="#94a3b8" textAnchor="end">{lastDate}</text>
    </svg>
  )
}

// ── Measurement trend mini-chart ─────────────────────────────────────────────
function MiniTrendChart({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const W = 80, H = 28
  const min = Math.min(...values) - 0.5
  const max = Math.max(...values) + 0.5
  const xP = (i: number) => (i / (values.length - 1)) * W
  const yP = (v: number) => H - ((v - min) / (max - min)) * H
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xP(i).toFixed(1)},${yP(v).toFixed(1)}`).join(' ')
  const trend = values[values.length - 1] - values[0]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-20 h-7">
      <path d={path} fill="none" stroke={trend <= 0 ? C_TEAL : C_ORANGE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function WeightScreen({ data }: { data: DashboardHook }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { weightLogs, measurementLogs, reload } = data

  // Weight form
  const [weightInput, setWeightInput] = useState('')
  const [noteInput, setNoteInput]     = useState('')
  const [weightMsg, setWeightMsg]     = useState('')
  const [loadingW, setLoadingW]       = useState(false)

  // Measurement form
  const [showMeasForm, setShowMeasForm] = useState(false)
  const [measInputs, setMeasInputs]     = useState<Partial<Record<MeasureKey, string>>>({})
  const [measNote, setMeasNote]         = useState('')
  const [measMsg, setMeasMsg]           = useState('')
  const [loadingM, setLoadingM]         = useState(false)

  const currentWeight = weightLogs[0]?.weight_kg ?? profile?.weight_kg ?? 0
  const targetWeight  = profile?.target_weight_kg ?? 0
  const startWeight   = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight_kg : (profile?.weight_kg ?? 0)
  const totalChange   = currentWeight - startWeight
  const toGo         = currentWeight - targetWeight
  const progressPct  = startWeight !== targetWeight
    ? Math.min(Math.max((startWeight - currentWeight) / (startWeight - targetWeight) * 100, 0), 100)
    : 100

  const sortedLogs = [...weightLogs].sort((a, b) => a.logged_date.localeCompare(b.logged_date))

  // Latest measurements
  const latestMeas: Partial<Record<MeasureKey, number>> = {}
  if (measurementLogs.length > 0) {
    for (const m of MEASURES) {
      const val = measurementLogs.find(l => l[m.key] != null)?.[m.key]
      if (val != null) latestMeas[m.key] = val as number
    }
  }

  // Trend values per measurement (last 5 entries that have the field)
  const measureTrend = (key: MeasureKey) =>
    measurementLogs
      .filter(l => l[key] != null)
      .slice(0, 5)
      .map(l => l[key] as number)
      .reverse()

  const logWeight = async () => {
    if (!weightInput || !user) return
    const w = parseFloat(weightInput)
    if (isNaN(w) || w < 20 || w > 500) { setWeightMsg('Poids invalide'); return }
    setLoadingW(true)
    const today = todayISO()
    const { data: existing } = await sb.from('weight_logs')
      .select('id').eq('user_id', user.id).eq('logged_date', today).maybeSingle()
    if (existing) {
      await sb.from('weight_logs').update({ weight_kg: w, notes: noteInput || null }).eq('id', existing.id)
    } else {
      await sb.from('weight_logs').insert({ user_id: user.id, weight_kg: w, logged_date: today, notes: noteInput || null })
    }
    await sb.from('profiles').update({ weight_kg: w }).eq('id', user.id)
    setWeightInput(''); setNoteInput('')
    setWeightMsg('Poids enregistré ✓')
    setTimeout(() => setWeightMsg(''), 3000)
    setLoadingW(false)
    await reload()
  }

  const logMeasurements = async () => {
    if (!user) return
    const hasAny = MEASURES.some(m => measInputs[m.key] && measInputs[m.key] !== '')
    if (!hasAny) return
    setLoadingM(true)
    const row: Record<string, unknown> = { user_id: user.id, logged_date: todayISO(), notes: measNote || null }
    for (const m of MEASURES) {
      const v = measInputs[m.key]
      row[m.key] = v ? parseFloat(v) : null
    }
    await sb.from('body_measurements').insert(row)
    setMeasInputs({}); setMeasNote('')
    setMeasMsg('Mensurations enregistrées ✓')
    setTimeout(() => setMeasMsg(''), 3000)
    setLoadingM(false)
    setShowMeasForm(false)
    await reload()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="text-white/80 text-xl leading-none">←</button>
        <h1 className="text-xl font-bold">Suivi du Corps</h1>
      </div>

      <div className="p-4 flex flex-col gap-4">

        {/* ── POIDS ── */}
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Poids</p>

        {weightMsg && <Alert type="success">{weightMsg}</Alert>}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Actuel',   val: `${currentWeight}kg`, color: 'text-primary' },
            { label: 'Objectif', val: `${targetWeight}kg`,  color: 'text-secondary' },
            { label: 'Restant',  val: `${toGo > 0 ? '-' : '+'}${Math.abs(toGo).toFixed(1)}kg`, color: toGo > 0 ? 'text-orange-500' : 'text-green-500' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 text-center shadow-sm border border-slate-100">
              <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progress */}
        <Card>
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-semibold text-slate-700">Progression vers l'objectif</p>
            <p className="text-sm font-bold text-primary">{progressPct.toFixed(0)}%</p>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Départ: {startWeight}kg</span>
            {totalChange !== 0 && (
              <span className={totalChange < 0 ? 'text-green-600 font-semibold' : 'text-orange-500 font-semibold'}>
                {totalChange > 0 ? '+' : ''}{totalChange.toFixed(1)}kg depuis le début
              </span>
            )}
            <span>Cible: {targetWeight}kg</span>
          </div>
        </Card>

        {/* Chart */}
        <Card>
          <p className="text-sm font-semibold text-slate-700 mb-3">Évolution du poids</p>
          <WeightChart logs={sortedLogs} targetWeight={targetWeight} />
        </Card>

        {/* Log weight */}
        <Card>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-slate-700">Enregistrer mon poids</p>
            <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
              📅 {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            </span>
          </div>
          <div className="flex gap-2 mb-3">
            <Input
              type="number" step="0.1"
              placeholder={`${currentWeight || '75'} kg`}
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Note (optionnel)"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              className="flex-1"
            />
          </div>
          <Button fullWidth onClick={logWeight} disabled={loadingW || !weightInput}>
            {loadingW ? 'Enregistrement...' : '⚖️ Enregistrer le poids'}
          </Button>
        </Card>

        {/* Weight history */}
        {weightLogs.length > 0 && (
          <Card>
            <p className="text-sm font-semibold text-slate-700 mb-3">Historique poids</p>
            <div className="flex flex-col gap-2">
              {weightLogs.slice(0, 10).map((log, i) => {
                const prev = weightLogs[i + 1]
                const diff = prev ? log.weight_kg - prev.weight_kg : 0
                return (
                  <div key={log.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5">
                    <div>
                      <span className="text-sm font-semibold text-slate-800">{log.weight_kg} kg</span>
                      {log.notes && <span className="text-xs text-slate-500 ml-2">{log.notes}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      {prev && diff !== 0 && (
                        <span className={`text-xs font-semibold ${diff < 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}kg
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {new Date(log.logged_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* ── MENSURATIONS ── */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mensurations</p>
        </div>

        {measMsg && <Alert type="success">{measMsg}</Alert>}

        {/* Latest measurements overview */}
        {Object.keys(latestMeas).length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {MEASURES.map(m => {
              const val = latestMeas[m.key]
              if (val == null) return null
              const trend = measureTrend(m.key)
              const prev  = measurementLogs.filter(l => l[m.key] != null)[1]?.[m.key] as number | undefined
              const diff  = prev != null ? val - prev : null
              return (
                <div key={m.key} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs text-slate-500">{m.icon} {m.label}</span>
                    {diff != null && (
                      <span className={`text-[10px] font-bold ${diff <= 0 ? 'text-green-500' : 'text-orange-500'}`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}cm
                      </span>
                    )}
                  </div>
                  <p className={`text-xl font-bold ${m.color}`}>{val}<span className="text-xs font-normal text-slate-400"> cm</span></p>
                  {trend.length >= 2 && <MiniTrendChart values={trend} />}
                </div>
              )
            }).filter(Boolean)}
          </div>
        )}

        {/* Log measurements form */}
        <Card>
          <button
            onClick={() => setShowMeasForm(s => !s)}
            className="w-full flex justify-between items-center"
          >
            <div>
              <p className="text-sm font-semibold text-slate-700">📐 Enregistrer mes mensurations</p>
              <p className="text-xs text-slate-400 mt-0.5 text-left">
                📅 {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
              </p>
            </div>
            <span className="text-slate-400 text-lg">{showMeasForm ? '▲' : '▼'}</span>
          </button>

          {showMeasForm && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                {MEASURES.map(m => (
                  <div key={m.key}>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">
                      {m.icon} {m.label} (cm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder={latestMeas[m.key] != null ? `${latestMeas[m.key]}` : '—'}
                      value={measInputs[m.key] ?? ''}
                      onChange={e => setMeasInputs(prev => ({ ...prev, [m.key]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                ))}
              </div>
              <Input
                placeholder="Notes (optionnel)"
                value={measNote}
                onChange={e => setMeasNote(e.target.value)}
              />
              <Button
                fullWidth
                onClick={logMeasurements}
                disabled={loadingM || !MEASURES.some(m => measInputs[m.key])}
              >
                {loadingM ? 'Enregistrement...' : '📐 Enregistrer les mensurations'}
              </Button>
            </div>
          )}
        </Card>

        {/* Measurements history */}
        {measurementLogs.length > 0 && (
          <Card>
            <p className="text-sm font-semibold text-slate-700 mb-3">Historique mensurations</p>
            <div className="flex flex-col gap-3">
              {measurementLogs.slice(0, 8).map(log => (
                <div key={log.id} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-slate-500 mb-2">
                    {new Date(log.logged_date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {MEASURES.map(m => {
                      const v = log[m.key]
                      if (v == null) return null
                      return (
                        <span key={m.key} className="text-xs bg-white rounded-lg px-2 py-1 border border-slate-200">
                          <span className="text-slate-500">{m.label}</span>{' '}
                          <span className={`font-bold ${m.color}`}>{v}cm</span>
                        </span>
                      )
                    })}
                  </div>
                  {log.notes && <p className="text-xs text-slate-400 mt-1.5">{log.notes}</p>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
