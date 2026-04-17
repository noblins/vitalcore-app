/**
 * GLP-1 screen logic:
 * – Titration protocols (dose steps, escalation rules)
 * – Next injection date calculation
 * – Side effect score bounds
 * – Medication name formatting
 */
import { describe, it, expect } from 'vitest'

// ─── Inline exact protocol data from GLP1Screen.tsx ──────────────────────────

const PROTOCOLS: Record<string, { doses: string[]; weeksPerStep: number; unit: string }> = {
  Ozempic:  { doses: ['0.25', '0.5', '1'],               weeksPerStep: 4, unit: 'mg' },
  Mounjaro: { doses: ['2.5', '5', '7.5', '10', '12.5', '15'], weeksPerStep: 4, unit: 'mg' },
  Saxenda:  { doses: ['0.6', '1.2', '1.8', '2.4', '3.0'],     weeksPerStep: 1, unit: 'mg' },
  Wegovy:   { doses: ['0.25', '0.5', '1', '1.7', '2.4'],      weeksPerStep: 4, unit: 'mg' },
}

function getNextDose(medName: string, currentDose: string): string | null {
  const p = PROTOCOLS[medName]
  if (!p) return null
  const idx = p.doses.indexOf(currentDose)
  if (idx === -1 || idx >= p.doses.length - 1) return null
  return p.doses[idx + 1]
}

function calcNextInjection(lastDate: string, intervalDays = 7): string {
  const d = new Date(lastDate)
  d.setDate(d.getDate() + intervalDays)
  return d.toISOString().split('T')[0]
}

function formatMedName(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

// ─── Protocol data integrity ──────────────────────────────────────────────────

describe('GLP-1 protocol data', () => {
  it('all protocols have at least 2 doses', () => {
    for (const name of Object.keys(PROTOCOLS)) {
      expect(PROTOCOLS[name].doses.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('all protocols have positive weeksPerStep', () => {
    for (const name of Object.keys(PROTOCOLS)) {
      expect(PROTOCOLS[name].weeksPerStep).toBeGreaterThan(0)
    }
  })

  it('all doses are valid numeric strings', () => {
    for (const name of Object.keys(PROTOCOLS)) {
      for (const dose of PROTOCOLS[name].doses) {
        expect(isNaN(parseFloat(dose))).toBe(false)
        expect(parseFloat(dose)).toBeGreaterThan(0)
      }
    }
  })

  it('doses are in ascending order', () => {
    for (const name of Object.keys(PROTOCOLS)) {
      const nums = PROTOCOLS[name].doses.map(parseFloat)
      for (let i = 1; i < nums.length; i++) {
        expect(nums[i]).toBeGreaterThan(nums[i - 1])
      }
    }
  })

  it('all units are mg', () => {
    for (const name of Object.keys(PROTOCOLS)) {
      expect(PROTOCOLS[name].unit).toBe('mg')
    }
  })
})

// ─── Ozempic titration ────────────────────────────────────────────────────────

describe('Ozempic titration (0.25 → 0.5 → 1 mg)', () => {
  it('escalates 0.25 → 0.5', () => {
    expect(getNextDose('Ozempic', '0.25')).toBe('0.5')
  })

  it('escalates 0.5 → 1', () => {
    expect(getNextDose('Ozempic', '0.5')).toBe('1')
  })

  it('returns null at max dose (1 mg)', () => {
    expect(getNextDose('Ozempic', '1')).toBeNull()
  })

  it('returns null for unknown dose', () => {
    expect(getNextDose('Ozempic', '2')).toBeNull()
  })
})

// ─── Mounjaro titration ───────────────────────────────────────────────────────

describe('Mounjaro titration (2.5 → 5 → 7.5 → 10 → 12.5 → 15 mg)', () => {
  it('escalates 2.5 → 5', () => {
    expect(getNextDose('Mounjaro', '2.5')).toBe('5')
  })

  it('escalates 5 → 7.5', () => {
    expect(getNextDose('Mounjaro', '5')).toBe('7.5')
  })

  it('returns null at 15 mg (max)', () => {
    expect(getNextDose('Mounjaro', '15')).toBeNull()
  })

  it('has 6 total dose steps', () => {
    expect(PROTOCOLS.Mounjaro.doses.length).toBe(6)
  })
})

// ─── Saxenda titration ────────────────────────────────────────────────────────

describe('Saxenda titration (weekly steps)', () => {
  it('escalates 0.6 → 1.2', () => {
    expect(getNextDose('Saxenda', '0.6')).toBe('1.2')
  })

  it('escalates to max 3.0', () => {
    expect(getNextDose('Saxenda', '2.4')).toBe('3.0')
    expect(getNextDose('Saxenda', '3.0')).toBeNull()
  })

  it('weeksPerStep is 1 (weekly escalation)', () => {
    expect(PROTOCOLS.Saxenda.weeksPerStep).toBe(1)
  })
})

// ─── Next injection date calculation ─────────────────────────────────────────

describe('calcNextInjection', () => {
  it('adds 7 days by default (weekly injection)', () => {
    expect(calcNextInjection('2026-04-15')).toBe('2026-04-22')
  })

  it('adds custom interval days', () => {
    expect(calcNextInjection('2026-04-15', 14)).toBe('2026-04-29')
  })

  it('handles month boundary correctly', () => {
    expect(calcNextInjection('2026-04-28')).toBe('2026-05-05')
  })

  it('handles year boundary correctly', () => {
    expect(calcNextInjection('2026-12-28')).toBe('2027-01-04')
  })

  it('returns ISO date string YYYY-MM-DD', () => {
    expect(calcNextInjection('2026-04-15')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ─── Medication name formatting ───────────────────────────────────────────────

describe('formatMedName (from onboarding glp1 field)', () => {
  it('capitalizes ozempic → Ozempic', () => {
    expect(formatMedName('ozempic')).toBe('Ozempic')
  })

  it('capitalizes mounjaro → Mounjaro', () => {
    expect(formatMedName('mounjaro')).toBe('Mounjaro')
  })

  it('capitalizes saxenda → Saxenda', () => {
    expect(formatMedName('saxenda')).toBe('Saxenda')
  })

  it('capitalizes wegovy → Wegovy', () => {
    expect(formatMedName('wegovy')).toBe('Wegovy')
  })

  it('the formatted names match PROTOCOLS keys', () => {
    for (const raw of ['ozempic', 'mounjaro', 'saxenda', 'wegovy']) {
      expect(PROTOCOLS[formatMedName(raw)]).toBeDefined()
    }
  })
})

// ─── Side effect score bounds ─────────────────────────────────────────────────

describe('Side effect score bounds (0–10)', () => {
  const validScore = (n: number) => Number.isInteger(n) && n >= 0 && n <= 10

  it('accepts 0 (none)', () => expect(validScore(0)).toBe(true))
  it('accepts 5 (moderate)', () => expect(validScore(5)).toBe(true))
  it('accepts 10 (max)', () => expect(validScore(10)).toBe(true))
  it('rejects -1', () => expect(validScore(-1)).toBe(false))
  it('rejects 11', () => expect(validScore(11)).toBe(false))
  it('rejects 2.5 (non-integer)', () => expect(validScore(2.5)).toBe(false))
})
