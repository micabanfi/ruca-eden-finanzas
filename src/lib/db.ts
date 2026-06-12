import postgres from "postgres";

// Single postgres.js client.
//
// En Vercel (serverless) conectamos por el Transaction Pooler de Supabase
// (puerto 6543), pensado para muchísimas conexiones cortas: cada invocación
// de función usa 1 conexión y la suelta enseguida. Por eso:
//   - prepare: false  -> el pooler en modo transacción no soporta prepared statements
//   - max: 1          -> 1 conexión por instancia (no agota los slots de la base)
//   - idle_timeout    -> cierra la conexión ociosa rápido
//   - connect_timeout -> falla rápido si la base no responde (en vez de colgar)
// Cached on globalThis so Next.js dev hot-reload doesn't leak connections.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
