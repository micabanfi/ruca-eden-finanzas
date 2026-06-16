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

/** Ejecuta una LECTURA con timeout de cliente y un reintento.
 *
 *  En Vercel serverless, entre requests la instancia se "congela" y el socket
 *  de una conexión reusada puede quedar muerto: la query no responde nunca y la
 *  función recién muere a los 30s (el "Vercel Runtime Timeout"). Acá cortamos a
 *  los `ms` y reintentamos una vez: el segundo intento toma otra conexión del
 *  pool (max: 5) y casi siempre anda. Si las dos fallan, la página falla rápido
 *  (≈20s) en vez de colgarse los 30s enteros.
 *
 *  SOLO para SELECTs (son idempotentes): nunca envolver escrituras con esto. */
export async function readWithRetry<T>(run: () => Promise<T>, ms = 10_000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("DB timeout — la conexión quedó colgada")),
            ms,
          );
        }),
      ]);
    } catch (e) {
      lastErr = e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastErr;
}
