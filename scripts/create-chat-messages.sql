-- chat_messages: historique des conversations avec le Coach IA
CREATE TABLE IF NOT EXISTS chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Index pour charger l'historique rapidement
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON chat_messages (user_id, created_at DESC);

-- RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can read own messages"
  ON chat_messages FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own messages"
  ON chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
