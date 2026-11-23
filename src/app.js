import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import categoriesRouter from "./routes/categories.js";
import lookupRouter from "./routes/lookup.js";
import searchRouter from "./routes/search.js";
import threadsRouter from "./routes/threads.js";
import authRouter from "./routes/auth.js";
import meRouter from "./routes/me.js";
import uploadRouter from "./routes/upload.js";
import { optionalMember } from "./middleware/auth.js";
import { writeRateLimit } from "./middleware/rateLimiter.js";

const app = express();

const origins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];
app.use(
  cors({
    origin: origins.length ? origins : false,
    credentials: origins.length > 0,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

// Attach req.user on every request if a valid session cookie is present.
app.use(optionalMember);

// Block write requests whose Origin header doesn't match the allowed list.
const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean)
);
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.use((req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // server-to-server or curl — allow
  if (allowedOrigins.size && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// Rate-limit all writes (20 per minute per user/IP).
app.use((req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();
  return writeRateLimit(req, res, next);
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/threads", threadsRouter);
app.use("/api/search", searchRouter);
app.use("/api/lookup", lookupRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, _req, res, _next) => {
  // Client errors raised by Express itself, such as malformed JSON, keep their 4xx status.
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: "Bad request" });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

export default app;
