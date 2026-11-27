import { Router } from "express";
import { pool } from "../config/db.js";

const router = Router();

// Search engines accept up to 50,000 addresses per sitemap file; stay under that.
const MAX_THREADS = 45000;

// GET /api/sitemap
// Every public thread (not deleted, not in a members-only category) with the time it last changed,
// plus the public categories. Used only by the forum frontend to build sitemap.xml.
router.get("/", async (_req, res) => {
  const [threads, categories] = await Promise.all([
    pool.query(
      `SELECT t.id, t.last_activity_at
       FROM forum_threads t
       JOIN forum_categories c ON c.id = t.category_id
       WHERE NOT t.is_deleted AND NOT c.members_only
       ORDER BY t.last_activity_at DESC
       LIMIT $1`,
      [MAX_THREADS]
    ),
    pool.query(
      `SELECT c.slug,
         (SELECT max(t.last_activity_at) FROM forum_threads t
          WHERE t.category_id = c.id AND NOT t.is_deleted) AS last_activity_at
       FROM forum_categories c
       WHERE NOT c.members_only
       ORDER BY c.sort_order, c.name`
    ),
  ]);

  res.json({
    threads: threads.rows.map((t) => ({ id: t.id, lastActivityAt: t.last_activity_at })),
    categories: categories.rows.map((c) => ({ slug: c.slug, lastActivityAt: c.last_activity_at })),
  });
});

export default router;
