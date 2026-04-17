import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { sb } from '../../../lib/supabase'
import { todayISO } from '../../../utils/calculations'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import Input, { Select } from '../../../components/ui/Input'
import { Alert } from '../../../components/ui/Card'
import type { DashboardHook } from '../../../hooks/useDashboardData'
import type { InjectionLog, WeightLog } from '../../../types'

// ── SVG color palette ────────────────────────────────────────────────────────
const C_TEAL    = '#4fd1c5'
const C_TEAL_DK = '#0f766e'

// ── Constants ──────────────────────────────────────────────────────────────
const PROTOCOLS: Record<string, string[]> = {
  Ozempic:  ['0.25', '0.5', '1', '2'],
  Mounjaro: ['2.5', '5', '7.5', '10', '12.5', '15'],
  Saxenda:  ['0.6', '1.2', '1.8', '2.4', '3'],
  Wegovy:   ['0.25', '0.5', '1', '1.7', '2.4'],
}
const TITRATION_WEEKS: Record<string, number[]> = {
  Ozempic:  [4, 4, 4, 0],
  Mounjaro: [4, 4, 4, 4, 4, 0],
  Saxenda:  [1, 1, 1, 1, 0],
  Wegovy:   [4, 4, 4, 4, 0],
}
const SITES = [
  { id: 'Abdomen gauche', label: 'Abd. G', emoji: '◐' },
  { id: 'Abdomen droit',  label: 'Abd. D', emoji: '◑' },
  { id: 'Cuisse gauche',  label: 'Cuisse G', emoji: '◐' },
  { id: 'Cuisse droite',  label: 'Cuisse D', emoji: '◑' },
  { id: 'Bras gauche',    label: 'Bras G', emoji: '◐' },
  { id: 'Bras droit',     label: 'Bras D', emoji: '◑' },
]
const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const DAY_JS: Record<string, number> = {
  Dimanche: 0, Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6,
}

function nextInjDate(dayName: string): string {
  const today = new Date()
  const target = DAY_JS[dayName] ?? today.getDay()
  let daysAhead = (target - today.getDay() + 7) % 7
  if (daysAhead === 0) daysAhead = 7
  const next = new Date(today)
  next.setDate(today.getDate() + daysAhead)
  return next.toISOString().slice(0, 10)
}

function daysAgo(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
}

// ── Side-effect rating ──────────────────────────────────────────────────────
function EffectRating({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-600 w-20">{label}</span>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4, 5].map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`w-9 h-9 rounded-full text-xs font-bold transition-all active:scale-95 ${
              v === value
                ? v <= 1 ? 'bg-green-400 text-white'
                  : v <= 3 ? 'bg-orange-400 text-white'
                  : 'bg-red-400 text-white'
                : 'bg-slate-100 text-slate-400'
            }`}
          >{v}</button>
        ))}
      </div>
    </div>
  )
}

// ── Dose bar chart ──────────────────────────────────────────────────────────
function DoseChart({ injLogs }: { injLogs: InjectionLog[] }) {
  const sorted = [...injLogs]
    .sort((a, b) => a.injection_date.localeCompare(b.injection_date))
    .slice(-12)
  if (sorted.length < 2) return (
    <p className="text-xs text-slate-400 text-center py-3">Ajoutez au moins 2 injections pour voir le graphique</p>
  )

  const W = 320, H = 90
  const pad = { l: 28, r: 10, t: 12, b: 22 }
  const doses = sorted.map(l => parseFloat(l.dose) || 0)
  const maxDose = Math.max(...doses, 0.1)
  const bW = (W - pad.l - pad.r) / sorted.length

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {sorted.map((log, i) => {
        const dose = parseFloat(log.dose) || 0
        const bH = Math.max((dose / maxDose) * (H - pad.t - pad.b), 2)
        const x = pad.l + i * bW + bW * 0.1
        const y = H - pad.b - bH
        const date = new Date(log.injection_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
        return (
          <g key={i}>
            <rect x={x} y={y} width={bW * 0.8} height={bH}
              fill={C_TEAL} rx="3" opacity="0.9" />
            <text x={x + bW * 0.4} y={y - 3} fontSize="8"
              textAnchor="middle" fill={C_TEAL_DK} fontWeight="700">{dose}</text>
            {(i === 0 || i === sorted.length - 1) && (
              <text x={x + bW * 0.4} y={H - 4} fontSize="7.5"
                textAnchor="middle" fill="#94a3b8">{date}</text>
            )}
          </g>
        )
      })}
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="#e2e8f0" />
      {[0, maxDose / 2, maxDose].map((v, i) => (
        <text key={i} x={pad.l - 3} y={H - pad.b - (v / maxDose) * (H - pad.t - pad.b) + 3}
          fontSize="8" fill="#94a3b8" textAnchor="end">{v.toFixed(v % 1 === 0 ? 0 : 2)}</text>
      ))}
    </svg>
  )
}

// ── Weight since treatment start ────────────────────────────────────────────
function WeightSinceStart({ weightLogs, startDate }: { weightLogs: WeightLog[]; startDate: string }) {
  const filtered = [...weightLogs]
    .filter(l => l.logged_date >= startDate)
    .sort((a, b) => a.logged_date.localeCompare(b.logged_date))
    .slice(-15)

  if (filtered.length < 2) return (
    <p className="text-xs text-slate-400 text-center py-3">Pas assez de données depuis le début du traitement</p>
  )

  const W = 320, H = 90
  const pad = { l: 34, r: 12, t: 12, b: 22 }
  const cW = W - pad.l - pad.r
  const cH = H - pad.t - pad.b
  const weights = filtered.map(d => d.weight_kg)
  const minW = Math.floor(Math.min(...weights)) - 0.5
  const maxW = Math.ceil(Math.max(...weights)) + 0.5
  const xPos = (i: number) => pad.l + (i / (filtered.length - 1)) * cW
  const yPos = (w: number) => pad.t + cH - ((w - minW) / (maxW - minW)) * cH
  const linePath = filtered.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(d.weight_kg).toFixed(1)}`).join(' ')

  const first = filtered[0]
  const last = filtered[filtered.length - 1]
  const diff = last.weight_kg - first.weight_kg

  return (
    <div>
      <div className="flex justify-between items-center mb-1 text-xs">
        <span className="text-slate-500">Depuis le traitement</span>
        <span className={`font-bold ${diff < 0 ? 'text-green-500' : 'text-orange-500'}`}>
          {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <path d={linePath} fill="none" stroke={C_TEAL} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
        {filtered.map((d, i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(d.weight_kg)} r="3"
            fill="white" stroke={C_TEAL} strokeWidth="2" />
        ))}
        {[minW + 0.5, maxW - 0.5].map((v, i) => (
          <text key={i} x={pad.l - 4} y={yPos(v) + 3} fontSize="8.5"
            fill="#94a3b8" textAnchor="end">{v}</text>
        ))}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + cH} stroke="#e2e8f0" />
        <line x1={pad.l} y1={pad.t + cH} x2={W - pad.r} y2={pad.t + cH} stroke="#e2e8f0" />
        <text x={pad.l} y={H - 4} fontSize="8" fill="#94a3b8">
          {new Date(first.logged_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </text>
        <text x={W - pad.r} y={H - 4} fontSize="8" fill="#94a3b8" textAnchor="end">
          {new Date(last.logged_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </text>
      </svg>
    </div>
  )
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function GLP1Screen({ data }: { data: DashboardHook }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { activeMed, setActiveMed, injLogs, weightLogs, reload } = data

  // Setup form
  const [medName, setMedName]     = useState('')
  const [medDose, setMedDose]     = useState('')
  const [medDay, setMedDay]       = useState('Lundi')

  // Log form
  const [injSite, setInjSite]     = useState('')
  const [injDose, setInjDose]     = useState(activeMed?.dose_current ?? '')
  const [injNote, setInjNote]     = useState('')
  const [nausea, setNausea]       = useState(0)
  const [fatigue, setFatigue]     = useState(0)
  const [pain, setPain]           = useState(0)

  // Settings
  const [showSettings, setShowSettings] = useState(false)
  const [settingsDay, setSettingsDay]   = useState(activeMed?.injection_day ?? 'Lundi')

  const [msg, setMsg]     = useState('')
  const [loading, setLoading] = useState(false)

  // ── Countdown ─────────────────────────────────────────────────────────────
  const daysUntilInj = useMemo(() => {
    if (!activeMed?.next_injection) return null
    const next = new Date(activeMed.next_injection + 'T12:00:00')
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.floor((next.getTime() - today.getTime()) / 86400000)
  }, [activeMed?.next_injection])

  // ── Site rotation ─────────────────────────────────────────────────────────
  const siteLastUsed = useMemo(() => {
    const map: Record<string, string> = {}
    for (const log of [...injLogs].sort((a, b) => b.injection_date.localeCompare(a.injection_date))) {
      if (!map[log.injection_site]) map[log.injection_site] = log.injection_date
    }
    return map
  }, [injLogs])

  const recommendedSite = useMemo(() => {
    let oldest = SITES[0].id; let oldestDate = '9999-99-99'
    for (const s of SITES) {
      const last = siteLastUsed[s.id] ?? '0000-00-00'
      if (last < oldestDate) { oldestDate = last; oldest = s.id }
    }
    return oldest
  }, [siteLastUsed])

  // ── Titration ─────────────────────────────────────────────────────────────
  const titration = useMemo(() => {
    if (!activeMed) return null
    const steps = PROTOCOLS[activeMed.medication_name]
    const weeks = TITRATION_WEEKS[activeMed.medication_name]
    if (!steps) return null
    const idx = steps.indexOf(activeMed.dose_current)
    if (idx === -1) return null
    const requiredWeeks = weeks?.[idx] ?? 4
    const firstAtDose = injLogs
      .filter(l => l.dose === activeMed.dose_current)
      .map(l => l.injection_date)
      .sort()[0]
    const weeksAtDose = firstAtDose
      ? Math.floor((Date.now() - new Date(firstAtDose).getTime()) / (7 * 86400000))
      : 0
    const canIncrease = requiredWeeks > 0 && weeksAtDose >= requiredWeeks && idx < steps.length - 1
    return { steps, idx, requiredWeeks, weeksAtDose, canIncrease, nextDose: steps[idx + 1] ?? null }
  }, [activeMed, injLogs])

  // ── Actions ───────────────────────────────────────────────────────────────
  const setupMed = async () => {
    if (!medName || !user) return
    setLoading(true)
    const startDose = (PROTOCOLS[medName]?.[0] ?? medDose) || '0.25'
    const { data: row } = await sb.from('medications').insert({
      user_id: user.id, medication_name: medName,
      dose_current: startDose, dose_unit: 'mg',
      injection_day: medDay, start_date: todayISO(),
      next_injection: nextInjDate(medDay), active: true,
    }).select().single()
    setActiveMed(row)
    setInjDose(startDose)
    setLoading(false)
  }

  const logInj = async () => {
    if (!activeMed || !injSite || !injDose || !user) return
    setLoading(true)
    await sb.from('injection_logs').insert({
      user_id: user.id, medication_id: activeMed.id,
      injection_date: todayISO(), dose: injDose,
      injection_site: injSite, notes: injNote || null,
      nausea, fatigue, pain,
    })
    const nextInj = nextInjDate(activeMed.injection_day)
    await sb.from('medications')
      .update({ next_injection: nextInj, dose_current: injDose })
      .eq('id', activeMed.id)
    setInjSite(''); setInjNote(''); setNausea(0); setFatigue(0); setPain(0)
    setMsg('Injection enregistrée ✓')
    setTimeout(() => setMsg(''), 3000)
    setLoading(false)
    await reload()
  }

  const saveSettings = async () => {
    if (!activeMed) return
    await sb.from('medications')
      .update({ injection_day: settingsDay, next_injection: nextInjDate(settingsDay) })
      .eq('id', activeMed.id)
    setShowSettings(false)
    await reload()
  }

  const stopMed = async () => {
    if (!activeMed) return
    await sb.from('medications').update({ active: false }).eq('id', activeMed.id)
    setActiveMed(null)
    await reload()
  }

  // ── Countdown display ─────────────────────────────────────────────────────
  const countdownColor = daysUntilInj === null ? '' :
    daysUntilInj < 0 ? 'bg-red-500' :
    daysUntilInj === 0 ? 'bg-orange-500' : 'bg-emerald-500'

  const countdownLabel = daysUntilInj === null ? '' :
    daysUntilInj < 0 ? `En retard de ${Math.abs(daysUntilInj)}j` :
    daysUntilInj === 0 ? "Injection aujourd'hui !" :
    `Dans ${daysUntilInj} jour${daysUntilInj > 1 ? 's' : ''}`

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="text-white/80 text-xl leading-none">←</button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Suivi GLP-1</h1>
          {activeMed && <p className="text-xs opacity-80">{activeMed.medication_name} · {activeMed.dose_current}mg</p>}
        </div>
        {activeMed && (
          <button onClick={() => setShowSettings(s => !s)}
            className="text-white/80 text-lg">⚙️</button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4">
        {msg && <Alert type="success">{msg}</Alert>}

        {/* ── SETTINGS ── */}
        {showSettings && activeMed && (
          <Card>
            <p className="text-sm font-bold text-slate-700 mb-3">Paramètres</p>
            <Select label="Jour d'injection" value={settingsDay} onChange={e => setSettingsDay(e.target.value)}>
              {DAYS_FR.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
            <div className="flex gap-2 mt-3">
              <Button fullWidth onClick={saveSettings}>Enregistrer</Button>
              <button onClick={stopMed}
                className="flex-1 py-2.5 rounded-xl text-red-500 border border-red-200 text-sm font-semibold">
                Arrêter
              </button>
            </div>
          </Card>
        )}

        {/* ── SETUP ── */}
        {!activeMed ? (
          <Card>
            <p className="text-base font-semibold text-slate-800 mb-4">Configurer votre médicament</p>
            <div className="flex flex-col gap-3">
              <Select label="Médicament" value={medName} onChange={e => setMedName(e.target.value)}>
                <option value="">Sélectionner</option>
                {Object.keys(PROTOCOLS).map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Select label="Jour d'injection hebdomadaire" value={medDay} onChange={e => setMedDay(e.target.value)}>
                {DAYS_FR.map(d => <option key={d} value={d}>{d}</option>)}
              </Select>
              {medName && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                  Protocole {medName} : commencer à <strong>{PROTOCOLS[medName][0]}mg</strong>,
                  puis monter progressivement ({TITRATION_WEEKS[medName]?.[0]} semaines par palier).
                </p>
              )}
              <Button fullWidth onClick={setupMed} disabled={!medName || loading}>
                {loading ? 'Configuration...' : 'Configurer'}
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {/* ── COUNTDOWN ── */}
            <div className={`${countdownColor} text-white rounded-2xl p-4 flex items-center justify-between`}>
              <div>
                <p className="text-xs opacity-80 uppercase tracking-wide">Prochaine injection</p>
                <p className="text-2xl font-bold">{countdownLabel}</p>
                <p className="text-xs opacity-80 mt-0.5">
                  {activeMed.next_injection
                    ? new Date(activeMed.next_injection + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                    : ''}
                </p>
              </div>
              <span className="text-4xl">💉</span>
            </div>

            {/* ── TITRATION ── */}
            {titration && (
              <Card>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm font-semibold text-slate-700">Protocole de titration</p>
                  {titration.canIncrease && (
                    <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">
                      Montée possible ↑
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mb-3 flex-wrap">
                  {titration.steps.map((dose, i) => (
                    <React.Fragment key={dose}>
                      <div className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                        i < titration.idx ? 'bg-slate-200 text-slate-400'
                        : i === titration.idx ? 'bg-primary text-white shadow-sm'
                        : 'bg-slate-100 text-slate-400'
                      }`}>
                        {dose}mg
                      </div>
                      {i < titration.steps.length - 1 && (
                        <span className="text-slate-300 text-xs">→</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                {titration.requiredWeeks > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Semaines à cette dose</span>
                      <span className="font-semibold">{titration.weeksAtDose} / {titration.requiredWeeks} sem.</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all"
                        style={{ width: `${Math.min((titration.weeksAtDose / titration.requiredWeeks) * 100, 100)}%` }} />
                    </div>
                    {titration.canIncrease && titration.nextDose && (
                      <p className="text-xs text-green-600 font-semibold mt-2 text-center">
                        Vous pouvez passer à {titration.nextDose}mg — à discuter avec votre médecin
                      </p>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* ── LOG FORM ── */}
            <Card>
              <p className="text-sm font-semibold text-slate-700 mb-4">Logger une injection</p>

              {/* Body map */}
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Site d'injection</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {SITES.map(site => {
                  const last = siteLastUsed[site.id]
                  const isRec = site.id === recommendedSite
                  const isSelected = injSite === site.id
                  return (
                    <button
                      key={site.id}
                      onClick={() => setInjSite(site.id)}
                      className={`flex flex-col items-center p-2.5 rounded-xl border-2 text-center transition-all ${
                        isSelected
                          ? 'bg-secondary border-secondary text-white'
                          : isRec
                          ? 'bg-green-50 border-green-300 text-green-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="text-sm font-bold">{site.label}</span>
                      {isRec && !isSelected && (
                        <span className="text-[10px] font-semibold mt-0.5">⭐ Recommandé</span>
                      )}
                      {last && !isSelected && !isRec && (
                        <span className="text-[10px] mt-0.5 opacity-70">Il y a {daysAgo(last)}j</span>
                      )}
                      {!last && !isSelected && !isRec && (
                        <span className="text-[10px] mt-0.5 opacity-50">Jamais</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Dose */}
              <Input
                label="Dose (mg)"
                type="number"
                placeholder={activeMed.dose_current}
                value={injDose}
                onChange={e => setInjDose(e.target.value)}
                step="0.01"
              />

              {/* Side effects */}
              <div className="mt-4 mb-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Effets secondaires (0 = aucun, 5 = sévère)
                </p>
                <div className="flex flex-col gap-2.5 bg-slate-50 rounded-xl p-3">
                  <EffectRating label="🤢 Nausée"  value={nausea}  onChange={setNausea}  />
                  <EffectRating label="😴 Fatigue" value={fatigue} onChange={setFatigue} />
                  <EffectRating label="🤕 Douleur" value={pain}    onChange={setPain}    />
                </div>
              </div>

              <Input
                label="Notes (optionnel)"
                placeholder="Observations..."
                value={injNote}
                onChange={e => setInjNote(e.target.value)}
              />
              <div className="mt-3">
                <Button fullWidth onClick={logInj} disabled={loading || !injSite || !injDose}>
                  {loading ? 'Enregistrement...' : '💉 Logger l\'injection'}
                </Button>
              </div>
            </Card>

            {/* ── CHARTS ── */}
            {injLogs.length >= 2 && (
              <Card>
                <p className="text-sm font-semibold text-slate-700 mb-3">Évolution des doses</p>
                <DoseChart injLogs={injLogs} />
                {weightLogs.length >= 2 && activeMed.start_date && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-sm font-semibold text-slate-700 mb-3">⚖️ Poids depuis le traitement</p>
                    <WeightSinceStart weightLogs={weightLogs} startDate={activeMed.start_date} />
                  </div>
                )}
              </Card>
            )}

            {/* ── HISTORY ── */}
            {injLogs.length > 0 && (
              <Card>
                <p className="text-sm font-semibold text-slate-700 mb-3">
                  Historique ({injLogs.length} injections)
                </p>
                <div className="flex flex-col gap-2">
                  {injLogs.slice(0, 10).map(log => {
                    const hasEffects = (log.nausea ?? 0) > 0 || (log.fatigue ?? 0) > 0 || (log.pain ?? 0) > 0
                    return (
                      <div key={log.id} className="bg-slate-50 rounded-xl p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              💉 {log.dose}mg · {log.injection_site}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {new Date(log.injection_date + 'T12:00:00').toLocaleDateString('fr-FR', {
                                weekday: 'short', day: 'numeric', month: 'short'
                              })}
                              {log.notes ? ` · ${log.notes}` : ''}
                            </p>
                          </div>
                        </div>
                        {hasEffects && (
                          <div className="flex gap-3 mt-2 text-xs">
                            {(log.nausea ?? 0) > 0 && (
                              <span className={`font-semibold ${(log.nausea ?? 0) >= 4 ? 'text-red-500' : (log.nausea ?? 0) >= 2 ? 'text-orange-500' : 'text-green-600'}`}>
                                🤢 {log.nausea}/5
                              </span>
                            )}
                            {(log.fatigue ?? 0) > 0 && (
                              <span className={`font-semibold ${(log.fatigue ?? 0) >= 4 ? 'text-red-500' : (log.fatigue ?? 0) >= 2 ? 'text-orange-500' : 'text-green-600'}`}>
                                😴 {log.fatigue}/5
                              </span>
                            )}
                            {(log.pain ?? 0) > 0 && (
                              <span className={`font-semibold ${(log.pain ?? 0) >= 4 ? 'text-red-500' : (log.pain ?? 0) >= 2 ? 'text-orange-500' : 'text-green-600'}`}>
                                🤕 {log.pain}/5
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
