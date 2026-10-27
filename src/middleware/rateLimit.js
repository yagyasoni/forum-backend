// Small in-memory rate limiter for write endpoints. One process, one map; enough for now.
// `max` requests per `windowMs` per key (IP plus voter id when present), else 429.

export function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map(); // key -> timestamps within the window

  // Drop stale keys now and then so the map cannot grow without bound.
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => t > cutoff);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = `${req.ip}|${req.get("x-forum-voter") ?? ""}`;
    const now = Date.now();
    const fresh = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (fresh.length >= max) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: "Too many requests, slow down" });
    }
    fresh.push(now);
    hits.set(key, fresh);
    next();
  };
}
