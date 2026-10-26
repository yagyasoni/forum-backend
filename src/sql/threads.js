// Shared pieces for every query that returns thread rows.
import { authorColumns, authorJoin, mapAuthor } from "./author.js";

export const PAGE_SIZE = 8;

// Filter and order for each tab. Search applies the same filter but orders by rank.
export const TABS = {
  latest: { where: "", order: "t.is_pinned DESC, t.last_activity_at DESC, t.id" },
  top: {
    where: "AND t.last_activity_at > now() - interval '30 days'",
    order: "t.like_count DESC, t.last_activity_at DESC, t.id",
  },
  unanswered: { where: "AND t.comment_count = 0", order: "t.created_at ASC, t.id" },
};
const EXCERPT_LENGTH = 180;

// FROM clause plus the visitor exclusions. Callers append further AND conditions.
export const threadFrom = `
  FROM forum_threads t
  JOIN forum_categories c ON c.id = t.category_id
  ${authorJoin("t")}
  WHERE NOT t.is_deleted
    AND NOT c.members_only`;

// The excerpt is the body as plain text: tags stripped, whitespace collapsed.
// One character past the limit is fetched so the route knows when to add "…".
export const threadColumns = `
  t.id, t.title, t.image_url, t.is_pinned, t.is_locked, t.view_count, t.comment_count, t.like_count,
  t.last_activity_at, t.created_at,
  left(trim(regexp_replace(regexp_replace(t.body, '<[^>]+>', ' ', 'g'), '\\s+', ' ', 'g')), ${EXCERPT_LENGTH + 1}) AS excerpt,
  c.slug AS category_slug, c.name AS category_name,
  ${authorColumns("t")}`;

function toExcerpt(text) {
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text;
}

export function mapThreadRow(row) {
  return {
    id: row.id,
    title: row.title,
    excerpt: toExcerpt(row.excerpt),
    imageUrl: row.image_url,
    category: { slug: row.category_slug, name: row.category_name },
    author: mapAuthor(row),
    isPinned: row.is_pinned,
    isLocked: row.is_locked,
    viewCount: row.view_count,
    commentCount: row.comment_count,
    likeCount: row.like_count,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
  };
}

export function parsePage(value) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}

// `total` counts every thread matching the same filters, not just this page.
export function pageResult(rows, page, total) {
  return {
    items: rows.map(mapThreadRow),
    page,
    pageSize: PAGE_SIZE,
    total,
    hasMore: page * PAGE_SIZE < total,
  };
}
