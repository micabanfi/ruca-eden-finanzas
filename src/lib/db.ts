import postgres from "postgres";

// Single postgres.js client.
//
// En Vercel (serverless) conectamos por el Transaction Pooler de Supabase
// (puerto 6543), pensado para muchísimas conexiones cortas. La clave acá es
// SOBREVIVIR al "congelamiento" de las funciones serverless: entre requests
// Vercel congela la instancia y el socket de la conexión puede morir; si lo
// reusamos, la query queda colgada para siempre (timeout de 300s). Por eso:
//   - prepare: false   -> el pooler en modo transacción no soporta prepared statements
//   - max: 10          -> DEBE ser >= la cantidad de queries que una página dispara en
//                         paralelo (Promise.all). Las páginas pesadas (dashboard,
//                         ingresos-egresos) lanzan ~6-8. Con max:5 (< 8) las queries
//                         sobrantes se encolaban y el handoff de conexión contra el
//                         pooler de transacción se colgaba para siempre -> timeout de
//                         readWithRetry -> "A server error occurred". Con max:10 no hay
//                         encolado y además una conexión zombie no bloquea a las demás.
//   - idle_timeout: 20 -> cierra conexiones ociosas rápido (no quedan zombies dando vueltas)
//   - max_lifetime: 60 -> recicla cada conexión al minuto: nunca se reusa una vieja/muerta
//   - connect_timeout: 10 -> falla rápido si no puede conectar (en vez de colgar)
//   - fetch_types: false  -> evita un round-trip extra al abrir conexión
// Cached on globalThis so Next.js dev hot-reload doesn't leak connections.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

const PG_OPTIONS = {
  prepare: false,
  idle_timeout: 20,
  max_lifetime: 60,
  connect_timeout: 10,
  fetch_types: false,
} as const;

export const sql =
  globalForDb.sql ?? postgres(process.env.DATABASE_URL!, { ...PG_OPTIONS, max: 10 });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export type Db = ReturnType<typeof postgres>;

export interface DbWriteResult {
  ok: boolean;
  error?: string;
}

/** Corre una ESCRITURA sobre una conexión nueva y exclusiva, que se cierra al salir.
 *
 *  Por qué NO usar el pool compartido: en Vercel la instancia se congela entre
 *  requests y los sockets del pool quedan zombies. Reusar uno para un INSERT
 *  terminaba en `invalid frontend message type` (08P01: el pooler mete nuestros
 *  bytes en medio de otro stream) o en una query colgada — y una escritura no se
 *  puede reintentar a ciegas, porque duplicaría la fila. Con una conexión recién
 *  abierta el problema no existe: el handshake ya prueba que está viva.
 *
 *  Costo: el handshake son ~5 round-trips (medido 1.1s desde Bariloche con RTT de
 *  208ms; desde Vercel, a ~65ms de la DB, son ~350ms). Se paga una sola vez por
 *  escritura, que siempre es una acción manual de Mimi — barato al lado de un 500.
 *
 *  Usar SIEMPRE para INSERT/UPDATE, incluídas las lecturas que van adentro de la
 *  misma transacción (así comparten la conexión sana). */
export async function withWriteConn<T>(run: (db: Db) => Promise<T>): Promise<T> {
  const conn = postgres(process.env.DATABASE_URL!, { ...PG_OPTIONS, max: 1 });
  try {
    return await run(conn);
  } finally {
    // sin await: si el cierre tarda, no queremos demorar la respuesta
    void conn.end({ timeout: 5 }).catch(() => {});
  }
}

function writeErrorMessage(e: unknown): string {
  const err = e as { code?: unknown; message?: unknown };
  const code = String(err?.code ?? "");
  // 08xxx/57Pxx = conexión o protocolo; CONNECTION_*/ECONN* = socket muerto.
  // No es culpa de lo que cargó Mimi: reintentar suele alcanzar.
  if (/^(08|57P)/.test(code) || /^(CONNECTION_|ECONN|EPIPE|ETIMEDOUT)/.test(code))
    return "No se pudo guardar: la base de datos cortó la conexión. Probá de nuevo.";
  const msg = typeof err?.message === "string" ? err.message : "";
  return msg ? `No se pudo guardar: ${msg}` : "No se pudo guardar";
}

/** `withWriteConn` + error traducido a algo mostrable.
 *
 *  Sin esto, cualquier falla de la DB dentro de un server action explotaba en el
 *  error boundary ("Se rompió esta pantalla" + digest). Así el formulario muestra
 *  el error y la página sigue viva. */
export async function writeAction(
  run: (db: Db) => Promise<unknown>,
): Promise<DbWriteResult> {
  try {
    await withWriteConn(run);
    return { ok: true };
  } catch (e) {
    console.error("[writeAction]", e);
    return { ok: false, error: writeErrorMessage(e) };
  }
}

/** Ejecuta una LECTURA con timeout de cliente y un reintento.
 *
 *  En Vercel serverless, entre requests la instancia se "congela" y el socket
 *  de una conexión reusada puede quedar muerto: la query no responde nunca y la
 *  función recién muere a los 30s (el "Vercel Runtime Timeout"). Acá cortamos a
 *  los `ms` y reintentamos: cada intento toma otra conexión del pool (postgres.js
 *  descarta la que falló) y casi siempre anda. 3 intentos porque una página
 *  dispara ~7 lecturas en paralelo y, al despertar la instancia, varios sockets
 *  del pool pueden estar zombies a la vez.
 *
 *  SOLO para SELECTs (son idempotentes): las escrituras van por `withWriteConn`. */
export async function readWithRetry<T>(run: () => Promise<T>, ms = 10_000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 10s + 5s + 5s = 20s como techo, por debajo del maxDuration de 30s de la página
    const budget = attempt === 0 ? ms : Math.round(ms / 2);
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("DB timeout — la conexión quedó colgada")),
            budget,
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
