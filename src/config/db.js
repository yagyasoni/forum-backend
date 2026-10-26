import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // The database is shared with AuditProRx, so the forum keeps its share of connections small.
  max: Number(process.env.DB_POOL_MAX) || 5,
});

// An idle connection that drops (database restart, network blip) emits "error" on the pool.
// Without a listener Node treats it as unhandled and the whole forum process exits.
pool.on("error", (err) => {
  console.error("Idle database connection error", err);
});
