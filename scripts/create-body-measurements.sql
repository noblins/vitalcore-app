CREATE TABLE IF NOT EXISTS body_measurements (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  waist_cm    DECIMAL(5,1),
  hips_cm     DECIMAL(5,1),
  chest_cm    DECIMAL(5,1),
  arm_cm      DECIMAL(5,1),
  thigh_cm    DECIMAL(5,1),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own body_measurements" ON body_measurements
  FOR ALL USING (auth.uid() = user_id);
