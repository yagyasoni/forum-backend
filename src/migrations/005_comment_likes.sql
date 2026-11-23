-- One like per member per comment. Safe to run more than once.
CREATE TABLE IF NOT EXISTS forum_comment_likes (
  comment_id uuid NOT NULL REFERENCES forum_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
