import postgres from "postgres";

// Single postgres.js client.
//
// En Vercel (serverless) conectamos por el Transaction Pooler de Supabase
// (puerto 6543), pensado para muchísimas conexiones cortas. La clave acá es
// SOBREVIVIR al "congelamiento" de las funciones serverless: entre requests
// Vercel congela la instancia y el socket de la conexión puede morir; si lo
// reusamos, la query queda colgada para siempre (timeout de 300s). Por eso:
//   - prepare: false   -> el pooler en modo transacción no soporta prepared statements
//   - max: 5           -> varias conexiones; una zombie no bloquea a las demás. Cada
//                         página corre sus queries (Promise.all) en paralelo.
//   - idle_timeout: 20 -> cierra conexiones ociosas rápido (no quedan zombies dando vueltas)
//   - max_lifetime: 60 -> recicla cada conexión al minuto: nunca se reusa una vieja/muerta
//   - connect_timeout: 10 -> falla rápido si no puede conectar (en vez de colgar)
//   - fetch_types: false  -> evita un round-trip extra al abrir conexión
// Cached on globalThis so Next.js dev hot-reload doesn't leak connections.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    max_lifetime: 60,
    connect_timeout: 10,
    fetch_types: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
