import { describe, it, expect } from 'vitest'
import {
  calcBMR,
  calcTDEE,
  calcAge,
  formatHours,
  todayISO,
  calcMacroTargets,
  moodEmoji,
  moodColor,
} from '../utils/calculations'

// ─── calcBMR ─────────────────────────────────────────────────────────────────

describe('calcBMR', () => {
  it('calculates male BMR correctly (Mifflin-St Jeor)', () => {
    // 10*80 + 6.25*175 - 5*30 + 5 = 1748.75
    expect(calcBMR('male', 80, 175, 30)).toBeCloseTo(1748.75, 2)
  })

  it('calculates female BMR correctly', () => {
    // 10*60 + 6.25*165 - 5*25 - 161 = 1345.25
    expect(calcBMR('female', 60, 165, 25)).toBeCloseTo(1345.25, 2)
  })

  it('returns different value for male vs female with same inputs', () => {
    const male   = calcBMR('male',   75, 170, 35)
    const female = calcBMR('female', 75, 170, 35)
    // Difference is 5 - (-161) = 166
    expect(male - female).toBeCloseTo(166, 1)
  })

  it('handles extreme low weight/height', () => {
    expect(calcBMR('male', 20, 100, 10)).toBeGreaterThan(0)
  })

  it('handles extreme high weight/height', () => {
    expect(calcBMR('male', 500, 250, 110)).toBeGreaterThan(0)
  })

  it('treats unknown gender as female formula', () => {
    expect(calcBMR('other', 70, 170, 30)).toBeCloseTo(calcBMR('female', 70, 170, 30), 2)
  })
})

// ─── calcTDEE ────────────────────────────────────────────────────────────────

describe('calcTDEE', () => {
  const BMR = 2000

  it('sedentary × 1.2', () => expect(calcTDEE(BMR, 'sedentary')).toBe(2400))
  it('light × 1.375',   () => expect(calcTDEE(BMR, 'light')).toBe(2750))
  it('moderate × 1.55', () => expect(calcTDEE(BMR, 'moderate')).toBe(3100))
  it('active × 1.725',  () => expect(calcTDEE(BMR, 'active')).toBe(3450))
  it('very_active × 1.9', () => expect(calcTDEE(BMR, 'very_active')).toBe(3800))

  it('unknown activity defaults to sedentary (1.2)', () => {
    expect(calcTDEE(BMR, 'couch_potato')).toBe(2400)
    expect(calcTDEE(BMR, '')).toBe(2400)
  })

  it('returns a rounded integer', () => {
    const result = calcTDEE(1748.75, 'moderate')
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(2711)
  })

  it('scales proportionally with BMR', () => {
    expect(calcTDEE(1000, 'active')).toBe(Math.round(1000 * 1.725))
    expect(calcTDEE(3000, 'active')).toBe(Math.round(3000 * 1.725))
  })
})

// ─── calcAge ─────────────────────────────────────────────────────────────────

describe('calcAge', () => {
  it('calculates age when birthday already passed this year', () => {
    const year = new Date().getFullYear()
    const past = `${year - 30}-01-01`       // Jan 1st — already past
    expect(calcAge(past)).toBe(30)
  })

  it('calculates age when birthday not yet this year', () => {
    const year = new Date().getFullYear()
    const future = `${year - 30}-12-31`     // Dec 31st — not yet
    expect(calcAge(future)).toBe(29)
  })

  it('returns whole number integer', () => {
    expect(Number.isInteger(calcAge('1990-06-15'))).toBe(true)
  })

  it('works for 10 year olds (onboarding minimum)', () => {
    const year = new Date().getFullYear()
    expect(calcAge(`${year - 10}-01-01`)).toBeGreaterThanOrEqual(10)
  })

  it('works for 110 year olds (onboarding maximum)', () => {
    const year = new Date().getFullYear()
    const age = calcAge(`${year - 110}-01-01`)
    expect(age).toBeGreaterThanOrEqual(109) // allow birthday edge
  })
})

// ─── formatHours ─────────────────────────────────────────────────────────────

describe('formatHours', () => {
  it('formats whole hours', () => {
    expect(formatHours(0)).toBe('0:00')
    expect(formatHours(5)).toBe('5:00')
    expect(formatHours(16)).toBe('16:00')
    expect(formatHours(24)).toBe('24:00')
  })

  it('formats half hours', () => {
    expect(formatHours(0.5)).toBe('0:30')
    expect(formatHours(5.5)).toBe('5:30')
    expect(formatHours(16.5)).toBe('16:30')
  })

  it('formats quarter hours', () => {
    expect(formatHours(2.25)).toBe('2:15')
    expect(formatHours(2.75)).toBe('2:45')
  })

  it('pads minutes with leading zero', () => {
    expect(formatHours(3 + 5/60)).toBe('3:05')
  })
})

// ─── todayISO ────────────────────────────────────────────────────────────────

describe('todayISO', () => {
  it('returns ISO date string YYYY-MM-DD', () => {
    const result = todayISO()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matches today date', () => {
    const today = new Date()
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(todayISO()).toBe(expected)
  })
})

// ─── calcMacroTargets ────────────────────────────────────────────────────────

describe('calcMacroTargets', () => {
  const TDEE   = 2500
  const WEIGHT = 75

  describe('lose goal', () => {
    const m = calcMacroTargets(TDEE, WEIGHT, 'lose')

    it('reduces calories by 500', () => {
      expect(m.targetCal).toBe(TDEE - 500) // 2000
    })

    it('uses 2.0g/kg protein', () => {
      expect(m.proteinG).toBe(Math.round(WEIGHT * 2.0)) // 150
    })

    it('returns non-negative carbs', () => {
      expect(m.carbsG).toBeGreaterThanOrEqual(50)
    })

    it('fat is ~27% of calories', () => {
      expect(m.fatG).toBe(Math.round((m.targetCal * 0.27) / 9))
    })
  })

  describe('gain goal', () => {
    const m = calcMacroTargets(TDEE, WEIGHT, 'gain')

    it('adds 300 calories', () => {
      expect(m.targetCal).toBe(TDEE + 300) // 2800
    })

    it('uses 1.8g/kg protein', () => {
      expect(m.proteinG).toBe(Math.round(WEIGHT * 1.8)) // 135
    })
  })

  describe('maintain goal', () => {
    const m = calcMacroTargets(TDEE, WEIGHT, 'maintain')

    it('keeps TDEE unchanged', () => {
      expect(m.targetCal).toBe(TDEE)
    })

    it('uses 1.6g/kg protein', () => {
      expect(m.proteinG).toBe(Math.round(WEIGHT * 1.6))
    })
  })

  describe('minimum calorie floor', () => {
    it('floors lose calories at 1200 when TDEE < 1700', () => {
      // TDEE 1500 - 500 = 1000 → should be clamped to 1200
      const m = calcMacroTargets(1500, 50, 'lose')
      expect(m.targetCal).toBe(1200)
    })

    it('carbsG is at least 50g (safe minimum)', () => {
      // Very low calorie edge case
      const m = calcMacroTargets(1200, 90, 'lose')
      expect(m.carbsG).toBeGreaterThanOrEqual(50)
    })
  })

  describe('macro balance', () => {
    it('protein + carbs + fat calories are within 10% of targetCal', () => {
      const m = calcMacroTargets(TDEE, WEIGHT, 'maintain')
      const totalCals = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9
      expect(Math.abs(totalCals - m.targetCal)).toBeLessThan(m.targetCal * 0.1)
    })
  })
})

// ─── moodEmoji ───────────────────────────────────────────────────────────────

describe('moodEmoji', () => {
  it('returns correct emoji for each level 1-5', () => {
    expect(moodEmoji(1)).toBe('😞')
    expect(moodEmoji(2)).toBe('😔')
    expect(moodEmoji(3)).toBe('😐')
    expect(moodEmoji(4)).toBe('🙂')
    expect(moodEmoji(5)).toBe('😄')
  })

  it('returns empty string for 0 (unset)', () => {
    expect(moodEmoji(0)).toBe('')
  })

  it('returns empty string for out-of-range values', () => {
    expect(moodEmoji(6)).toBe('')
    expect(moodEmoji(-1)).toBe('')
    expect(moodEmoji(100)).toBe('')
  })
})

// ─── moodColor ───────────────────────────────────────────────────────────────

describe('moodColor', () => {
  it('returns correct color for each level 1-5', () => {
    expect(moodColor(1)).toBe('#ef4444') // red
    expect(moodColor(2)).toBe('#f97316') // orange
    expect(moodColor(3)).toBe('#eab308') // yellow
    expect(moodColor(4)).toBe('#22c55e') // green
    expect(moodColor(5)).toBe('#10b981') // emerald
  })

  it('returns empty string for 0 (unset — array slot is empty string)', () => {
    // array[0] = '' so ?? does not trigger ('' is not null/undefined)
    expect(moodColor(0)).toBe('')
  })

  it('returns default slate for truly out-of-range values', () => {
    // array[6] is undefined → ?? '#e2e8f0' kicks in
    expect(moodColor(6)).toBe('#e2e8f0')
    expect(moodColor(-1)).toBe('#e2e8f0')
  })

  it('each mood level has a distinct color', () => {
    const colors = [1, 2, 3, 4, 5].map(moodColor)
    const unique = new Set(colors)
    expect(unique.size).toBe(5)
  })
})
