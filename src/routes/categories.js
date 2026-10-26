import { Router } from "express";
import { pool } from "../config/db.js";

const router = Router();

// GET /api/categories
// Returns a plain array, which is what forum-frontend's lib/api.ts expects.
router.get("/", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT c.id, c.slug, c.name, c.description,
      (SELECT count(*)::int FROM forum_threads t WHERE t.category_id = c.id AND NOT t.is_deleted) AS thread_count
    FROM forum_categories c
    WHERE NOT c.members_only
    ORDER BY c.sort_order, c.name`);

  res.json(
    rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      threadCount: r.thread_count,
    }))
  );
});

export default router;
