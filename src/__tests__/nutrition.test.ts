/**
 * Nutrition tab & meal-related logic:
 * – Macro aggregation (daily totals from meals array)
 * – Meal type calorie targets
 * – Progress bar clamping
 * – Food search / photo scan result parsing
 */
import { describe, it, expect } from 'vitest'
import { calcMacroTargets } from '../utils/calculations'

// ─── Inline the meal-type calorie target logic (SuggestionsScreen) ───────────

const MEAL_TYPE_TARGETS: Record<string, { ratio: number; label: string }> = {
  breakfast: { ratio: 0.25, label: 'Petit-déjeuner' },
  lunch:     { ratio: 0.35, label: 'Déjeuner' },
  snack:     { ratio: 0.10, label: 'Collation' },
  dinner:    { ratio: 0.30, label: 'Dîner' },
}

function getMealTarget(tdee: number, mealType: string): number {
  const ratio = MEAL_TYPE_TARGETS[mealType]?.ratio ?? 0.25
  return Math.round(tdee * ratio)
}

// Macro aggregation from a meals array (mirrors HomeTab / CalendarTab logic)
interface Meal {
  calories: number
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
}

type MacroTotals = { calories: number; protein: number; carbs: number; fat: number }

function sumMacros(meals: Meal[]): MacroTotals {
  return meals.reduce<MacroTotals>(
    (acc, m) => ({
      calories: acc.calories + (m.calories  || 0),
      protein:  acc.protein  + (m.protein_g || 0),
      carbs:    acc.carbs    + (m.carbs_g   || 0),
      fat:      acc.fat      + (m.fat_g     || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

// Progress bar clamping (used throughout the app)
function progressPct(current: number, target: number): number {
  if (!target) return 0
  return Math.min((current / target) * 100, 100)
}

// Photo scan result parsing (mirrors NutritionTab handleScan)
function parseScanResult(data: Record<string, unknown>): {
  food_name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number
} | null {
  const a = (data.analysis ?? data) as Record<string, unknown>
  if (!a.food_name) return null
  return {
    food_name: String(a.food_name),
    calories:  Number(a.calories  ?? 0),
    protein_g: Number(a.protein_g ?? 0),
    carbs_g:   Number(a.carbs_g   ?? 0),
    fat_g:     Number(a.fat_g     ?? 0),
  }
}

// ─── Meal type calorie targets ────────────────────────────────────────────────

describe('Meal type calorie targets', () => {
  const TDEE = 2000

  it('breakfast = 25% of TDEE', () => {
    expect(getMealTarget(TDEE, 'breakfast')).toBe(500)
  })

  it('lunch = 35% of TDEE', () => {
    expect(getMealTarget(TDEE, 'lunch')).toBe(700)
  })

  it('snack = 10% of TDEE', () => {
    expect(getMealTarget(TDEE, 'snack')).toBe(200)
  })

  it('dinner = 30% of TDEE', () => {
    expect(getMealTarget(TDEE, 'dinner')).toBe(600)
  })

  it('all meal targets sum to 100% of TDEE', () => {
    const types = ['breakfast', 'lunch', 'snack', 'dinner']
    const total = types.reduce((sum, t) => sum + getMealTarget(TDEE, t), 0)
    expect(total).toBe(TDEE)
  })

  it('unknown meal type defaults to 25%', () => {
    expect(getMealTarget(TDEE, 'unknown')).toBe(500)
  })

  it('scales correctly with different TDEE', () => {
    expect(getMealTarget(2500, 'lunch')).toBe(Math.round(2500 * 0.35))
  })
})

// ─── Macro aggregation ────────────────────────────────────────────────────────

describe('sumMacros (daily total from meals array)', () => {
  const meals: Meal[] = [
    { calories: 400, protein_g: 30, carbs_g: 45, fat_g: 12 },
    { calories: 600, protein_g: 40, carbs_g: 70, fat_g: 18 },
    { calories: 300, protein_g: 20, carbs_g: 35, fat_g:  8 },
  ]

  it('sums calories correctly', () => {
    expect(sumMacros(meals).calories).toBe(1300)
  })

  it('sums protein correctly', () => {
    expect(sumMacros(meals).protein).toBe(90)
  })

  it('sums carbs correctly', () => {
    expect(sumMacros(meals).carbs).toBe(150)
  })

  it('sums fat correctly', () => {
    expect(sumMacros(meals).fat).toBe(38)
  })

  it('returns all zeros for empty array', () => {
    const result = sumMacros([])
    expect(result).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })

  it('handles null macro values gracefully', () => {
    const withNulls: Meal[] = [
      { calories: 200, protein_g: null, carbs_g: null, fat_g: null },
      { calories: 300, protein_g: 20,   carbs_g: null, fat_g: 10   },
    ]
    const result = sumMacros(withNulls)
    expect(result.calories).toBe(500)
    expect(result.protein).toBe(20)
    expect(result.carbs).toBe(0)
    expect(result.fat).toBe(10)
  })

  it('handles single meal', () => {
    const single: Meal[] = [{ calories: 750, protein_g: 50, carbs_g: 80, fat_g: 25 }]
    expect(sumMacros(single)).toEqual({ calories: 750, protein: 50, carbs: 80, fat: 25 })
  })
})

// ─── Progress bar clamping ────────────────────────────────────────────────────

describe('progressPct (progress bar clamping)', () => {
  it('returns 0 when target is 0 (divide-by-zero guard)', () => {
    expect(progressPct(500, 0)).toBe(0)
  })

  it('returns 50 for half-filled', () => {
    expect(progressPct(1000, 2000)).toBe(50)
  })

  it('returns 100 exactly at target', () => {
    expect(progressPct(2000, 2000)).toBe(100)
  })

  it('caps at 100 when over target', () => {
    expect(progressPct(3000, 2000)).toBe(100)
    expect(progressPct(99999, 2000)).toBe(100)
  })

  it('handles fractional values', () => {
    expect(progressPct(750, 2000)).toBeCloseTo(37.5, 1)
  })
})

// ─── Photo scan result parsing ────────────────────────────────────────────────

describe('parseScanResult (photo analysis response)', () => {
  it('parses direct analysis object', () => {
    const result = parseScanResult({
      analysis: { food_name: 'Poulet rôti', calories: 350, protein_g: 42, carbs_g: 0, fat_g: 16 },
    })
    expect(result).not.toBeNull()
    expect(result!.food_name).toBe('Poulet rôti')
    expect(result!.calories).toBe(350)
    expect(result!.protein_g).toBe(42)
  })

  it('falls back to root object if no analysis key', () => {
    const result = parseScanResult({
      food_name: 'Salade César', calories: 220, protein_g: 12, carbs_g: 18, fat_g: 14,
    })
    expect(result).not.toBeNull()
    expect(result!.food_name).toBe('Salade César')
  })

  it('returns null when food_name is missing', () => {
    expect(parseScanResult({ calories: 350 })).toBeNull()
    expect(parseScanResult({})).toBeNull()
  })

  it('defaults missing macro values to 0', () => {
    const result = parseScanResult({ food_name: 'Eau', calories: 0 })
    expect(result!.protein_g).toBe(0)
    expect(result!.carbs_g).toBe(0)
    expect(result!.fat_g).toBe(0)
  })

  it('coerces string numbers to numbers', () => {
    const result = parseScanResult({
      food_name: 'Pain', calories: '280', protein_g: '8', carbs_g: '55', fat_g: '2',
    })
    expect(typeof result!.calories).toBe('number')
    expect(result!.calories).toBe(280)
  })
})

// ─── calcMacroTargets integration with TDEE ───────────────────────────────────

describe('calcMacroTargets — end-to-end with realistic profiles', () => {
  it('30y/o male lose goal: calorie deficit applied', () => {
    // TDEE ~2400 for 80kg sedentary 30yo male
    const tdee = 2400
    const m = calcMacroTargets(tdee, 80, 'lose')
    expect(m.targetCal).toBe(1900)     // 2400 - 500
    expect(m.proteinG).toBe(160)       // 80 * 2.0
    expect(m.fatG).toBeGreaterThan(0)
    expect(m.carbsG).toBeGreaterThanOrEqual(50)
  })

  it('25y/o female maintain goal: keeps TDEE', () => {
    const tdee = 1800
    const m = calcMacroTargets(tdee, 60, 'maintain')
    expect(m.targetCal).toBe(1800)
  })

  it('GLP-1 patient losing weight (low TDEE): floor at 1200', () => {
    // If someone has TDEE of 1400 (very small person) and goal=lose
    // 1400 - 500 = 900 → should clamp to 1200
    const m = calcMacroTargets(1400, 50, 'lose')
    expect(m.targetCal).toBe(1200)
  })
})
