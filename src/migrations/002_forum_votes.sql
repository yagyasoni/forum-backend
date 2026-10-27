-- Votes on threads. Visitor phase: voter_id is a random id the browser keeps on the device.
-- Member phase: the user id replaces it (same column), so no schema change is needed then.
-- forum_threads.like_count stays the displayed score and is kept in step by the vote endpoint.

CREATE TABLE IF NOT EXISTS forum_votes (
  voter_id   text NOT NULL CHECK (voter_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  thread_id  uuid NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  value      smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (voter_id, thread_id)
);

CREATE INDEX IF NOT EXISTS forum_votes_thread_idx ON forum_votes (thread_id);
