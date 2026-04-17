import { useState, useCallback } from 'react'
import { sb } from '../lib/supabase'

export type DayData = {
  calories: number
  protein: number
  carbs: number
  fat: number
  water_ml: number
  weight_kg: number | null
  has_measurements: boolean
  waist_cm?: number | null
  hips_cm?: number | null
  chest_cm?: number | null
  arm_cm?: number | null
  thigh_cm?: number | null
}

const empty = (): DayData => ({
  calories: 0, protein: 0, carbs: 0, fat: 0,
  water_ml: 0, weight_kg: null, has_measurements: false,
})

export function useCalendarData(userId: string | undefined) {
  const [monthData, setMonthData] = useState<Record<string, DayData>>({})
  const [loading, setLoading] = useState(false)

  const loadMonth = useCallback(async (year: number, month: number) => {
    if (!userId) return
    setLoading(true)
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay  = new Date(year, month, 0).toISOString().slice(0, 10)

    const [mealsRes, waterRes, weightRes, measRes] = await Promise.all([
      sb.from('meals').select('meal_date, calories, protein_g, carbs_g, fat_g')
        .eq('user_id', userId).gte('meal_date', firstDay).lte('meal_date', lastDay),
      sb.from('water_logs').select('logged_date, amount_ml')
        .eq('user_id', userId).gte('logged_date', firstDay).lte('logged_date', lastDay),
      sb.from('weight_logs').select('logged_date, weight_kg')
        .eq('user_id', userId).gte('logged_date', firstDay).lte('logged_date', lastDay),
      sb.from('body_measurements')
        .select('logged_date, waist_cm, hips_cm, chest_cm, arm_cm, thigh_cm')
        .eq('user_id', userId).gte('logged_date', firstDay).lte('logged_date', lastDay),
    ])

    const data: Record<string, DayData> = {}

    for (const meal of mealsRes.data ?? []) {
      if (!data[meal.meal_date]) data[meal.meal_date] = empty()
      data[meal.meal_date].calories += meal.calories || 0
      data[meal.meal_date].protein  += meal.protein_g || 0
      data[meal.meal_date].carbs    += meal.carbs_g || 0
      data[meal.meal_date].fat      += meal.fat_g || 0
    }

    for (const w of waterRes.data ?? []) {
      if (!data[w.logged_date]) data[w.logged_date] = empty()
      data[w.logged_date].water_ml = w.amount_ml
    }

    for (const wl of weightRes.data ?? []) {
      if (!data[wl.logged_date]) data[wl.logged_date] = empty()
      if (data[wl.logged_date].weight_kg === null) data[wl.logged_date].weight_kg = wl.weight_kg
    }

    for (const m of measRes.data ?? []) {
      if (!data[m.logged_date]) data[m.logged_date] = empty()
      data[m.logged_date].has_measurements = true
      data[m.logged_date].waist_cm  = m.waist_cm
      data[m.logged_date].hips_cm   = m.hips_cm
      data[m.logged_date].chest_cm  = m.chest_cm
      data[m.logged_date].arm_cm    = m.arm_cm
      data[m.logged_date].thigh_cm  = m.thigh_cm
    }

    setMonthData(data)
    setLoading(false)
  }, [userId])

  return { monthData, loading, loadMonth }
}
