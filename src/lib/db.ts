import postgres from "postgres";

// Single postgres.js client. Session Pooler (pgBouncer) => prepare: false.
// Cached on globalThis so Next.js dev hot-reload doesn't leak connections.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 5,
    idle_timeout: 30,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
