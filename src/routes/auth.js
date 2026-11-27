import bcrypt from "bcrypt";
import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { requireMember } from "../middleware/auth.js";
import { loginRateLimit } from "../middleware/rateLimiter.js";

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const COOKIE_OPTS = () => ({
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: COOKIE_SECURE ? "none" : "lax",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
});

function issueToken(userId) {
  return jwt.sign({ userId }, process.env.FORUM_JWT_SECRET, { expiresIn: "30d" });
}

// Move device votes to the authenticated user inside an open transaction client.
// Returns { threadId: newScore } for the threads whose score changed, so the browser can correct
// what it is showing without reloading: that only happens where the member had already voted on a
// thread from their account and this browser had voted on it again while signed out.
async function migrateDeviceVotes(client, userId, deviceId) {
  if (!deviceId || !/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) return {};

  // Threads the device voted on that the user hasn't voted on: take them over.
  await client.query(
    `UPDATE forum_votes SET voter_id = $1, updated_at = now()
     WHERE voter_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM forum_votes u WHERE u.voter_id = $1 AND u.thread_id = forum_votes.thread_id
       )`,
    [userId, deviceId]
  );

  // Threads both voted on: remove the device vote and subtract its value from the score.
  const corrected = await client.query(
    `UPDATE forum_threads t SET like_count = t.like_count - v.value
     FROM forum_votes v
     WHERE v.thread_id = t.id AND v.voter_id = $1
     RETURNING t.id, t.like_count`,
    [deviceId]
  );
  await client.query(`DELETE FROM forum_votes WHERE voter_id = $1`, [deviceId]);
  return Object.fromEntries(corrected.rows.map((t) => [t.id, t.like_count]));
}

// POST /api/auth/google
router.post("/google", loginRateLimit, async (req, res) => {
  const { idToken, deviceId } = req.body ?? {};
  if (!idToken) return res.status(400).json({ error: "idToken required" });

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch {
    return res.status(401).json({ error: "Invalid Google token" });
  }

  const { email, name, sub, email_verified } = ticket.getPayload();
  if (!email_verified) return res.status(401).json({ error: "Google email not verified" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find or create user.
    let { rows } = await client.query(`SELECT id, status FROM users WHERE email = $1`, [email]);
    let userId;

    if (rows.length > 0) {
      if (rows[0].status !== "active") {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Account inactive" });
      }
      userId = rows[0].id;
    } else {
      const insert = await client.query(
        `INSERT INTO users (name, email, is_verified, status)
         VALUES ($1, $2, true, 'active') RETURNING id`,
        [name || email.split("@")[0], email] // users.name is required; some Google accounts have none
      );
      userId = insert.rows[0].id;
    }

    // Upsert auth_providers row.
    await client.query(
      `INSERT INTO auth_providers (user_id, provider, provider_user_id)
       VALUES ($1, 'google', $2)
       ON CONFLICT (user_id, provider) DO UPDATE SET provider_user_id = EXCLUDED.provider_user_id`,
      [userId, sub]
    );

    const scores = await migrateDeviceVotes(client, userId, deviceId);
    await client.query("COMMIT");

    const hasProfile = await checkHasProfile(userId);
    res.cookie("forum_session", issueToken(userId), COOKIE_OPTS());
    res.json({ user: { id: userId, hasProfile }, scores });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Google login error:", err);
    res.status(500).json({ error: "Login failed" });
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post("/login", loginRateLimit, async (req, res) => {
  const { email, password, deviceId } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const { rows } = await pool.query(
    `SELECT id, password, is_verified, status FROM users WHERE email = $1`,
    [String(email).toLowerCase()]
  );

  if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

  const user = rows[0];

  if (!user.is_verified) return res.status(401).json({ error: "Email not verified" });
  if (!user.password) return res.status(401).json({ error: "use_google" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  if (user.status !== "active") return res.status(403).json({ error: "Account inactive" });

  let scores = {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    scores = await migrateDeviceVotes(client, user.id, deviceId);
    await client.query("COMMIT");
  } catch (err) {
    scores = {};
    await client.query("ROLLBACK");
    console.error("Device vote migration error:", err);
  } finally {
    client.release();
  }

  const hasProfile = await checkHasProfile(user.id);
  res.cookie("forum_session", issueToken(user.id), COOKIE_OPTS());
  res.json({ user: { id: user.id, hasProfile }, scores });
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie("forum_session", { path: "/", secure: COOKIE_SECURE, sameSite: COOKIE_SECURE ? "none" : "lax" });
  res.json({ ok: true });
});


async function checkHasProfile(userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM forum_profiles WHERE user_id = $1::uuid`,
    [userId]
  );
  return rows.length > 0;
}

export default router;
