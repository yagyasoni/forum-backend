-- Visitor phase forum tables. Safe to run more than once.
-- Parent tables (users, pharmacy_details, master_sheet) belong to AuditProRx and are only read.

CREATE TABLE IF NOT EXISTS forum_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  sort_order      int  NOT NULL DEFAULT 0,
  members_only    boolean NOT NULL DEFAULT false,
  admin_post_only boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forum_profiles (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username              text NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'),
  role                  text NOT NULL CHECK (role IN ('owner', 'pharmacist', 'technician', 'consultant', 'student')),
  favorite_category_ids uuid[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS forum_profiles_username_lower_idx ON forum_profiles (lower(username));

CREATE TABLE IF NOT EXISTS forum_threads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      uuid NOT NULL REFERENCES forum_categories(id),
  author_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 150),
  body             text NOT NULL,
  image_url        text,
  is_pinned       boolean NOT NULL DEFAULT false,
  is_locked        boolean NOT NULL DEFAULT false,
  is_deleted       boolean NOT NULL DEFAULT false,
  view_count       int NOT NULL DEFAULT 0,
  comment_count    int NOT NULL DEFAULT 0,
  like_count       int NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  -- HTML tags are stripped so markup does not end up in the search index
  search_vector    tsvector GENERATED ALWAYS AS (
    to_tsvector('english', title || ' ' || regexp_replace(body, '<[^>]*>', ' ', 'g'))
  ) STORED,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Build plan v2: added after the table was first created in some databases.
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS image_url text;

CREATE INDEX IF NOT EXISTS forum_threads_last_activity_idx ON forum_threads (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS forum_threads_category_activity_idx ON forum_threads (category_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS forum_threads_like_count_idx ON forum_threads (like_count DESC);
CREATE INDEX IF NOT EXISTS forum_threads_search_idx ON forum_threads USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS forum_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  like_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_comments_thread_created_idx ON forum_comments (thread_id, created_at);

-- AuditProRx deletes users, and every one of its own tables cascades or nulls on that delete.
-- Forum authors must cascade too, or deleting a user who posted would fail in AuditProRx.
-- Databases created before this fix get the constraint replaced once; later runs skip it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_author_id_fkey' AND confdeltype <> 'c') THEN
    ALTER TABLE forum_threads DROP CONSTRAINT forum_threads_author_id_fkey,
      ADD CONSTRAINT forum_threads_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_comments_author_id_fkey' AND confdeltype <> 'c') THEN
    ALTER TABLE forum_comments DROP CONSTRAINT forum_comments_author_id_fkey,
      ADD CONSTRAINT forum_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
