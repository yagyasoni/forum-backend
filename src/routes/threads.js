import { Router } from "express";
import { pool } from "../config/db.js";
import { authorColumns, authorJoin, mapAuthor } from "../sql/author.js";
import {
  PAGE_SIZE,
  TABS,
  mapThreadRow,
  pageResult,
  parsePage,
  threadColumns,
  threadFrom,
} from "../sql/threads.js";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const visibleThread = `
  SELECT 1 FROM forum_threads t
  JOIN forum_categories c ON c.id = t.category_id
  WHERE t.id = $1 AND NOT t.is_deleted AND NOT c.members_only`;

async function loadComments(threadId) {
  const { rows } = await pool.query(
    `SELECT cm.id, cm.body, cm.like_count, cm.created_at, ${authorColumns("cm")}
     FROM forum_comments cm
     ${authorJoin("cm")}
     WHERE cm.thread_id = $1 AND NOT cm.is_deleted
     ORDER BY cm.created_at, cm.id`,
    [threadId]
  );
  return rows.map((c) => ({
    id: c.id,
    author: mapAuthor(c),
    body: c.body,
    likeCount: c.like_count,
    createdAt: c.created_at,
  }));
}

// GET /api/threads?tab=latest|top|unanswered&category=slug&page=1
router.get("/", async (req, res) => {
  const tabName = req.query.tab ?? "latest";
  const tab = TABS[tabName];
  if (!tab) return res.status(400).json({ error: "tab must be latest, top, or unanswered" });

  const page = parsePage(req.query.page);
  const filterParams = [];
  let categoryFilter = "";
  if (req.query.category) {
    filterParams.push(String(req.query.category));
    categoryFilter = `AND c.slug = $1`;
  }
  const n = filterParams.length;

  const [list, count] = await Promise.all([
    pool.query(
      `SELECT ${threadColumns} ${threadFrom} ${tab.where} ${categoryFilter}
       ORDER BY ${tab.order}
       LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...filterParams, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    ),
    pool.query(`SELECT count(*)::int AS total ${threadFrom} ${tab.where} ${categoryFilter}`, filterParams),
  ]);

  res.json(pageResult(list.rows, page, count.rows[0].total));
});

// GET /api/threads/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(404).json({ error: "Thread not found" });

  // Count the view only when the thread is visible to visitors.
  const updated = await pool.query(
    `UPDATE forum_threads t SET view_count = t.view_count + 1
     FROM forum_categories c
     WHERE t.id = $1 AND c.id = t.category_id AND NOT t.is_deleted AND NOT c.members_only
     RETURNING t.id`,
    [id]
  );
  if (updated.rowCount === 0) return res.status(404).json({ error: "Thread not found" });

  const [threadResult, comments] = await Promise.all([
    pool.query(`SELECT ${threadColumns}, t.body ${threadFrom} AND t.id = $1`, [id]),
    loadComments(id),
  ]);

  const row = threadResult.rows[0];
  res.json({ thread: { ...mapThreadRow(row), body: row.body }, comments });
});

// GET /api/threads/:id/comments
// Used when a card's comments are expanded. Does not count a view.
router.get("/:id/comments", async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(404).json({ error: "Thread not found" });

  const visible = await pool.query(visibleThread, [id]);
  if (visible.rowCount === 0) return res.status(404).json({ error: "Thread not found" });

  res.json({ items: await loadComments(id) });
});

export default router;
