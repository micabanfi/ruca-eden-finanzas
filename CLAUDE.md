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
   tx_links, warnings`; y estas vistas (`v_`): `v_booking_alerts,
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
  `max: 1` (1 conexión por instancia), `idle_timeout: 20`, `connect_timeout: 10`.

## Convenciones

- **postgres.js devuelve los `numeric` como strings.** Convertí con `Number(...)`
  al calcular. Las interfaces tipan esos campos como `string | null`.
- **Números oficiales = vistas `v_`** (replican la planilla histórica). Para
  reportes usá `v_monthly_summary`, `v_pagos_fijos_sheet`, etc. en vez de re-sumar.
- Ingresos imputados al **mes del check-in** cuando están vinculados a una reserva.
- Escrituras: Server Action → `sql`/`sql.begin` → `revalidatePath(...)`. Ej:
  cobrar inserta 1-2 `transactions` (seña/resto, cada una con su `holder`),
  marca `collected=1` y registra en `res_cobradas`.
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
