-- Vote table. voter_id is text to accept both device ids and user UUIDs.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS forum_votes (
  thread_id  uuid NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  voter_id   text NOT NULL CHECK (voter_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  value      smallint NOT NULL CHECK (value IN (1, -1)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, voter_id)
);

CREATE INDEX IF NOT EXISTS forum_votes_voter_idx ON forum_votes (voter_id);
