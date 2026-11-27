import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";

// Runs on every route. Sets req.user = { id, isAdmin, profile } if cookie is valid + user is active.
export async function optionalMember(req, res, next) {
  const token = req.cookies?.forum_session;
  if (!token) return next();

  let payload;
  try {
    payload = jwt.verify(token, process.env.FORUM_JWT_SECRET);
  } catch {
    res.clearCookie("forum_session");
    return next();
  }

  try {
    // The token holds a forum member id. A member linked to AuditProRx also needs an active users row;
    // a forum-only member (user_id NULL) has none, and only their own status counts.
    const { rows } = await pool.query(
      `SELECT m.id, m.status, m.user_id, u.status AS user_status, u.role,
              fp.username, fp.role AS fp_role, fp.favorite_category_ids
       FROM forum_members m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN forum_profiles fp ON fp.user_id = m.id
       WHERE m.id = $1::uuid`,
      [payload.userId]
    );

    const user = rows[0];
    const active = user && user.status === "active" && (user.user_id === null || user.user_status === "active");
    if (!active) {
      res.clearCookie("forum_session");
      return next();
    }

    req.user = {
      id: user.id,
      isAdmin: user.role === "admin",
      profile: user.username
        ? { username: user.username, role: user.fp_role, favoriteCategoryIds: user.favorite_category_ids }
        : null,
    };
  } catch (err) {
    console.error("optionalMember db error:", err);
  }

  next();
}

// 401 if not signed in.
export function requireMember(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Sign in required" });
  next();
}

// 403 if signed in but no profile yet.
export function requireProfile(req, res, next) {
  if (!req.user?.profile) return res.status(403).json({ error: "setup_required" });
  next();
}
