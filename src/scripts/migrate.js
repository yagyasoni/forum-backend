// Runs every .sql file in src/migrations in filename order.
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/db.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  const sql = await readFile(path.join(dir, file), "utf8");
  console.log(`running ${file}`);
  await pool.query(sql);
}
await pool.end();
console.log("migrations complete");
