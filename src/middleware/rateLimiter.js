// Simple in-memory rate limiter. Sufficient for a single-process server.
// Replace with Redis-backed express-rate-limit before horizontal scaling.

const store = new Map(); // key → { count, resetAt }

function hit(key, limit, windowMs) {
  const now = Date.now();
  let entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  entry.count += 1;
  return entry.count > limit;
}

// Prune once every 10 minutes so the map does not grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 10 * 60 * 1000).unref();

/**
 * Login rate limiter: 10 per 15 min per email, 20 per 15 min per IP.
 * Expects req.body.email to be present (call after express.json()).
 */
export function loginRateLimit(req, res, next) {
  const WINDOW = 15 * 60 * 1000; // 15 minutes
  const ip = req.ip ?? "unknown";
  const email = String(req.body?.email ?? "").toLowerCase().trim();

  if (email && hit(`login:email:${email}`, 10, WINDOW)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }
  if (hit(`login:ip:${ip}`, 20, WINDOW)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }
  next();
}

/**
 * Write rate limiter, per user (by user id, or IP for visitors). Two separate budgets:
 *   - content (posts, comments, uploads, profile): 20 per minute
 *   - reactions (vote, like, save): 60 per minute. These are one click each and people toggle
 *     them quickly; counting them against the content budget threw ordinary votes back.
 * Must run after optionalMember so req.user is set.
 */
const REACTION_PATH = /\/(vote|like|save)\/?$/;

export function writeRateLimit(req, res, next) {
  const WINDOW = 60 * 1000; // 1 minute
  const reaction = REACTION_PATH.test(req.path);
  const who = req.user ? `user:${req.user.id}` : `ip:${req.ip ?? "unknown"}`;
  const key = `${reaction ? "react" : "write"}:${who}`;
  if (hit(key, reaction ? 60 : 20, WINDOW)) {
    return res.status(429).json({ error: "Too many requests. Slow down." });
  }
  next();
}
