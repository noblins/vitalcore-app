-- ============================================================
-- VitalCore DB Hardening Migration
-- Date: 2026-04-15
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. CREATE body_measurements (table is MISSING in production)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.body_measurements (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_date date        NOT NULL DEFAULT CURRENT_DATE,
  waist_cm    numeric(5,1) CHECK (waist_cm  IS NULL OR (waist_cm  > 0 AND waist_cm  < 300)),
  hips_cm     numeric(5,1) CHECK (hips_cm   IS NULL OR (hips_cm   > 0 AND hips_cm   < 300)),
  chest_cm    numeric(5,1) CHECK (chest_cm  IS NULL OR (chest_cm  > 0 AND chest_cm  < 300)),
  arm_cm      numeric(5,1) CHECK (arm_cm    IS NULL OR (arm_cm    > 0 AND arm_cm    < 200)),
  thigh_cm    numeric(5,1) CHECK (thigh_cm  IS NULL OR (thigh_cm  > 0 AND thigh_cm  < 200)),
  notes       text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, logged_date)
);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "body_measurements_own" ON public.body_measurements;
CREATE POLICY "body_measurements_own" ON public.body_measurements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 2. UNIQUE constraint on weight_logs(user_id, logged_date)
--    First remove duplicates (keep the row with highest weight_kg
--    or latest created_at if tie)
-- ─────────────────────────────────────────────────────────────
DELETE FROM public.weight_logs w1
WHERE w1.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, logged_date
             ORDER BY created_at DESC
           ) AS rn
    FROM public.weight_logs
  ) ranked
  WHERE rn > 1
);

ALTER TABLE public.weight_logs
  DROP CONSTRAINT IF EXISTS weight_logs_user_id_logged_date_key;
ALTER TABLE public.weight_logs
  ADD CONSTRAINT weight_logs_user_id_logged_date_key
  UNIQUE (user_id, logged_date);

-- ─────────────────────────────────────────────────────────────
-- 3. Enable RLS on subscriptions (currently DISABLED — security risk)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_own_read"   ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_own_insert" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_own_update" ON public.subscriptions;

CREATE POLICY "subscriptions_own_read"   ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "subscriptions_own_insert" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subscriptions_own_update" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Lock down legacy/deployment tables (no RLS → deny all public)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.deploy_b64   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.html_chunks  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deploy_b64_deny_all"  ON public.deploy_b64;
DROP POLICY IF EXISTS "html_chunks_deny_all" ON public.html_chunks;

CREATE POLICY "deploy_b64_deny_all"  ON public.deploy_b64  FOR ALL USING (false);
CREATE POLICY "html_chunks_deny_all" ON public.html_chunks FOR ALL USING (false);

-- ─────────────────────────────────────────────────────────────
-- 5. Performance indexes (missing on high-frequency query paths)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meals_user_date
  ON public.meals (user_id, meal_date DESC);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date
  ON public.weight_logs (user_id, logged_date DESC);

CREATE INDEX IF NOT EXISTS idx_water_logs_user_date
  ON public.water_logs (user_id, logged_date DESC);

CREATE INDEX IF NOT EXISTS idx_fasting_sessions_user
  ON public.fasting_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user
  ON public.journal_entries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_progress_photos_user
  ON public.progress_photos (user_id, taken_at DESC);

CREATE INDEX IF NOT EXISTS idx_medications_user
  ON public.medications (user_id);

CREATE INDEX IF NOT EXISTS idx_injection_logs_user
  ON public.injection_logs (user_id, injection_date DESC);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date
  ON public.body_measurements (user_id, logged_date DESC);

-- ─────────────────────────────────────────────────────────────
-- 6. CHECK constraints for data integrity
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.weight_logs
  DROP CONSTRAINT IF EXISTS weight_logs_weight_range;
ALTER TABLE public.weight_logs
  ADD CONSTRAINT weight_logs_weight_range
  CHECK (weight_kg > 0 AND weight_kg < 1000);

ALTER TABLE public.water_logs
  DROP CONSTRAINT IF EXISTS water_logs_amount_range;
ALTER TABLE public.water_logs
  ADD CONSTRAINT water_logs_amount_range
  CHECK (amount_ml > 0 AND amount_ml < 50000);

ALTER TABLE public.meals
  DROP CONSTRAINT IF EXISTS meals_calories_range;
ALTER TABLE public.meals
  ADD CONSTRAINT meals_calories_range
  CHECK (calories IS NULL OR (calories >= 0 AND calories < 20000));

ALTER TABLE public.fasting_sessions
  DROP CONSTRAINT IF EXISTS fasting_target_hours_range;
ALTER TABLE public.fasting_sessions
  ADD CONSTRAINT fasting_target_hours_range
  CHECK (target_hours IS NULL OR (target_hours >= 1 AND target_hours <= 72));

-- ─────────────────────────────────────────────────────────────
-- 7. Fix injection_logs.user_id nullable (set NOT NULL)
--    Safe only if no existing NULL rows
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.injection_logs WHERE user_id IS NULL
  ) THEN
    ALTER TABLE public.injection_logs ALTER COLUMN user_id SET NOT NULL;
    RAISE NOTICE 'injection_logs.user_id set to NOT NULL';
  ELSE
    RAISE WARNING 'injection_logs has NULL user_id rows — skipping NOT NULL constraint';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Done
-- ─────────────────────────────────────────────────────────────
SELECT 'DB hardening complete' AS status;
