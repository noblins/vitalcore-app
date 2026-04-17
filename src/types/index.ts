export interface Profile {
  id: string
  email: string
  full_name: string
  gender: string
  date_of_birth: string
  age: number
  height_cm: number
  weight_kg: number
  target_weight_kg: number
  goal: 'lose' | 'maintain' | 'gain' | 'health'
  activity_level: string
  diet: string
  tdee: number
  subscription_plan: 'free' | 'premium'
  onboarding_completed: boolean
}

export interface Meal {
  id: string
  user_id: string
  meal_date: string
  meal_type: string
  food_name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface FastingSession {
  id: string
  user_id: string
  protocol: string
  started_at: string
  ended_at?: string
  target_hours: number
  completed: boolean
}

export interface ProgressPhoto {
  id: string
  user_id: string
  photo_url: string
  weight_kg?: number
  notes?: string
  taken_at: string
}

export interface Medication {
  id: string
  user_id: string
  medication_name: string
  dose_current: string
  dose_unit: string
  injection_day: string
  start_date: string
  next_injection: string
  active: boolean
}

export interface InjectionLog {
  id: string
  user_id: string
  medication_id: string
  injection_date: string
  dose: string
  injection_site: string
  notes?: string
  nausea?: number
  fatigue?: number
  pain?: number
  created_at: string
}

export interface JournalEntry {
  id: string
  user_id: string
  entry_date: string
  mood: number
  notes?: string
  energy: number
  created_at: string
}

export interface WeightLog {
  id: string
  user_id: string
  weight_kg: number
  logged_date: string
  notes?: string
  created_at: string
}

export interface BodyMeasurement {
  id: string
  user_id: string
  logged_date: string
  waist_cm?: number | null
  hips_cm?: number | null
  chest_cm?: number | null
  arm_cm?: number | null
  thigh_cm?: number | null
  notes?: string
  created_at: string
}

export interface WaterLog {
  id: string
  user_id: string
  amount_ml: number
  logged_date: string
  created_at: string
}
