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
    const { rows } = await pool.query(
      `SELECT u.id, u.status, u.role,
              fp.username, fp.role AS fp_role, fp.favorite_category_ids
       FROM users u
       LEFT JOIN forum_profiles fp ON fp.user_id = u.id
       WHERE u.id = $1::uuid`,
      [payload.userId]
    );

    const user = rows[0];
    if (!user || user.status !== "active") {
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
