export function calcBMR(gender: string, weight: number, height: number, age: number): number {
  if (gender === 'male') return 10 * weight + 6.25 * height - 5 * age + 5
  return 10 * weight + 6.25 * height - 5 * age - 161
}

export function calcTDEE(bmr: number, activity: string): number {
  const m: Record<string, number> = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
  }
  return Math.round(bmr * (m[activity] ?? 1.2))
}

export function calcAge(dob: string): number {
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const md = today.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.floor((hours - h) * 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function calcMacroTargets(
  tdee: number,
  weightKg: number,
  goal: string,
): { targetCal: number; proteinG: number; carbsG: number; fatG: number } {
  const targetCal =
    goal === 'lose'   ? Math.max(tdee - 500, 1200) :
    goal === 'gain'   ? tdee + 300 :
    tdee

  const proteinPerKg = goal === 'lose' ? 2.0 : goal === 'gain' ? 1.8 : 1.6
  const proteinG = Math.round(weightKg * proteinPerKg)
  const fatG     = Math.round((targetCal * 0.27) / 9)
  const carbsG   = Math.max(Math.round((targetCal - proteinG * 4 - fatG * 9) / 4), 50)

  return { targetCal, proteinG, carbsG, fatG }
}

export function moodEmoji(v: number): string {
  return ['', '😞', '😔', '😐', '🙂', '😄'][v] ?? ''
}

export function moodColor(v: number): string {
  return ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'][v] ?? '#e2e8f0'
}
