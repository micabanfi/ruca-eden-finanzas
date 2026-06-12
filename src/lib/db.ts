import postgres from "postgres";

// Single postgres.js client.
//
// En Vercel (serverless) conectamos por el Transaction Pooler de Supabase
// (puerto 6543), pensado para muchísimas conexiones cortas. Por eso:
//   - prepare: false  -> el pooler en modo transacción no soporta prepared statements
//   - max: 5          -> hasta 5 conexiones por instancia. Cada página hace varias
//                        consultas con Promise.all; con max:1 se serializaban (lento,
//                        ~4s). El transaction pooler banca de sobra estas conexiones.
//   - idle_timeout    -> cierra la conexión ociosa rápido
//   - connect_timeout -> falla rápido si la base no responde (en vez de colgar)
// Cached on globalThis so Next.js dev hot-reload doesn't leak connections.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
