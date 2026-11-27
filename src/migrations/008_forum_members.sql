-- Forum members: everyone who uses the forum has one row here. Safe to run more than once.
--
-- The users table belongs to AuditProRx: its admin dashboard lists it, its Google login accepts
-- any email in it, and article emails go to it. So the forum never adds rows to users.
--
-- A member who signs in with an AuditProRx account has user_id set, and their id is the same
-- uuid as their users row, so pharmacy_details.user_id still finds their pharmacy.
-- A member who signs up with a Google email AuditProRx does not know has user_id NULL.
--
-- Forum tables point at forum_members instead of users. ON UPDATE CASCADE lets a forum-only
-- member keep their posts when they later get an AuditProRx account with the same email:
-- their id is changed to the users id and every forum row follows.

CREATE TABLE IF NOT EXISTS forum_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  name       text NOT NULL DEFAULT '',
  google_sub text UNIQUE,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forum_members_user_id_is_id CHECK (user_id IS NULL OR user_id = id)
);

-- One forum-only member per email. Linked members take their email from AuditProRx.
CREATE UNIQUE INDEX IF NOT EXISTS forum_members_forum_only_email_idx
  ON forum_members (lower(email)) WHERE user_id IS NULL;

-- Every user who already has something in the forum becomes a linked member with the same id.
INSERT INTO forum_members (id, user_id, email, name)
SELECT u.id, u.id, u.email, u.name
FROM users u
WHERE EXISTS (SELECT 1 FROM forum_profiles x WHERE x.user_id = u.id)
   OR EXISTS (SELECT 1 FROM forum_threads x WHERE x.author_id = u.id)
   OR EXISTS (SELECT 1 FROM forum_comments x WHERE x.author_id = u.id)
   OR EXISTS (SELECT 1 FROM forum_saves x WHERE x.user_id = u.id)
   OR EXISTS (SELECT 1 FROM forum_notifications x WHERE x.user_id = u.id OR x.actor_id = u.id)
   OR EXISTS (SELECT 1 FROM forum_comment_likes x WHERE x.user_id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Repoint each forum foreign key that still references users. Later runs find none and skip.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'users'::regclass
      AND c.conrelid IN ('forum_profiles'::regclass, 'forum_threads'::regclass, 'forum_comments'::regclass,
                         'forum_saves'::regclass, 'forum_notifications'::regclass, 'forum_comment_likes'::regclass)
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES forum_members(id) ON DELETE CASCADE ON UPDATE CASCADE',
      r.tbl, r.conname, r.conname, r.col
    );
  END LOOP;
END $$;
