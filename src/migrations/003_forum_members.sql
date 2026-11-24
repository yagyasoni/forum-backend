-- Member phase: saves and notifications tables. Safe to run more than once.

CREATE TABLE IF NOT EXISTS forum_saves (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id  uuid NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);

CREATE INDEX IF NOT EXISTS forum_saves_user_created_idx ON forum_saves (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS forum_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  thread_id  uuid NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES forum_comments(id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_notifications_user_read_created_idx
  ON forum_notifications (user_id, is_read, created_at DESC);
