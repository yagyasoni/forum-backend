import cors from "cors";
import express from "express";
import categoriesRouter from "./routes/categories.js";
import lookupRouter from "./routes/lookup.js";
import searchRouter from "./routes/search.js";
import threadsRouter from "./routes/threads.js";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

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
