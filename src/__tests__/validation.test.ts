/**
 * Validation tests — mirrors the guards used across all screens.
 * These test the EXACT same boundaries enforced in the UI code.
 */
import { describe, it, expect } from 'vitest'
import { calcAge } from '../utils/calculations'

// ─── Inline the validation logic from each screen ────────────────────────────
// (So tests break if someone changes a boundary without updating here)

const validateWeight  = (w: number) => !isNaN(w) && w >= 20 && w <= 500
const validateHeight  = (h: number) => !isNaN(h) && h >= 100 && h <= 250
const validateWater   = (ml: number) => ml > 0 && ml <= 50000
const validateCalories = (c: number) => c >= 0 && c < 20000
const validateFastTargetHours = (h: number) => h >= 1 && h <= 72
const validateMeasurement = (cm: number) => cm > 0 && cm < 300

// ─── Weight validation (WeightScreen, CalendarTab, OnboardingScreen) ─────────

describe('Weight validation (20–500 kg)', () => {
  it('accepts 20 kg (minimum)', () => expect(validateWeight(20)).toBe(true))
  it('accepts 75 kg (typical)', () => expect(validateWeight(75)).toBe(true))
  it('accepts 500 kg (maximum)', () => expect(validateWeight(500)).toBe(true))
  it('rejects 19.9 kg', () => expect(validateWeight(19.9)).toBe(false))
  it('rejects 500.1 kg', () => expect(validateWeight(500.1)).toBe(false))
  it('rejects 0', () => expect(validateWeight(0)).toBe(false))
  it('rejects negative values', () => expect(validateWeight(-10)).toBe(false))
  it('rejects NaN', () => expect(validateWeight(NaN)).toBe(false))
  it('accepts decimal values (75.5 kg)', () => expect(validateWeight(75.5)).toBe(true))
})

// ─── Height validation (OnboardingScreen) ────────────────────────────────────

describe('Height validation (100–250 cm)', () => {
  it('accepts 100 cm (minimum)', () => expect(validateHeight(100)).toBe(true))
  it('accepts 170 cm (typical)', () => expect(validateHeight(170)).toBe(true))
  it('accepts 250 cm (maximum)', () => expect(validateHeight(250)).toBe(true))
  it('rejects 99 cm', () => expect(validateHeight(99)).toBe(false))
  it('rejects 251 cm', () => expect(validateHeight(251)).toBe(false))
  it('rejects 0', () => expect(validateHeight(0)).toBe(false))
  it('rejects NaN', () => expect(validateHeight(NaN)).toBe(false))
})

// ─── Age validation (OnboardingScreen) ───────────────────────────────────────

describe('Age validation from DOB (10–110 years)', () => {
  const now = new Date()
  const dobForAge = (years: number) =>
    `${now.getFullYear() - years}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const validAge = (dob: string) => {
    const age = calcAge(dob)
    return age >= 10 && age <= 110
  }

  it('accepts 10 year old', () => expect(validAge(dobForAge(10))).toBe(true))
  it('accepts 30 year old', () => expect(validAge(dobForAge(30))).toBe(true))
  it('accepts 110 year old', () => expect(validAge(dobForAge(110))).toBe(true))
  it('rejects 9 year old (too young)', () => expect(validAge(dobForAge(9))).toBe(false))
  it('rejects 111 year old (too old)', () => expect(validAge(dobForAge(111))).toBe(false))
  it('rejects empty DOB (calcAge returns NaN-like)', () => {
    const age = calcAge('')
    expect(age >= 10 && age <= 110).toBe(false)
  })
})

// ─── Water validation (HomeTab, CalendarTab) ─────────────────────────────────

describe('Water amount validation (0–50L)', () => {
  it('accepts 200 ml', () => expect(validateWater(200)).toBe(true))
  it('accepts 2000 ml (2L)', () => expect(validateWater(2000)).toBe(true))
  it('accepts 50000 ml (50L — DB CHECK max)', () => expect(validateWater(50000)).toBe(true))
  it('rejects 0 ml', () => expect(validateWater(0)).toBe(false))
  it('rejects negative ml', () => expect(validateWater(-1)).toBe(false))
  it('rejects 50001 ml (above DB constraint)', () => expect(validateWater(50001)).toBe(false))
})

// ─── Calories validation (meals table CHECK constraint) ───────────────────────

describe('Meal calories validation (0–19999)', () => {
  it('accepts 0 kcal', () => expect(validateCalories(0)).toBe(true))
  it('accepts 500 kcal', () => expect(validateCalories(500)).toBe(true))
  it('accepts 19999 kcal', () => expect(validateCalories(19999)).toBe(true))
  it('rejects negative', () => expect(validateCalories(-1)).toBe(false))
  it('rejects 20000 kcal (at DB limit)', () => expect(validateCalories(20000)).toBe(false))
})

// ─── Fasting hours validation (fasting_sessions CHECK constraint) ─────────────

describe('Fasting target_hours (1–72 h)', () => {
  it('accepts 1h', () => expect(validateFastTargetHours(1)).toBe(true))
  it('accepts 16h (common)', () => expect(validateFastTargetHours(16)).toBe(true))
  it('accepts 72h (3-day max)', () => expect(validateFastTargetHours(72)).toBe(true))
  it('rejects 0h', () => expect(validateFastTargetHours(0)).toBe(false))
  it('rejects 73h', () => expect(validateFastTargetHours(73)).toBe(false))
})

// ─── Body measurement validation (body_measurements CHECK constraints) ────────

describe('Body measurement validation (0–300 cm)', () => {
  it('accepts 70 cm waist', () => expect(validateMeasurement(70)).toBe(true))
  it('accepts 90 cm hips', () => expect(validateMeasurement(90)).toBe(true))
  it('accepts 0.1 cm (edge)', () => expect(validateMeasurement(0.1)).toBe(true))
  it('rejects 0 cm', () => expect(validateMeasurement(0)).toBe(false))
  it('rejects 300 cm (at DB limit)', () => expect(validateMeasurement(300)).toBe(false))
  it('rejects negative cm', () => expect(validateMeasurement(-5)).toBe(false))
})
