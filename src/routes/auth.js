import bcrypt from "bcrypt";
import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { requireMember } from "../middleware/auth.js";
import { loginRateLimit } from "../middleware/rateLimiter.js";
import { memberForGoogle, memberForUser, moveVotes } from "../sql/members.js";

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

// userId in the token is the forum member id (the same as the users id for AuditProRx accounts).
function issueToken(userId) {
  return jwt.sign({ userId }, process.env.FORUM_JWT_SECRET, { expiresIn: "30d" });
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

    // A Google email AuditProRx does not know gets a forum-only member, never a users row.
    const member = await memberForGoogle(client, { email, name, sub });
    if (member.error) {
      await client.query("ROLLBACK");
      return res.status(member.status).json({ error: member.error });
    }

    // `scores` tells the browser which thread scores changed while its votes were merged in.
    const scores = await moveVotes(client, member.id, deviceId);
    await client.query("COMMIT");

    const hasProfile = await checkHasProfile(member.id);
    res.cookie("forum_session", issueToken(member.id), COOKIE_OPTS());
    res.json({ user: { id: member.id, hasProfile }, scores });
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
    `SELECT id, name, email, password, is_verified, status FROM users WHERE email = $1`,
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
    await memberForUser(client, user);
    scores = await moveVotes(client, user.id, deviceId);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Login member error:", err);
    return res.status(500).json({ error: "Login failed" });
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
