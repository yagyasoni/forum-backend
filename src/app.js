import express from "express";
import cors from "cors";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// routes are mounted here under /api

export default app;
