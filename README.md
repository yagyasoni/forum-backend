# forum-backend

API for the AuditProRx community forum. Express 5 + Postgres. Shares the AuditProRx database and owns the `forum_` tables.

## Run locally

```bash
cp .env.example .env   # fill in DATABASE_URL
npm install
npm run migrate
npm run dev            # http://localhost:5001/health
```

## Scripts

- `npm run dev` — start with nodemon
- `npm start` — start with node
- `npm run migrate` — run every .sql in src/migrations in order
- `npm run seed` — seed data for local and demo use

## Layout

```
src/
  server.js      starts the server
  app.js         express app, cors, json, /health, route mounting
  config/db.js   pg pool from DATABASE_URL
  routes/        one file per resource, mounted under /api
  middleware/    auth lands here in the member phase
  sql/           shared SQL fragments
  migrations/    numbered .sql files
  scripts/       migrate.js, seed.js
```
