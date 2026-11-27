import { Router } from "express";
import { pool } from "../config/db.js";
import { requireMember, requireProfile } from "../middleware/auth.js";
import { PAGE_SIZE, memberColumns, pageResult, parsePage, threadColumns, threadFrom, visibilityClause } from "../sql/threads.js";

const router = Router();

const VALID_ROLES = ["owner", "pharmacist", "technician", "consultant", "student", "other"];
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/me
router.get("/", requireMember, async (req, res) => {
  const [userResult, unreadResult, votesResult, likesResult] = await Promise.all([
    // "verified" is the Verified Pharmacy tag: a pharmacy with an NPI or NCPDP on file,
    // the same rule the author columns use. It is not the email-verified flag.
    pool.query(
      `SELECT m.id, COALESCE((SELECT u.email FROM users u WHERE u.id = m.user_id), m.email) AS email,
              EXISTS (
                SELECT 1 FROM pharmacy_details pd
                WHERE pd.user_id = m.user_id AND (pd.npi_number IS NOT NULL OR pd.ncpdp_number IS NOT NULL)
              ) AS verified
       FROM forum_members m WHERE m.id = $1::uuid`,
      [req.user.id]
    ),
    pool.query(
      `SELECT count(*)::int AS unread FROM forum_notifications WHERE user_id = $1::uuid AND NOT is_read`,
      [req.user.id]
    ),
    // The member's own votes, so the arrows are right on any device without a second request.
    pool.query(
      `SELECT thread_id, value FROM forum_votes WHERE voter_id = $1::text ORDER BY updated_at DESC LIMIT 1000`,
      [req.user.id]
    ),
    // The comments this member liked. The thread page is rendered by the frontend's own server,
    // which does not have the member's login, so the browser needs these to show the thumbs right.
    pool.query(
      `SELECT comment_id FROM forum_comment_likes WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 500`,
      [req.user.id]
    ),
  ]);

  const u = userResult.rows[0];
  res.json({
    id: u.id,
    email: u.email,
    verified: u.verified,
    unread: unreadResult.rows[0].unread,
    votes: Object.fromEntries(votesResult.rows.map((v) => [v.thread_id, v.value])),
    likedComments: likesResult.rows.map((l) => l.comment_id),
    profile: req.user.profile,
  });
});

// PUT /api/me/profile
router.put("/profile", requireMember, async (req, res) => {
  const { username, role, favoriteCategoryIds } = req.body ?? {};

  if (!username || !USERNAME_RE.test(username))
    return res.status(400).json({ error: "Username must be 3–20 characters: letters, digits, underscore." });

  if (!role || !VALID_ROLES.includes(role))
    return res.status(400).json({ error: "Role must be one of: " + VALID_ROLES.join(", ") });

  // The column is uuid[]; anything that is not a category id would make the insert fail.
  const categoryIds = Array.isArray(favoriteCategoryIds)
    ? favoriteCategoryIds.filter((id) => typeof id === "string" && UUID_RE.test(id))
    : [];

  try {
    const { rows } = await pool.query(
      `INSERT INTO forum_profiles (user_id, username, role, favorite_category_ids, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE
         SET username = EXCLUDED.username,
             role = EXCLUDED.role,
             favorite_category_ids = EXCLUDED.favorite_category_ids,
             updated_at = now()
       RETURNING username, role, favorite_category_ids`,
      [req.user.id, username, role, categoryIds]
    );

    const p = rows[0];
    res.json({ username: p.username, role: p.role, favoriteCategoryIds: p.favorite_category_ids });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Username already taken." });
    throw err;
  }
});

// GET /api/me/threads — threads the member wrote
router.get("/threads", requireMember, async (req, res) => {
  const page = parsePage(req.query.page);
  const vis = visibilityClause(req);
  const mc = memberColumns(1);

  const [list, count] = await Promise.all([
    pool.query(
      `SELECT ${threadColumns} ${mc} ${threadFrom} ${vis} AND t.author_id = $1::uuid
       ORDER BY t.created_at DESC, t.id
       LIMIT $2 OFFSET $3`,
      [req.user.id, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    ),
    pool.query(
      `SELECT count(*)::int AS total ${threadFrom} ${vis} AND t.author_id = $1::uuid`,
      [req.user.id]
    ),
  ]);

  res.json(pageResult(list.rows, page, count.rows[0].total));
});

// GET /api/me/saved — threads the member saved, newest save first
router.get("/saved", requireMember, async (req, res) => {
  const page = parsePage(req.query.page);
  const vis = visibilityClause(req);
  const mc = memberColumns(1);

  const [list, count] = await Promise.all([
    pool.query(
      `SELECT ${threadColumns} ${mc} ${threadFrom} ${vis}
         AND EXISTS (SELECT 1 FROM forum_saves s WHERE s.thread_id = t.id AND s.user_id = $1::uuid)
       ORDER BY (SELECT s.created_at FROM forum_saves s WHERE s.thread_id = t.id AND s.user_id = $1::uuid) DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    ),
    pool.query(
      `SELECT count(*)::int AS total ${threadFrom} ${vis}
         AND EXISTS (SELECT 1 FROM forum_saves s WHERE s.thread_id = t.id AND s.user_id = $1::uuid)`,
      [req.user.id]
    ),
  ]);

  res.json(pageResult(list.rows, page, count.rows[0].total));
});

// GET /api/me/notifications — last 50, marks all read
router.get("/notifications", requireMember, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT n.id, n.type, n.thread_id, n.is_read, n.created_at,
            t.title AS thread_title,
            fp.username AS actor_username
     FROM forum_notifications n
     JOIN forum_threads t ON t.id = n.thread_id
     LEFT JOIN forum_profiles fp ON fp.user_id = n.actor_id
     WHERE n.user_id = $1::uuid
     ORDER BY n.created_at DESC
     LIMIT 50`,
    [req.user.id]
  );

  // Mark all as read
  await pool.query(
    `UPDATE forum_notifications SET is_read = true WHERE user_id = $1::uuid AND NOT is_read`,
    [req.user.id]
  );

  res.json({
    items: rows.map((n) => ({
      id: n.id,
      type: n.type,
      threadId: n.thread_id,
      threadTitle: n.thread_title,
      actor: { username: n.actor_username ?? "Unknown" },
      isRead: n.is_read,
      createdAt: n.created_at,
    })),
  });
});

export default router;
