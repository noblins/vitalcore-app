import { useState, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { todayISO } from '../utils/calculations'
import type { Meal, ChatMessage, FastingSession, ProgressPhoto, Medication, InjectionLog, WeightLog, BodyMeasurement } from '../types'

export function useDashboardData(userId: string | undefined) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [fastActive, setFastActive] = useState<FastingSession | null>(null)
  const [fastHistory, setFastHistory] = useState<FastingSession[]>([])
  const [photos, setPhotos] = useState<ProgressPhoto[]>([])
  const [activeMed, setActiveMed] = useState<Medication | null>(null)
  const [injLogs, setInjLogs] = useState<InjectionLog[]>([])
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [todayWater, setTodayWater] = useState(0)
  const [weekWater, setWeekWater] = useState<{ logged_date: string; amount_ml: number }[]>([])
  const [weekMeals, setWeekMeals] = useState<Meal[]>([])
  const [measurementLogs, setMeasurementLogs] = useState<BodyMeasurement[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const today = todayISO()
      const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
      const [mealsRes, msgsRes, fastActRes, fastHistRes, photosRes, medRes, injRes, weightRes, waterRes, weekWaterRes, weekMealsRes, measurementsRes] = await Promise.all([
        sb.from('meals').select('*').eq('user_id', userId).eq('meal_date', today).order('created_at'),
        sb.from('chat_messages').select('*').eq('user_id', userId).order('created_at').limit(50),
        sb.from('fasting_sessions').select('*').eq('user_id', userId).eq('completed', false).maybeSingle(),
        sb.from('fasting_sessions').select('*').eq('user_id', userId).eq('completed', true).order('started_at', { ascending: false }).limit(10),
        sb.from('progress_photos').select('*').eq('user_id', userId).order('taken_at', { ascending: false }),
        sb.from('medications').select('*').eq('user_id', userId).eq('active', true).maybeSingle(),
        sb.from('injection_logs').select('*').eq('user_id', userId).order('injection_date', { ascending: false }).limit(30),
        sb.from('weight_logs').select('*').eq('user_id', userId).order('logged_date', { ascending: false }).limit(30),
        sb.from('water_logs').select('amount_ml').eq('user_id', userId).eq('logged_date', today).maybeSingle(),
        sb.from('water_logs').select('logged_date, amount_ml').eq('user_id', userId).gte('logged_date', weekStart),
        sb.from('meals').select('*').eq('user_id', userId).gte('meal_date', weekStart).order('meal_date'),
        sb.from('body_measurements').select('*').eq('user_id', userId).order('logged_date', { ascending: false }).limit(30),
      ])
      setMeals(mealsRes.data ?? [])
      setMessages((msgsRes.data ?? []).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })))
      setFastActive(fastActRes.data ?? null)
      setFastHistory(fastHistRes.data ?? [])
      setPhotos(photosRes.data ?? [])
      setActiveMed(medRes.data ?? null)
      setInjLogs(injRes.data ?? [])
      setWeightLogs(weightRes.data ?? [])
      setTodayWater(waterRes.data?.amount_ml ?? 0)
      setWeekWater(weekWaterRes.data ?? [])
      setWeekMeals(weekMealsRes.data ?? [])
      setMeasurementLogs(measurementsRes.data ?? [])
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  return {
    meals, setMeals,
    messages, setMessages,
    fastActive, setFastActive,
    fastHistory,
    photos,
    activeMed, setActiveMed,
    injLogs,
    weightLogs,
    todayWater,
    weekWater,
    weekMeals,
    measurementLogs,
    loading,
    reload,
  }
}

export type DashboardHook = ReturnType<typeof useDashboardData>
