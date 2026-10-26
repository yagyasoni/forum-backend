import { Router } from "express";
import { pool } from "../config/db.js";
import { PAGE_SIZE, TABS, pageResult, parsePage, threadColumns, threadFrom } from "../sql/threads.js";

const router = Router();

// GET /api/search?q=text&page=1   (tab and category=slug are optional)
// The tab narrows the results the same way as the list; matches are ordered by rank.
// An empty q returns the list for that tab.
router.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 200);
  const page = parsePage(req.query.page);
  const tab = TABS[req.query.tab ?? "latest"];
  if (!tab) return res.status(400).json({ error: "tab must be latest, top, or unanswered" });

  const filterParams = [];
  let filters = tab.where;
  if (req.query.category) {
    filterParams.push(String(req.query.category));
    filters += ` AND c.slug = $${filterParams.length}`;
  }

  let order = tab.order;
  if (q) {
    filterParams.push(q);
    const tsq = `plainto_tsquery('english', $${filterParams.length})`;
    filters += ` AND t.search_vector @@ ${tsq}`;
    order = `ts_rank(t.search_vector, ${tsq}) DESC, t.last_activity_at DESC, t.id`;
  }
  const n = filterParams.length;

  const [list, count] = await Promise.all([
    pool.query(
      `SELECT ${threadColumns} ${threadFrom} ${filters}
       ORDER BY ${order}
       LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...filterParams, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    ),
    pool.query(`SELECT count(*)::int AS total ${threadFrom} ${filters}`, filterParams),
  ]);

  res.json(pageResult(list.rows, page, count.rows[0].total));
});

export default router;
