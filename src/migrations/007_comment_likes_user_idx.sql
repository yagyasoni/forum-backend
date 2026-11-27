-- GET /api/me lists the comments a member liked (newest first). The primary key starts with
-- comment_id, so without this index that lookup would read the whole table. Safe to run more than once.
CREATE INDEX IF NOT EXISTS forum_comment_likes_user_idx ON forum_comment_likes (user_id, created_at DESC);
