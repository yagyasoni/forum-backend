import { Router } from "express";
import sanitizeHtml from "sanitize-html";
import { pool } from "../config/db.js";
import { requireMember, requireProfile } from "../middleware/auth.js";
import { authorColumns, authorJoin, mapAuthor } from "../sql/author.js";
import {
  PAGE_SIZE,
  TABS,
  mapThreadRow,
  memberColumns,
  pageResult,
  parsePage,
  threadColumns,
  threadFrom,
  visibilityClause,
} from "../sql/threads.js";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Search engines and link-preview bots are not readers, so they do not count as views.
const BOT_RE =
  /bot|crawler|spider|slurp|crawling|facebookexternalhit|facebookcatalog|WhatsApp|SkypeUriPreview|Google-InspectionTool|Google-PageRenderer|Mediapartners-Google|Lighthouse|ia_archiver/i;

// A view is not counted when the request comes from a bot, or when the forum frontend says the page
// it is rendering was requested by one (header X-Forum-No-View: 1, since the frontend's own server
// is what calls this API).
function countsAsView(req) {
  if (req.get("x-forum-no-view") === "1") return false;
  return !BOT_RE.test(req.get("user-agent") ?? "");
}

// Allowed HTML tags/attrs for thread bodies and comments.
const SANITIZE_OPTS = {
  allowedTags: ["p", "br", "strong", "em", "u", "ul", "ol", "li", "a"],
  allowedAttributes: { a: ["href"] },
};

// Lazy-load bad-words to keep startup fast.
let filter;
async function getFilter() {
  if (!filter) {
    const { Filter } = await import("bad-words");
    filter = new Filter();
  }
  return filter;
}

function checkProfanity(f, ...texts) {
  for (const text of texts) {
    if (text && f.isProfane(text)) {
      return f.clean(text).match(/\*+/)?.[0] ? text.split(" ").find((w) => f.isProfane(w)) : null;
    }
  }
  return null;
}

async function loadComments(threadId, userId = null) {
  const params = [threadId];
  const likedJoin = userId
    ? `LEFT JOIN forum_comment_likes fcl ON fcl.comment_id = cm.id AND fcl.user_id = $2`
    : "";
  const likedCol = userId ? ", (fcl.comment_id IS NOT NULL) AS liked_by_me" : "";
  if (userId) params.push(userId);

  const { rows } = await pool.query(
    `SELECT cm.id, cm.body, cm.like_count, cm.created_at${likedCol}, ${authorColumns("cm")}
     FROM forum_comments cm
     ${authorJoin("cm")}
     ${likedJoin}
     WHERE cm.thread_id = $1 AND NOT cm.is_deleted
     ORDER BY cm.created_at, cm.id`,
    params
  );
  return rows.map((c) => ({
    id: c.id,
    author: mapAuthor(c),
    body: c.body,
    likeCount: c.like_count,
    likedByMe: c.liked_by_me ?? false,
    createdAt: c.created_at,
  }));
}

// GET /api/threads
router.get("/", async (req, res) => {
  const tabName = req.query.tab ?? "latest";
  const tab = TABS[tabName];
  if (!tab) return res.status(400).json({ error: "tab must be latest, top, or unanswered" });

  const page = parsePage(req.query.page);
  const vis = visibilityClause(req);
  const filterParams = [];
  let categoryFilter = "";
  if (req.query.category) {
    filterParams.push(String(req.query.category));
    categoryFilter = `AND c.slug = $1`;
  }
  const n = filterParams.length;

  const userParams = req.user ? [req.user.id] : [];
  const mc = req.user ? memberColumns(n + 1) : "";
  const [list, count] = await Promise.all([
    pool.query(
      `SELECT ${threadColumns} ${mc} ${threadFrom} ${vis} ${tab.where} ${categoryFilter}
       ORDER BY ${tab.order}
       LIMIT $${n + userParams.length + 1} OFFSET $${n + userParams.length + 2}`,
      [...filterParams, ...userParams, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    ),
    pool.query(
      `SELECT count(*)::int AS total ${threadFrom} ${vis} ${tab.where} ${categoryFilter}`,
      filterParams
    ),
  ]);

  res.json(pageResult(list.rows, page, count.rows[0].total));
});

// GET /api/threads/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(404).json({ error: "Thread not found" });

  const vis = visibilityClause(req);

  // Count the view, or for bots just check the thread is visible.
  const found = countsAsView(req)
    ? await pool.query(
        `UPDATE forum_threads t SET view_count = t.view_count + 1
         FROM forum_categories c
         WHERE t.id = $1 AND c.id = t.category_id AND NOT t.is_deleted ${vis}
         RETURNING t.id`,
        [id]
      )
    : await pool.query(
        `SELECT t.id FROM forum_threads t
         JOIN forum_categories c ON c.id = t.category_id
         WHERE t.id = $1 AND NOT t.is_deleted ${vis}`,
        [id]
      );
  if (found.rowCount === 0) return res.status(404).json({ error: "Thread not found" });

  const mc = req.user ? memberColumns(2) : "";
  const threadParams = req.user ? [id, req.user.id] : [id];
  const [threadResult, comments] = await Promise.all([
    pool.query(`SELECT ${threadColumns} ${mc}, t.body ${threadFrom} ${vis} AND t.id = $1`, threadParams),
    loadComments(id, req.user?.id),
  ]);

  const row = threadResult.rows[0];
  if (!row) return res.status(404).json({ error: "Thread not found" });
  res.json({ thread: { ...mapThreadRow(row), body: row.body }, comments });
});

// GET /api/threads/:id/comments
router.get("/:id/comments", async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(404).json({ error: "Thread not found" });

  const vis = visibilityClause(req);
  const visible = await pool.query(
    `SELECT 1 FROM forum_threads t
     JOIN forum_categories c ON c.id = t.category_id
     WHERE t.id = $1 AND NOT t.is_deleted ${vis}`,
    [id]
  );
  if (visible.rowCount === 0) return res.status(404).json({ error: "Thread not found" });

  res.json({ items: await loadComments(id, req.user?.id) });
});

// PUT /api/threads/:id/vote  — works for visitors (device id header) and members (cookie)
router.put("/:id/vote", async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(404).json({ error: "Thread not found" });

  const { value } = req.body ?? {};
  if (value !== 1 && value !== -1 && value !== 0)
    return res.status(400).json({ error: "value must be 1, -1, or 0 (to remove)." });

  // Members use their user id; visitors use the X-Forum-Voter header.
  const VOTER_RE = /^[A-Za-z0-9_-]{8,64}$/;
  const voterId = req.user
    ? req.user.id
    : String(req.headers["x-forum-voter"] ?? "");

  if (!VOTER_RE.test(voterId))
    return res.status(400).json({ error: "Missing or invalid X-Forum-Voter header." });

  const vis = visibilityClause(req);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the thread row for this transaction so two votes arriving together are applied one
    // after the other and the score cannot drift. Locked threads still accept votes; only
    // comments are closed on them.
    const threadResult = await client.query(
      `SELECT t.id FROM forum_threads t
       JOIN forum_categories c ON c.id = t.category_id
       WHERE t.id = $1::uuid AND NOT t.is_deleted ${vis}
       FOR UPDATE OF t`,
      [id]
    );
    if (threadResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Thread not found" });
    }

    // Get existing vote if any.
    const existing = await client.query(
      `SELECT value FROM forum_votes WHERE thread_id = $1::uuid AND voter_id = $2`,
      [id, voterId]
    );
    const oldValue = existing.rows[0]?.value ?? 0;

    if (value === 0) {
      // Remove vote.
      await client.query(
        `DELETE FROM forum_votes WHERE thread_id = $1::uuid AND voter_id = $2`,
        [id, voterId]
      );
    } else {
      // Upsert vote.
      await client.query(
        `INSERT INTO forum_votes (thread_id, voter_id, value, updated_at)
         VALUES ($1::uuid, $2, $3, now())
         ON CONFLICT (thread_id, voter_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [id, voterId, value]
      );
    }

    // Adjust like_count by the delta.
    const delta = value - oldValue;
    const updated = await client.query(
      `UPDATE forum_threads SET like_count = like_count + $1 WHERE id = $2::uuid RETURNING like_count`,
      [delta, id]
    );

    await client.query("COMMIT");
    res.json({ score: updated.rows[0].like_count, myVote: value });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// PUT /api/threads/:id/save
router.put("/:id/save", requireMember, requireProfile, async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(404).json({ error: "Thread not found" });

  const { saved } = req.body ?? {};

  if (saved) {
    await pool.query(
      `INSERT INTO forum_saves (user_id, thread_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
      [req.user.id, id]
    );
  } else {
    await pool.query(
      `DELETE FROM forum_saves WHERE user_id = $1::uuid AND thread_id = $2::uuid`,
      [req.user.id, id]
    );
  }

  res.json({ saved: !!saved });
});

// POST /api/threads
router.post("/", requireMember, requireProfile, async (req, res) => {
  const { categorySlug, title, body, imageUrl } = req.body ?? {};

  if (!categorySlug || !title || !body)
    return res.status(400).json({ error: "categorySlug, title, and body are required." });
  if (title.length < 1 || title.length > 150)
    return res.status(400).json({ error: "Title must be 1–150 characters." });
  if (body.length < 1 || body.length > 20000)
    return res.status(400).json({ error: "Body must be 1–20,000 characters." });

  // Only accept URLs from our own S3 bucket (or CloudFront distribution).
  const bucket = process.env.AWS_S3_BUCKET;
  const cdn = process.env.AWS_CLOUDFRONT_URL;
  const isS3Url = imageUrl && bucket && imageUrl.startsWith(`https://${bucket}.s3.`);
  const isCdnUrl = imageUrl && cdn && imageUrl.startsWith(cdn.replace(/\/+$/, ""));
  const cleanImageUrl = (isS3Url || isCdnUrl) ? imageUrl : null;

  const f = await getFilter();
  const badWord = checkProfanity(f, title, body);
  if (badWord) return res.status(400).json({ error: "profanity", word: badWord });

  const cleanBody = sanitizeHtml(body, SANITIZE_OPTS);

  // Resolve category and check admin_post_only.
  const catResult = await pool.query(
    `SELECT id, admin_post_only FROM forum_categories WHERE slug = $1`,
    [categorySlug]
  );
  if (catResult.rowCount === 0) return res.status(400).json({ error: "Category not found." });
  const cat = catResult.rows[0];
  if (cat.admin_post_only) return res.status(403).json({ error: "Members cannot post in Announcements." });

  const { rows } = await pool.query(
    `INSERT INTO forum_threads (category_id, author_id, title, body, image_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, title, created_at`,
    [cat.id, req.user.id, title.trim(), cleanBody, cleanImageUrl]
  );

  res.status(201).json(rows[0]);
});

// PUT /api/threads/:id/comments/:commentId/like — one like per member per comment.
// Body { liked: true | false } sets that state (sending it twice changes nothing). Without a body it
// flips the current state, which is what earlier versions of the frontend expect.
router.put("/:id/comments/:commentId/like", requireMember, async (req, res) => {
  const { id, commentId } = req.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(commentId)) return res.status(404).json({ error: "Comment not found" });

  const wanted = typeof req.body?.liked === "boolean" ? req.body.liked : null;
  const vis = visibilityClause(req);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the comment row so two requests for the same comment are applied one after the other
    // and the count cannot drift. Also confirms the comment exists, belongs to this thread, and
    // is visible to this member.
    const found = await client.query(
      `SELECT cm.id FROM forum_comments cm
       JOIN forum_threads t ON t.id = cm.thread_id
       JOIN forum_categories c ON c.id = t.category_id
       WHERE cm.id = $1::uuid AND cm.thread_id = $2::uuid AND NOT cm.is_deleted AND NOT t.is_deleted ${vis}
       FOR UPDATE OF cm`,
      [commentId, id]
    );
    if (found.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Comment not found" });
    }

    const existing = await client.query(
      `SELECT 1 FROM forum_comment_likes WHERE comment_id = $1::uuid AND user_id = $2::uuid`,
      [commentId, req.user.id]
    );
    const was = existing.rowCount > 0;
    const liked = wanted === null ? !was : wanted;

    if (liked && !was) {
      await client.query(
        `INSERT INTO forum_comment_likes (comment_id, user_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
        [commentId, req.user.id]
      );
    } else if (!liked && was) {
      await client.query(
        `DELETE FROM forum_comment_likes WHERE comment_id = $1::uuid AND user_id = $2::uuid`,
        [commentId, req.user.id]
      );
    }

    const delta = (liked ? 1 : 0) - (was ? 1 : 0);
    const updated = await client.query(
      `UPDATE forum_comments SET like_count = GREATEST(0, like_count + $1) WHERE id = $2::uuid RETURNING like_count`,
      [delta, commentId]
    );

    await client.query("COMMIT");
    res.json({ likeCount: updated.rows[0].like_count, liked });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/threads/:id/comments
router.post("/:id/comments", requireMember, requireProfile, async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(404).json({ error: "Thread not found" });

  const { body } = req.body ?? {};
  if (!body || body.length < 1 || body.length > 5000)
    return res.status(400).json({ error: "Comment must be 1–5,000 characters." });

  const f = await getFilter();
  const badWord = checkProfanity(f, body);
  if (badWord) return res.status(400).json({ error: "profanity", word: badWord });

  const cleanBody = sanitizeHtml(body, SANITIZE_OPTS);

  // Check thread exists, not deleted, not locked, and visible to this user.
  const vis = visibilityClause(req);
  const threadResult = await pool.query(
    `SELECT t.id, t.is_locked, t.author_id FROM forum_threads t
     JOIN forum_categories c ON c.id = t.category_id
     WHERE t.id = $1 AND NOT t.is_deleted ${vis}`,
    [id]
  );
  if (threadResult.rowCount === 0) return res.status(404).json({ error: "Thread not found" });
  const thread = threadResult.rows[0];
  if (thread.is_locked) return res.status(403).json({ error: "Thread is locked." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert comment.
    const commentResult = await client.query(
      `INSERT INTO forum_comments (thread_id, author_id, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [id, req.user.id, cleanBody]
    );
    const comment = commentResult.rows[0];

    // Bump counters on the thread.
    await client.query(
      `UPDATE forum_threads SET comment_count = comment_count + 1, last_activity_at = now() WHERE id = $1`,
      [id]
    );

    // Notify thread author (not if they commented on their own thread).
    if (thread.author_id !== req.user.id) {
      await client.query(
        `INSERT INTO forum_notifications (user_id, type, thread_id, comment_id, actor_id)
         VALUES ($1, 'comment', $2, $3, $4)`,
        [thread.author_id, id, comment.id, req.user.id]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ id: comment.id, createdAt: comment.created_at });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

export default router;
