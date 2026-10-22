import "dotenv/config";
import app from "./app.js";
import { pool } from "./config/db.js";

const PORT = process.env.PORT || 5001;

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("Database connected");
    app.listen(PORT, () => console.log(`forum-backend listening on http://localhost:${PORT}`));
  } catch (err) {
    console.error("Database connection failed");
    console.error(err);
    process.exit(1);
  }
}

start();
