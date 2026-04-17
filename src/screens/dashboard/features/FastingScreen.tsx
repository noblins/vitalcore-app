import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { sb } from '../../../lib/supabase'
import { formatHours } from '../../../utils/calculations'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import type { DashboardHook } from '../../../hooks/useDashboardData'

// ── Constants ──────────────────────────────────────────────────────────────────

const PROTOCOLS = ['16:8', '18:6', '20:4', '23:1'] as const
type Protocol = typeof PROTOCOLS[number]
const CIRC = 2 * Math.PI * 50

const PROTOCOL_INFO: Record<Protocol, {
  emoji: string
  eating: number
  desc: string
  intensity: number
  goals: string[]
}> = {
  '16:8': { emoji: '⭐', eating: 8,  desc: 'Le plus populaire. Idéal pour débuter.',           intensity: 2, goals: ['lose','maintain','gain','health'] },
  '18:6': { emoji: '🔥', eating: 6,  desc: 'Perte de poids accélérée. Niveau intermédiaire.',   intensity: 3, goals: ['lose','maintain'] },
  '20:4': { emoji: '💪', eating: 4,  desc: 'Forte autophagie. Niveau avancé.',                  intensity: 4, goals: ['lose'] },
  '23:1': { emoji: '🏆', eating: 1,  desc: 'Un seul repas par jour (OMAD). Expert seulement.',  intensity: 5, goals: ['lose'] },
}

const PHASES = [
  { hours: 4,  icon: '🩸', label: 'Glycémie stable',      desc: 'La glycémie se normalise, l\'insuline chute.' },
  { hours: 8,  icon: '⚡', label: 'Glycogène consommé',    desc: 'Les réserves de glucides du foie s\'épuisent.' },
  { hours: 12, icon: '🔥', label: 'Cétose débute',         desc: 'Votre corps commence à puiser dans les graisses.' },
  { hours: 16, icon: '🚀', label: 'Pic de lipolyse',       desc: 'Combustion des graisses à son maximum.' },
  { hours: 18, icon: '♻️', label: 'Autophagie activée',   desc: 'Nettoyage et recyclage cellulaire en cours.' },
  { hours: 20, icon: '🧠', label: 'Clarté mentale',        desc: 'Concentration et énergie mentale optimales.' },
  { hours: 24, icon: '⭐', label: 'Cétose profonde',        desc: 'Régénération cellulaire intensive.' },
]

function getRecommended(goal: string | undefined, hasMed: boolean): Protocol {
  if (hasMed) return '16:8'
  if (goal === 'lose') return '18:6'
  return '16:8'
}

function getCompatibility(p: Protocol, goal: string | undefined, hasMed: boolean): 'ideal' | 'ok' | 'caution' {
  if (hasMed && p !== '16:8') return 'caution'
  if (!goal || !PROTOCOL_INFO[p].goals.includes(goal)) return 'caution'
  if ((goal === 'lose' && p === '18:6') || p === '16:8') return 'ideal'
  return 'ok'
}

function fmt(d: Date) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FastingScreen({ data }: { data: DashboardHook }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { fastActive, setFastActive, fastHistory, meals, activeMed, reload } = data

  const recommended = getRecommended(profile?.goal, !!activeMed)
  const [protocol, setProtocol] = useState<Protocol>(recommended)
  const [elapsed, setElapsed] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!fastActive) return
    const t = setInterval(() => {
      setElapsed((Date.now() - new Date(fastActive.started_at).getTime()) / 3_600_000)
      setTick(n => n + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [fastActive])

  const start = async () => {
    if (!user) return
    const { data: row } = await sb.from('fasting_sessions').insert({
      user_id: user.id,
      protocol,
      started_at: new Date().toISOString(),
      target_hours: parseInt(protocol),
      completed: false,
    }).select().single()
    setFastActive(row)
    setElapsed(0)
  }

  const stop = async () => {
    if (!fastActive) return
    await sb.from('fasting_sessions').update({
      ended_at: new Date().toISOString(),
      completed: elapsed >= fastActive.target_hours,
    }).eq('id', fastActive.id)
    setFastActive(null)
    await reload()
  }

  // ── Active fast calculations ───────────────────────────────────────────────
  const targetH = fastActive ? fastActive.target_hours : parseInt(protocol)
  const remaining = Math.max(0, targetH - elapsed)
  const progress  = Math.min(elapsed / targetH, 1)
  const dashOffset = CIRC * (1 - progress)

  const eatStart = fastActive ? new Date(new Date(fastActive.started_at).getTime() + targetH * 3_600_000) : null
  const eatEnd   = eatStart ? new Date(eatStart.getTime() + (24 - targetH) * 3_600_000) : null
  const now = new Date()
  const windowOpen = eatStart ? now >= eatStart : false

  const currentPhase = PHASES.filter(p => elapsed >= p.hours).at(-1)
  const nextPhase    = PHASES.find(p => p.hours > elapsed && p.hours <= targetH)

  // ── Stats ──────────────────────────────────────────────────────────────────
  const completedCount = fastHistory.filter(f => f.completed).length

  const streak = useMemo(() => {
    const days = new Set(fastHistory.map(f => f.started_at.slice(0, 10)))
    let count = 0
    const d = new Date()
    while (days.has(d.toISOString().slice(0, 10))) {
      count++
      d.setDate(d.getDate() - 1)
    }
    return count
  }, [fastHistory])

  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const weekCount = fastHistory.filter(f => f.started_at.slice(0, 10) >= weekAgo).length

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="text-white/80 text-xl leading-none">←</button>
        <div>
          <h1 className="text-xl font-bold">Jeûne Intermittent</h1>
          <p className="text-xs opacity-80">
            {fastActive ? `Session en cours · ${fastActive.protocol}` : 'Choisissez votre protocole'}
          </p>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4">

        {/* ── NO ACTIVE FAST ── */}
        {!fastActive && (
          <>
            {/* Smart recommendation */}
            <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Recommandé pour vous</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-slate-800">{recommended}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeMed
                      ? '✅ Compatible avec votre traitement GLP-1'
                      : profile?.goal === 'lose'
                        ? '🎯 Optimisé pour la perte de poids'
                        : profile?.goal === 'gain'
                          ? '💪 Fenêtre suffisante pour le gain musculaire'
                          : '🌿 Idéal pour la santé générale'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400">Objectif calorique</p>
                  <p className="text-sm font-bold text-slate-700">{profile?.tdee ?? '—'} kcal/j</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {profile?.goal === 'lose' ? '↓ Perte de poids' : profile?.goal === 'gain' ? '↑ Prise de masse' : '→ Maintien'}
                  </p>
                </div>
              </div>
            </div>

            {/* Protocol selector */}
            <Card>
              <p className="text-sm font-semibold text-slate-700 mb-3">Protocole</p>
              <div className="flex flex-col gap-2 mb-4">
                {PROTOCOLS.map(p => {
                  const info  = PROTOCOL_INFO[p]
                  const compat = getCompatibility(p, profile?.goal, !!activeMed)
                  const isRec  = p === recommended
                  const isSel  = p === protocol
                  return (
                    <button
                      key={p}
                      onClick={() => setProtocol(p)}
                      className={`flex items-center justify-between rounded-xl px-3 py-3 border-2 transition-all text-left ${
                        isSel ? 'border-primary bg-primary/5' : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${isSel ? 'bg-primary/10' : 'bg-white'}`}>
                          {info.emoji}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-sm font-bold ${isSel ? 'text-primary' : 'text-slate-800'}`}>{p}</span>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="text-xs text-slate-500">{info.eating}h fenêtre repas</span>
                            {isRec && (
                              <span className="text-[9px] bg-primary text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Recommandé</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{info.desc}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 ml-2 shrink-0">
                        {compat === 'caution' && (
                          <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">⚠️ Avancé</span>
                        )}
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className={`w-1 h-3 rounded-sm ${i < info.intensity ? 'bg-primary' : 'bg-slate-100'}`} />
                          ))}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Preview if start now */}
              {(() => {
                const fastH = parseInt(protocol)
                const eatH  = 24 - fastH
                const n     = new Date()
                const ws    = new Date(n.getTime() + fastH * 3_600_000)
                const we    = new Date(ws.getTime() + eatH * 3_600_000)
                return (
                  <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Si vous démarrez maintenant</p>
                    <div className="flex items-center text-center gap-1">
                      <div className="flex-1">
                        <p className="text-[10px] text-slate-400">Début jeûne</p>
                        <p className="text-sm font-bold text-slate-700">{fmt(n)}</p>
                      </div>
                      <div className="text-slate-200 text-lg">›</div>
                      <div className="flex-1">
                        <p className="text-[10px] text-slate-400">Fenêtre repas</p>
                        <p className="text-sm font-bold text-primary">{fmt(ws)}</p>
                      </div>
                      <div className="text-slate-200 text-lg">›</div>
                      <div className="flex-1">
                        <p className="text-[10px] text-slate-400">Fin fenêtre</p>
                        <p className="text-sm font-bold text-slate-600">{fmt(we)}</p>
                      </div>
                    </div>
                  </div>
                )
              })()}

              <Button fullWidth onClick={start}>⏱ Démarrer · {protocol}</Button>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { emoji: '🔥', value: streak > 0 ? `${streak}j` : '—', label: 'Série actuelle' },
                { emoji: '📅', value: `${weekCount}/7`, label: 'Cette semaine' },
                { emoji: '🏆', value: `${completedCount}`, label: 'Total complétés' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl p-3 text-center shadow-sm border border-slate-100">
                  <p className="text-lg mb-1">{s.emoji}</p>
                  <p className="text-xl font-bold text-slate-800">{s.value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* History */}
            {fastHistory.length > 0 && (
              <Card>
                <p className="text-sm font-semibold text-slate-700 mb-3">Dernières sessions</p>
                <div className="flex flex-col gap-3">
                  {fastHistory.slice(0, 7).map(f => {
                    const dur = f.ended_at
                      ? (new Date(f.ended_at).getTime() - new Date(f.started_at).getTime()) / 3_600_000
                      : null
                    const pct = dur && f.target_hours ? Math.min(dur / f.target_hours, 1) : 0
                    return (
                      <div key={f.id} className="flex items-center gap-3">
                        <span className="text-base">{f.completed ? '✅' : '⏹️'}</span>
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-semibold text-slate-700">{f.protocol}</span>
                            <span className="text-xs text-slate-400">
                              {new Date(f.started_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${f.completed ? 'bg-gradient-to-r from-primary to-secondary' : 'bg-slate-300'}`}
                              style={{ width: `${pct * 100}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {dur ? `${dur.toFixed(1)}h` : '?'} / {f.target_hours}h
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </>
        )}

        {/* ── ACTIVE FAST ── */}
        {fastActive && (
          <>
            {/* Circle timer */}
            <Card>
              <div className="flex flex-col items-center mb-4">
                <div className="relative w-44 h-44">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      stroke={progress >= 1 ? '#22c55e' : '#4fd1c5'}
                      strokeWidth="8"
                      strokeDasharray={CIRC}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-bold ${progress >= 1 ? 'text-green-500' : 'text-primary'}`}>
                      {formatHours(elapsed)}
                    </span>
                    <span className="text-xs text-slate-400">sur {fastActive.target_hours}h</span>
                    {progress >= 1 && (
                      <span className="text-[11px] text-green-500 font-bold mt-0.5">✓ Objectif atteint !</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[11px] text-slate-400 mb-1">Écoulé</p>
                  <p className="text-2xl font-bold text-primary">{formatHours(elapsed)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[11px] text-slate-400 mb-1">Restant</p>
                  <p className={`text-2xl font-bold ${remaining === 0 ? 'text-green-500' : 'text-secondary'}`}>
                    {remaining === 0 ? '0:00' : formatHours(remaining)}
                  </p>
                </div>
              </div>

              <Button fullWidth variant="danger" onClick={stop}>⏹ Terminer le jeûne</Button>
            </Card>

            {/* Eating window */}
            {eatStart && eatEnd && (
              <Card>
                <p className="text-sm font-semibold text-slate-700 mb-3">🍽️ Fenêtre alimentaire</p>
                <div className={`rounded-xl p-3 mb-3 ${windowOpen ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-100'}`}>
                  {windowOpen ? (
                    <div>
                      <p className="text-sm font-bold text-green-700">✓ Fenêtre ouverte</p>
                      <p className="text-xs text-green-600 mt-0.5">
                        Ferme à {fmt(eatEnd)} · {PROTOCOL_INFO[fastActive.protocol as Protocol]?.eating ?? (24 - fastActive.target_hours)}h disponibles
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-700">Ouvre à {fmt(eatStart)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Dans {formatHours(remaining)} · {PROTOCOL_INFO[fastActive.protocol as Protocol]?.eating ?? (24 - fastActive.target_hours)}h de fenêtre
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400">Ferme à</p>
                        <p className="text-sm font-semibold text-slate-600">{fmt(eatEnd)}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Today's meals */}
                {meals.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Repas enregistrés aujourd'hui</p>
                    {meals.map(m => (
                      <div key={m.id} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                        <span className="text-sm text-slate-700">{m.food_name}</span>
                        <span className="text-xs font-semibold text-slate-500">{m.calories} kcal</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Fasting phases */}
            <Card>
              <p className="text-sm font-semibold text-slate-700 mb-3">⚗️ Ce qui se passe dans votre corps</p>

              {currentPhase ? (
                <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl p-3 mb-3">
                  <span className="text-2xl">{currentPhase.icon}</span>
                  <p className="text-sm font-bold text-slate-800 mt-1">{currentPhase.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{currentPhase.desc}</p>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-3 mb-3">
                  <p className="text-sm text-slate-500">Phases physiologiques activées à partir de 4h de jeûne.</p>
                </div>
              )}

              {nextPhase && (
                <div className="bg-slate-50 rounded-xl p-3 mb-3">
                  <p className="text-[10px] text-slate-400 mb-1">
                    Prochaine étape dans {formatHours(Math.max(0, nextPhase.hours - elapsed))}
                  </p>
                  <p className="text-sm font-semibold text-slate-600">{nextPhase.icon} {nextPhase.label}</p>
                </div>
              )}

              {/* Milestones */}
              <div className="flex flex-col gap-1.5">
                {PHASES.filter(p => p.hours <= fastActive.target_hours).map(p => (
                  <div key={p.hours} className="flex items-center gap-2.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${
                      elapsed >= p.hours ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {elapsed >= p.hours ? '✓' : p.hours}
                    </div>
                    <span className={`text-xs ${elapsed >= p.hours ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>
                      {p.hours}h · {p.label}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
