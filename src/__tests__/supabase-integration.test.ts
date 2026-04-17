/**
 * Supabase Integration Tests
 *
 * These tests run against the REAL Supabase database.
 * They require VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars.
 *
 * Each test creates its own data and cleans up after itself.
 * Run with: npx vitest run src/__tests__/supabase-integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Credentials are hardcoded in supabase.ts (not env vars)
const SUPABASE_URL  = 'https://mnzvexnaemdetznxeeuo.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uenZleG5hZW1kZXR6bnhlZXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjQxMTksImV4cCI6MjA5MDIwMDExOX0.3GizLSrEKjqrMeL88V1CNyHw9_L0f13t5SA_jk9REq0'

// Test user credentials (from create-test-accounts.mjs)
const TEST_EMAIL    = 'admin@vitalcore.app'
const TEST_PASSWORD = 'Admin1234!'

let sb: SupabaseClient
let userId: string

beforeAll(async () => {
  sb = createClient(SUPABASE_URL, SUPABASE_ANON)

  // Sign in with test account
  const { data, error } = await sb.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })

  if (error || !data.user) {
    console.warn(`⚠️  Test login failed: ${error?.message} — run scripts/create-test-accounts.mjs first`)
    return
  }

  userId = data.user.id
})

afterAll(async () => {
  if (sb) await sb.auth.signOut()
})

// ─── Helper: assert connection is ready ──────────────────────────────────────

function requireSb() {
  if (!sb || !userId) throw new Error('Supabase connection not ready — check test user credentials')
  return true
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('Auth: login & profile', () => {
  it('signs in and returns a session', async () => {
    if (!requireSb()) return
    const { data } = await sb.auth.getSession()
    expect(data.session).not.toBeNull()
    expect(data.session!.user.id).toBe(userId)
  })

  it('profile row exists for test user', async () => {
    if (!requireSb()) return
    const { data, error } = await sb.from('profiles').select('id, onboarding_completed').eq('id', userId).single()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.id).toBe(userId)
  })

  it('cannot read another user profile (RLS)', async () => {
    if (!requireSb()) return
    const { data } = await sb.from('profiles').select('id').neq('id', userId)
    // With RLS, should return empty array (not other users)
    expect(data).toEqual([])
  })
})

// ─── meals table ─────────────────────────────────────────────────────────────

describe('meals: CRUD', () => {
  let insertedId: string | null = null

  it('inserts a meal and returns it', async () => {
    if (!requireSb()) return
    const { data, error } = await sb.from('meals').insert({
      user_id: userId,
      food_name: '__test_meal__',
      calories: 350,
      protein_g: 30,
      carbs_g: 40,
      fat_g: 8,
      meal_type: 'lunch',
      meal_date: '2099-01-01', // far future to avoid polluting today's data
    }).select('id').single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    insertedId = data!.id
  })

  it('reads inserted meal back', async () => {
    if (!requireSb() || !insertedId) return
    const { data, error } = await sb.from('meals').select('*').eq('id', insertedId).single()
    expect(error).toBeNull()
    expect(data!.food_name).toBe('__test_meal__')
    expect(data!.calories).toBe(350)
  })

  it('rejects reading meals from another user (RLS)', async () => {
    if (!requireSb()) return
    const { data } = await sb.from('meals').select('id').neq('user_id', userId)
    expect(data).toEqual([])
  })

  it('deletes the test meal', async () => {
    if (!requireSb() || !insertedId) return
    const { error } = await sb.from('meals').delete().eq('id', insertedId)
    expect(error).toBeNull()
    insertedId = null
  })
})

// ─── weight_logs table ────────────────────────────────────────────────────────

describe('weight_logs: upsert pattern', () => {
  const TEST_DATE = '2099-01-01'

  afterAll(async () => {
    if (!sb) return
    await sb.from('weight_logs').delete().eq('user_id', userId).eq('logged_date', TEST_DATE)
  })

  it('inserts a weight log', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('weight_logs').insert({
      user_id: userId, weight_kg: 75.5, logged_date: TEST_DATE,
    })
    expect(error).toBeNull()
  })

  it('UNIQUE constraint prevents duplicate insert for same date', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('weight_logs').insert({
      user_id: userId, weight_kg: 76, logged_date: TEST_DATE,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505') // unique_violation
  })

  it('upsert pattern: check-then-update succeeds', async () => {
    if (!requireSb()) return
    const { data: existing } = await sb.from('weight_logs')
      .select('id').eq('user_id', userId).eq('logged_date', TEST_DATE).maybeSingle()
    expect(existing).not.toBeNull()

    const { error } = await sb.from('weight_logs')
      .update({ weight_kg: 76.0 }).eq('id', existing!.id)
    expect(error).toBeNull()

    const { data: updated } = await sb.from('weight_logs')
      .select('weight_kg').eq('id', existing!.id).single()
    expect(updated!.weight_kg).toBe(76)
  })

  it('rejects weight outside CHECK constraint (< 0)', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('weight_logs').insert({
      user_id: userId, weight_kg: -5, logged_date: '2099-01-02',
    })
    expect(error).not.toBeNull()
  })
})

// ─── water_logs table ─────────────────────────────────────────────────────────

describe('water_logs: upsert pattern', () => {
  const TEST_DATE = '2099-01-02'

  afterAll(async () => {
    if (!sb) return
    await sb.from('water_logs').delete().eq('user_id', userId).eq('logged_date', TEST_DATE)
  })

  it('inserts a water log', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('water_logs').insert({
      user_id: userId, amount_ml: 500, logged_date: TEST_DATE,
    })
    expect(error).toBeNull()
  })

  it('UNIQUE constraint prevents duplicate water log', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('water_logs').insert({
      user_id: userId, amount_ml: 200, logged_date: TEST_DATE,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
  })

  it('accumulates water via update', async () => {
    if (!requireSb()) return
    const { data: row } = await sb.from('water_logs')
      .select('id, amount_ml').eq('user_id', userId).eq('logged_date', TEST_DATE).maybeSingle()
    expect(row).not.toBeNull()

    await sb.from('water_logs').update({ amount_ml: row!.amount_ml + 330 }).eq('id', row!.id)
    const { data: updated } = await sb.from('water_logs')
      .select('amount_ml').eq('id', row!.id).single()
    expect(updated!.amount_ml).toBe(830)
  })

  it('rejects negative amount (CHECK constraint)', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('water_logs').insert({
      user_id: userId, amount_ml: -100, logged_date: '2099-01-03',
    })
    expect(error).not.toBeNull()
  })
})

// ─── body_measurements table ──────────────────────────────────────────────────

describe('body_measurements: new table exists & works', () => {
  const TEST_DATE = '2099-01-03'

  afterAll(async () => {
    if (!sb) return
    await sb.from('body_measurements').delete().eq('user_id', userId).eq('logged_date', TEST_DATE)
  })

  it('table exists and is accessible', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('body_measurements').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('inserts a measurement row', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('body_measurements').insert({
      user_id: userId,
      logged_date: TEST_DATE,
      waist_cm: 80,
      hips_cm: 95,
      chest_cm: 90,
      arm_cm: 30,
      thigh_cm: 55,
    })
    expect(error).toBeNull()
  })

  it('reads back the inserted measurement', async () => {
    if (!requireSb()) return
    const { data, error } = await sb.from('body_measurements')
      .select('*').eq('user_id', userId).eq('logged_date', TEST_DATE).single()
    expect(error).toBeNull()
    expect(data!.waist_cm).toBe(80)
    expect(data!.hips_cm).toBe(95)
  })

  it('UNIQUE constraint prevents duplicate date', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('body_measurements').insert({
      user_id: userId, logged_date: TEST_DATE, waist_cm: 81,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
  })

  it('RLS prevents reading other users measurements', async () => {
    if (!requireSb()) return
    const { data } = await sb.from('body_measurements').select('id').neq('user_id', userId)
    expect(data).toEqual([])
  })
})

// ─── fasting_sessions table ───────────────────────────────────────────────────

describe('fasting_sessions: start/stop flow', () => {
  let sessionId: string | null = null

  afterAll(async () => {
    if (!sb || !sessionId) return
    await sb.from('fasting_sessions').delete().eq('id', sessionId)
  })

  it('starts a fast', async () => {
    if (!requireSb()) return
    const { data, error } = await sb.from('fasting_sessions').insert({
      user_id: userId,
      protocol: '16:8',
      target_hours: 16,
      started_at: new Date().toISOString(),
      completed: false,
    }).select('id').single()
    expect(error).toBeNull()
    sessionId = data!.id
  })

  it('reads active fast (not completed)', async () => {
    if (!requireSb() || !sessionId) return
    const { data, error } = await sb.from('fasting_sessions')
      .select('*').eq('id', sessionId).eq('completed', false).single()
    expect(error).toBeNull()
    expect(data!.protocol).toBe('16:8')
  })

  it('ends the fast', async () => {
    if (!requireSb() || !sessionId) return
    const { error } = await sb.from('fasting_sessions').update({
      ended_at: new Date().toISOString(),
      completed: true,
    }).eq('id', sessionId)
    expect(error).toBeNull()
  })

  it('rejects target_hours outside CHECK constraint (> 72)', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('fasting_sessions').insert({
      user_id: userId, protocol: '16:8', target_hours: 100,
      started_at: new Date().toISOString(), completed: false,
    })
    expect(error).not.toBeNull()
  })
})

// ─── journal_entries table ────────────────────────────────────────────────────

describe('journal_entries: insert & read', () => {
  let entryId: string | null = null

  afterAll(async () => {
    if (!sb || !entryId) return
    await sb.from('journal_entries').delete().eq('id', entryId)
  })

  it('inserts a journal entry', async () => {
    if (!requireSb()) return
    const { data, error } = await sb.from('journal_entries').insert({
      user_id: userId, mood: 4, notes: '__test_entry__', entry_date: '2099-01-01',
    }).select('id').single()
    expect(error).toBeNull()
    entryId = data!.id
  })

  it('reads journal entry back', async () => {
    if (!requireSb() || !entryId) return
    const { data, error } = await sb.from('journal_entries').select('*').eq('id', entryId).single()
    expect(error).toBeNull()
    expect(data!.mood).toBe(4)
    expect(data!.notes).toBe('__test_entry__')
  })
})

// ─── subscriptions table ──────────────────────────────────────────────────────

describe('subscriptions: RLS', () => {
  it('can read own subscription row', async () => {
    if (!requireSb()) return
    const { error } = await sb.from('subscriptions').select('id').eq('user_id', userId)
    expect(error).toBeNull()
  })

  it('cannot read other users subscriptions (RLS)', async () => {
    if (!requireSb()) return
    const { data } = await sb.from('subscriptions').select('id').neq('user_id', userId)
    expect(data).toEqual([])
  })
})
