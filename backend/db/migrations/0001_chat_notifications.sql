-- Phase 5: realtime chat + notifications schema additions.
-- Idempotent: safe to run against an existing database.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id UUID;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_message_id_uidx
  ON messages (sender_id, client_message_id);
