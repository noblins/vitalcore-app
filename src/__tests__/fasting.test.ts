/**
 * Fasting screen logic — protocol info, phase detection, eating window calc,
 * protocol recommendation, streak logic.
 */
import { describe, it, expect } from 'vitest'
import { formatHours } from '../utils/calculations'

// ─── Inline the exact logic from FastingScreen.tsx ───────────────────────────

const PROTOCOL_INFO: Record<string, {
  eating: number; fast: number; description: string; intensity: string
  suitableGoals: string[]
}> = {
  '16:8':  { eating: 8,  fast: 16, description: 'Le plus populaire', intensity: 'Modéré',    suitableGoals: ['lose','maintain','gain','health'] },
  '18:6':  { eating: 6,  fast: 18, description: 'Perte de poids',    intensity: 'Intensif',  suitableGoals: ['lose','health'] },
  '20:4':  { eating: 4,  fast: 20, description: 'Régime guerrier',   intensity: 'Très intensif', suitableGoals: ['lose'] },
  '14:10': { eating: 10, fast: 14, description: 'Débutant',          intensity: 'Doux',       suitableGoals: ['maintain','health','gain'] },
  '5:2':   { eating: 0,  fast: 0,  description: '5 jours normaux',   intensity: 'Modéré',    suitableGoals: ['lose','health'] },
}

const PHASES = [
  { h: 4,  label: 'Stabilisation glycémique',  color: 'bg-blue-400',   icon: '🩸' },
  { h: 8,  label: 'Épuisement du glycogène',   color: 'bg-yellow-400', icon: '⚡' },
  { h: 12, label: 'Début de cétose',            color: 'bg-orange-400', icon: '🔥' },
  { h: 16, label: 'Lipolyse active',            color: 'bg-red-400',    icon: '💪' },
  { h: 18, label: 'Autophagie débutante',       color: 'bg-purple-400', icon: '🧬' },
  { h: 20, label: 'Cétose profonde',            color: 'bg-purple-600', icon: '🌟' },
  { h: 24, label: 'Autophagie maximale',        color: 'bg-indigo-600', icon: '✨' },
]

function getRecommended(goal: string, hasMed: boolean): string {
  if (hasMed) return '16:8'
  if (goal === 'lose') return '18:6'
  if (goal === 'gain') return '14:10'
  return '16:8'
}

function getElapsed(startedAt: string): number {
  return (Date.now() - new Date(startedAt).getTime()) / 3_600_000
}

function getCurrentPhase(elapsed: number) {
  return [...PHASES].reverse().find(p => elapsed >= p.h) ?? null
}

function getNextPhase(elapsed: number) {
  return PHASES.find(p => p.h > elapsed) ?? null
}

function getEatingWindowStart(startedAt: string, protocol: string): Date {
  const info = PROTOCOL_INFO[protocol]
  if (!info || info.fast === 0) return new Date(startedAt)
  const start = new Date(startedAt)
  start.setTime(start.getTime() + info.fast * 3_600_000)
  return start
}

function getEatingWindowEnd(startedAt: string, protocol: string): Date {
  const info = PROTOCOL_INFO[protocol]
  if (!info || info.fast === 0) return new Date(startedAt)
  const start = getEatingWindowStart(startedAt, protocol)
  start.setTime(start.getTime() + info.eating * 3_600_000)
  return start
}

function isEatingWindowOpen(startedAt: string, protocol: string): boolean {
  const now = Date.now()
  const open  = getEatingWindowStart(startedAt, protocol).getTime()
  const close = getEatingWindowEnd(startedAt, protocol).getTime()
  return now >= open && now <= close
}

// ─── Protocol info ────────────────────────────────────────────────────────────

describe('PROTOCOL_INFO correctness', () => {
  it('16:8 eating + fasting = 24h', () => {
    const p = PROTOCOL_INFO['16:8']
    expect(p.eating + p.fast).toBe(24)
  })

  it('18:6 eating + fasting = 24h', () => {
    const p = PROTOCOL_INFO['18:6']
    expect(p.eating + p.fast).toBe(24)
  })

  it('20:4 eating + fasting = 24h', () => {
    const p = PROTOCOL_INFO['20:4']
    expect(p.eating + p.fast).toBe(24)
  })

  it('14:10 eating + fasting = 24h', () => {
    const p = PROTOCOL_INFO['14:10']
    expect(p.eating + p.fast).toBe(24)
  })

  it('all protocols have suitableGoals array', () => {
    for (const key of Object.keys(PROTOCOL_INFO)) {
      expect(Array.isArray(PROTOCOL_INFO[key].suitableGoals)).toBe(true)
      expect(PROTOCOL_INFO[key].suitableGoals.length).toBeGreaterThan(0)
    }
  })

  it('all protocols have non-empty descriptions', () => {
    for (const key of Object.keys(PROTOCOL_INFO)) {
      expect(PROTOCOL_INFO[key].description.length).toBeGreaterThan(0)
    }
  })
})

// ─── Protocol recommendation ─────────────────────────────────────────────────

describe('getRecommended', () => {
  it('recommends 16:8 for GLP-1 users regardless of goal', () => {
    expect(getRecommended('lose',     true)).toBe('16:8')
    expect(getRecommended('gain',     true)).toBe('16:8')
    expect(getRecommended('maintain', true)).toBe('16:8')
  })

  it('recommends 18:6 for non-GLP-1 lose goal', () => {
    expect(getRecommended('lose', false)).toBe('18:6')
  })

  it('recommends 14:10 for gain goal', () => {
    expect(getRecommended('gain', false)).toBe('14:10')
  })

  it('recommends 16:8 as default (maintain, health)', () => {
    expect(getRecommended('maintain', false)).toBe('16:8')
    expect(getRecommended('health',   false)).toBe('16:8')
  })

  it('recommended protocol is always a valid key', () => {
    const goals = ['lose', 'gain', 'maintain', 'health']
    const meds  = [true, false]
    for (const g of goals) {
      for (const m of meds) {
        expect(PROTOCOL_INFO[getRecommended(g, m)]).toBeDefined()
      }
    }
  })
})

// ─── Physiological phases ─────────────────────────────────────────────────────

describe('Phase detection', () => {
  it('returns null before 4h', () => {
    expect(getCurrentPhase(3.9)).toBeNull()
  })

  it('detects glycemia phase at 4h', () => {
    expect(getCurrentPhase(4)!.label).toContain('glyc')
  })

  it('detects ketosis onset at 12h', () => {
    expect(getCurrentPhase(12)!.h).toBe(12)
  })

  it('detects lipolysis at 16h', () => {
    expect(getCurrentPhase(16)!.h).toBe(16)
  })

  it('detects max autophagy at 24h', () => {
    expect(getCurrentPhase(24)!.h).toBe(24)
  })

  it('phases are in ascending order', () => {
    for (let i = 1; i < PHASES.length; i++) {
      expect(PHASES[i].h).toBeGreaterThan(PHASES[i - 1].h)
    }
  })

  it('getNextPhase returns next milestone', () => {
    expect(getNextPhase(0)!.h).toBe(4)
    expect(getNextPhase(4)!.h).toBe(8)
    expect(getNextPhase(16)!.h).toBe(18)
  })

  it('getNextPhase returns null at or after last phase', () => {
    expect(getNextPhase(24)).toBeNull()
    expect(getNextPhase(30)).toBeNull()
  })
})

// ─── Eating window calculation ────────────────────────────────────────────────

describe('Eating window calculation', () => {
  it('16:8 window opens 16h after start', () => {
    const start = new Date(Date.now() - 16 * 3_600_000 - 1).toISOString()
    const windowStart = getEatingWindowStart(start, '16:8')
    expect(windowStart.getTime()).toBeCloseTo(Date.now() - 1, -3)
  })

  it('16:8 eating window = 8 hours', () => {
    const start = new Date(Date.now()).toISOString()
    const open  = getEatingWindowStart(start, '16:8')
    const close = getEatingWindowEnd(start, '16:8')
    const durationH = (close.getTime() - open.getTime()) / 3_600_000
    expect(durationH).toBe(8)
  })

  it('18:6 eating window = 6 hours', () => {
    const start = new Date(Date.now()).toISOString()
    const open  = getEatingWindowStart(start, '18:6')
    const close = getEatingWindowEnd(start, '18:6')
    const durationH = (close.getTime() - open.getTime()) / 3_600_000
    expect(durationH).toBe(6)
  })

  it('eating window is closed during fast period', () => {
    // Started 8h ago — for 16:8, window opens at 16h, so still closed
    const start = new Date(Date.now() - 8 * 3_600_000).toISOString()
    expect(isEatingWindowOpen(start, '16:8')).toBe(false)
  })

  it('eating window is open after fast period', () => {
    // Started 17h ago — for 16:8, window opened 1h ago (still within 8h window)
    const start = new Date(Date.now() - 17 * 3_600_000).toISOString()
    expect(isEatingWindowOpen(start, '16:8')).toBe(true)
  })

  it('eating window is closed after eating period', () => {
    // Started 25h ago — for 16:8, window closed 1h ago (16+8=24, now 25h)
    const start = new Date(Date.now() - 25 * 3_600_000).toISOString()
    expect(isEatingWindowOpen(start, '16:8')).toBe(false)
  })
})

// ─── Elapsed time ─────────────────────────────────────────────────────────────

describe('getElapsed', () => {
  it('returns ~0 for just started fast', () => {
    const start = new Date().toISOString()
    expect(getElapsed(start)).toBeCloseTo(0, 1)
  })

  it('returns ~16 for fast started 16h ago', () => {
    const start = new Date(Date.now() - 16 * 3_600_000).toISOString()
    expect(getElapsed(start)).toBeCloseTo(16, 1)
  })

  it('returns positive value always', () => {
    const start = new Date(Date.now() - 1000).toISOString()
    expect(getElapsed(start)).toBeGreaterThan(0)
  })
})

// ─── formatHours (used in fasting timer display) ─────────────────────────────

describe('formatHours for fasting timer', () => {
  it('formats 16h remaining correctly', () => {
    expect(formatHours(16)).toBe('16:00')
  })

  it('formats 3.5h remaining as 3:30', () => {
    expect(formatHours(3.5)).toBe('3:30')
  })

  it('formats 0.25h (15min) as 0:15', () => {
    expect(formatHours(0.25)).toBe('0:15')
  })
})
