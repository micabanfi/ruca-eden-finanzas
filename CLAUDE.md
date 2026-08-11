@AGENTS.md

# Ruca Edén — App de Finanzas (contexto para Claude)

Next.js app que administra las finanzas de **Ruca Edén** (5 cabañas en Lago
Gutiérrez, Bariloche: Alerce, Cohiue, Maitén, Ruca / Ruca Chico —misma casa
física— y Ruqui). Dueña: **Mimi** (Micaela, "Mica"). Habla español rioplatense,
mezcla ES/EN, prefiere SQL a fórmulas de planilla, y es socia escéptica: verificá
antes de afirmar. Reemplazó a la planilla de Google (cutover hecho 2026-06-08): la
app + Supabase son la **fuente de verdad**.

> ⚠️ Esta NO es la Next.js que conocés — Next 16 tiene breaking changes (ver
> `AGENTS.md`). Leé `node_modules/next/dist/docs/` antes de escribir código nuevo.
> Ejemplo concreto: **"middleware" se renombró a `proxy`** (archivo `src/proxy.ts`,
> función `proxy()`); cubre también los Server Actions (son POST a la ruta).

## Reglas no negociables

1. **NUNCA borrar datos (regla de Mimi).** Nada de `DELETE`/`DROP` de filas de
   negocio. Siempre **soft-delete**: flag/`cancelled_at`, oculto de la vista
   principal, mostrado en una sección "Canceladas"/archivo, y **reversible**.
   Patrón de referencia: reservas con `cancelled_at TIMESTAMPTZ`
   (`cancelReservation`/`restoreReservation` en `src/actions/reservations.ts`).
   Espejá esto para cualquier futura función de "eliminar".

2. **Supabase es un proyecto COMPARTIDO.** El mismo proyecto
   (`kbxcrijyftndbnqftxhw`) aloja otro proyecto de Mimi, **"expenses"
   (finanzas-personales)**, que vive en un **schema propio llamado `z_fp`**
   (~6 tablas, ej. `z_fp.expenses`). **NUNCA leer/escribir/alterar/truncar/dropear
   nada del schema `z_fp`.** Ruca Edén vive en el schema **`public`** y posee
   exactamente estas tablas: `attribution_overrides, category_map, entregas,
   res_cobradas, res_invitaciones, reservation_nights, reservations, transactions,
   tx_links, warnings, calendar_sources, contract_links, cuenta_movimientos`;
   y estas vistas (`v_`): `v_booking_alerts,
   v_future_reservations, v_monthly_summary, v_occupancy, v_pagos_fijos,
   v_pagos_fijos_sheet, v_revenue_by_platform`. Nunca corras sentencias en bloque
   sobre todo el schema; apuntá a objetos por nombre.
   *(Nota: docs viejas decían "prefijo `z_fp_` en public" — desactualizado; hoy es
   un schema `z_fp` separado, mejor aislado.)*

## Arquitectura

- **`src/app/<seccion>/page.tsx`** — páginas (Server Components, `force-dynamic`).
  Pestañas: `dashboard`, `pagos-fijos`, `alquileres`, `ingresos-egresos`,
  `resumen`, `asistente`. `/` redirige a `/pagos-fijos`. Nav en `NavTabs.tsx`.
- **`src/db/*.ts`** — funciones de **lectura** (SELECT). Una por área:
  `reservations`, `transactions`, `dashboard`, `resumen`, `pagosFijos`.
- **`src/actions/*.ts`** — **Server Actions** (`"use server"`) que escriben:
  `reservations` (alta/edición inline/cancelar/restaurar), `cobros`
  (cobrar/vincular/marcar cobrada/invitar/entregas), `transactions`, `blue`
  (dólar blue), `asistente` (chat Claude con tool de SELECT a la base).
- **`src/components/*`** — UI cliente. Tablas editables (`ReservationsTable`,
  `TransactionsTables`), filas de cobro (`PendingCobroRow`), forms, etc.
- **`src/lib/`** — `db.ts` (cliente postgres.js), `catalog.ts` (listas: CABINS,
  PLATFORMS, HOLDERS, PAYMENT_METHODS), `format.ts` (fmtUSD/fmtARS/fmtDate),
  `blue.ts` (cotización con cache).
- **`src/proxy.ts`** — Basic Auth de toda la app.

## Conexión a la base (importante para Vercel/serverless)

`src/lib/db.ts`: un único cliente **postgres.js**. En producción corre en Vercel
serverless, así que:
- **Transaction Pooler de Supabase, puerto `6543`** en `DATABASE_URL` (NO el
  Session Pooler 5432, que agota conexiones y da errores intermitentes
  "A server error occurred").
- `prepare: false` (el pooler en modo transacción no soporta prepared statements),
  `max: 10`, `idle_timeout: 20`, `max_lifetime: 60`, `connect_timeout: 10`.
  **`max` DEBE ser >= la cantidad máxima de queries que una página lanza en
  paralelo** (`Promise.all`; dashboard/ingresos-egresos lanzan ~6-8). Si `max` <
  esa cantidad, las queries sobrantes se encolan y el handoff de conexión contra
  el pooler de transacción se cuelga → timeout de `readWithRetry` → "A server
  error occurred" (bug 2026-07-02, cuando `max` era 5).
- **Sockets zombies (bug 2026-08-10).** Entre requests Vercel *congela* la
  instancia; el socket del pool sigue "abierto" para nosotros pero el pooler ya lo
  reasignó. Al reusarlo, nuestros bytes caen en medio de otro stream y Postgres
  contesta `invalid frontend message type 32` / `08P01` (FATAL) — o la query se
  cuelga. Las **lecturas** lo sobreviven con `readWithRetry` (3 intentos, 10s+5s+5s).
  Las **escrituras** no se pueden reintentar a ciegas (duplicarían la fila), así que
  van por **`writeAction`/`withWriteConn`**, que abre una conexión nueva y exclusiva
  por escritura: el handshake mismo prueba que está viva. `writeAction` además
  traduce el error a `{ok:false, error}`, así el form lo muestra en vez de romper
  la pantalla con el error boundary.

## Convenciones

- **postgres.js devuelve los `numeric` como strings.** Convertí con `Number(...)`
  al calcular. Las interfaces tipan esos campos como `string | null`.
- **Números oficiales = vistas `v_`** (replican la planilla histórica). Para
  reportes usá `v_monthly_summary`, `v_pagos_fijos_sheet`, etc. en vez de re-sumar.
- Ingresos imputados al **mes del check-in** cuando están vinculados a una reserva.
- **Escrituras: Server Action → `writeAction((db) => ...)` → `revalidatePath(...)`.**
  Nunca `sql`/`sql.begin` directo para INSERT/UPDATE (ver la sección de conexión:
  el pool compartido tiene sockets zombies y una escritura no se puede reintentar
  sin duplicar la fila). Patrón: `const res = await writeAction(...); if (!res.ok)
  return res;` y recién ahí revalidar. Las lecturas que necesita la escritura van
  adentro del mismo callback, sobre `db`. Ej: cobrar inserta 1-2 `transactions`
  (seña/resto, cada una con su `holder`), marca `collected=1` y registra en
  `res_cobradas`, todo en una `db.begin`.
- Edición inline de reservas: doble-click en celda; los campos derivados
  (noches/total/restante) se recalculan como en la planilla
  (`updateReservation`).
- "Ruca" y "Ruca Chico" son **la misma casa física** (cuenta para solapamientos).
- `holder` = quién tiene físicamente la plata (Mica/Gustavo/Carlos/Paypal…).
  Los payouts de Airbnb caen en la cuenta **Paypal**.
- Feature reciente: **cancelar con cobro** — si una reserva se cancela tarde y se
  cobró seña/penalidad, `cancelReservation` crea un ingreso vinculado; en
  Ingresos/Egresos se resalta en rojo detectando `reservations.cancelled_at`
  (join, sin columna nueva).
- `claude-opus-4-8` es el modelo del Asistente (`src/actions/asistente.ts`).
- ⚠️ **Nunca importes un módulo solo-servidor desde un `"use client"`.** Caso real:
  `src/lib/ical.ts` usa `node-ical` (necesita `node:fs`); un componente cliente le
  importó un valor y el browser explotó al evaluar el módulo → la página no
  hidrata y aparece "This page couldn't load", con el server devolviendo **200**
  (no se ve nada en los logs de Vercel) y el **build pasando OK**. Por eso existe
  `src/lib/ical-core.ts`: tipos y helpers puros. Desde el cliente se importa de
  ahí; `ical.ts` lo re-exporta para el servidor. Si el error dice "Reload to try
  again, **or go back**" (sin `digest`), el error es del cliente, no del server.

## Deploy

- **GitHub** `micabanfi/ruca-eden-finanzas` → **Vercel** (Hobby/gratis). Push a
  `main` ⇒ redeploy automático. El repo de git **es** `app-ruca/` (Root Directory
  en Vercel = `./`); la data sensible (ETL/`.env`/`ruca.db`/planillas) queda en la
  carpeta padre `finanzas/`, fuera del repo.
- **Variables en Vercel:** `DATABASE_URL` (puerto 6543), `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`,
  y opcional `ANTHROPIC_API_KEY` (Asistente). Cambiar una variable requiere
  Redeploy para que aplique.
- **`.env.local`** está gitignored (no se sube). En local, sin `BASIC_AUTH_*` la
  app queda abierta (cómodo para dev).

## Comandos

```bash
npm run dev        # desarrollo (http://localhost:3000)
npm run build      # build de producción (verificar antes de deploy)
npx tsc --noEmit   # typecheck
npm run lint       # eslint
```
