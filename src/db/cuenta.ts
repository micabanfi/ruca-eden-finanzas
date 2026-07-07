import { sql } from "@/lib/db";

// La cuenta Santander y el método de pago "Alquileres" son la MISMA cuenta
// (confirmado por Mimi 2026-07-06): los egresos de ambos métodos alimentan el
// saldo. Este patrón se usa en el saldo y en el detalle de movimientos.
const CUENTA_METHOD = sql`(payment_method ILIKE '%santander%' OR payment_method ILIKE '%alquileres%')`;

/** Saldo de la cuenta Santander, en sus dos monedas.
 *  Regla de Mimi (2026-07-06): "el número que yo pongo manda". El saldo inicial
 *  es la plata REAL a su fecha; solo se le suman/restan movimientos POSTERIORES
 *  a esa fecha (los gastos viejos no lo tocan → no hay doble contabilidad).
 *  Combina, siempre posterior al saldo inicial:
 *   - cuenta_movimientos activos (ingreso/egreso manual / compra-venta)
 *   - señas de reservas activas con cuenta = Santander (suman; USD o pesos)
 *   - egresos con método Santander/Alquileres (restan; pesos) */
export interface CuentaSaldo {
  saldo_ars: string;
  saldo_usd: string;
}

export async function getCuentaSaldo(): Promise<CuentaSaldo> {
  const [row] = await sql<CuentaSaldo[]>`
    WITH ap AS (
      SELECT date AS ap_date, delta_ars, delta_usd
      FROM cuenta_movimientos
      WHERE account ILIKE 'santander' AND kind = 'apertura' AND cancelled_at IS NULL
      ORDER BY id LIMIT 1
    ), cutoff AS (SELECT COALESCE((SELECT ap_date FROM ap), DATE '1900-01-01') AS d),
    movs AS (
      -- saldo inicial (base a su fecha)
      SELECT delta_ars, delta_usd FROM ap
      UNION ALL
      -- movimientos manuales / compra-venta posteriores al saldo inicial
      SELECT delta_ars, delta_usd
      FROM cuenta_movimientos
      WHERE cancelled_at IS NULL AND account ILIKE 'santander' AND kind <> 'apertura'
        AND date > (SELECT d FROM cutoff)
      UNION ALL
      SELECT
        CASE WHEN deposit_currency = 'ARS' THEN COALESCE(deposit_ars, 0) ELSE 0 END,
        CASE WHEN deposit_currency = 'ARS' THEN 0 ELSE COALESCE(deposit_usd, 0) END
      FROM reservations
      WHERE cancelled_at IS NULL AND deposit_account ILIKE '%santander%'
        AND checkin > (SELECT d FROM cutoff)
      UNION ALL
      SELECT -COALESCE(amount_ars, 0), 0
      FROM transactions
      WHERE kind = 'egreso' AND ${CUENTA_METHOD}
        AND date > (SELECT d FROM cutoff)
    )
    SELECT ROUND(COALESCE(SUM(delta_ars), 0), 2) AS saldo_ars,
           ROUND(COALESCE(SUM(delta_usd), 0), 2) AS saldo_usd
    FROM movs`;
  return row ?? { saldo_ars: "0", saldo_usd: "0" };
}

/** Saldo inicial (apertura) crudo, para precargar el form y NO pisarlo al editar
 *  una sola moneda. Si no hay, devuelve ceros. */
export interface SaldoInicial {
  date: string | null;
  delta_ars: string;
  delta_usd: string;
}

export async function getSaldoInicial(): Promise<SaldoInicial> {
  const [row] = await sql<SaldoInicial[]>`
    SELECT to_char(date, 'YYYY-MM-DD') AS date, delta_ars, delta_usd
    FROM cuenta_movimientos
    WHERE account ILIKE 'santander' AND kind = 'apertura' AND cancelled_at IS NULL
    ORDER BY id LIMIT 1`;
  return row ?? { date: null, delta_ars: "0", delta_usd: "0" };
}

/** Un movimiento de la cuenta para el popup, ordenado por fecha. `id` viene solo
 *  cuando es una fila de cuenta_movimientos (las únicas cancelables/restaurables
 *  desde acá); las señas y egresos derivados se editan en su propia pantalla. */
export interface CuentaMov {
  id: string | null;
  date: string;
  concepto: string;
  delta_ars: string;
  delta_usd: string;
  kind: string;
  source: "cuenta" | "sena" | "egreso";
  cancelled: boolean;
}

export async function getCuentaMovimientos(): Promise<CuentaMov[]> {
  return sql<CuentaMov[]>`
    WITH ap AS (
      SELECT date AS ap_date FROM cuenta_movimientos
      WHERE account ILIKE 'santander' AND kind = 'apertura' AND cancelled_at IS NULL
      ORDER BY id LIMIT 1
    ), cutoff AS (SELECT COALESCE((SELECT ap_date FROM ap), DATE '1900-01-01') AS d)
    SELECT id::text AS id, to_char(date, 'YYYY-MM-DD') AS date,
           COALESCE(NULLIF(description, ''),
                    CASE kind WHEN 'apertura' THEN 'Saldo inicial'
                              WHEN 'fx' THEN 'Compra/venta USD' END,
                    kind) AS concepto,
           delta_ars, delta_usd, kind, 'cuenta' AS source,
           (cancelled_at IS NOT NULL) AS cancelled
    FROM cuenta_movimientos
    WHERE account ILIKE 'santander'
      AND (kind = 'apertura' OR date > (SELECT d FROM cutoff))
    UNION ALL
    SELECT NULL, to_char(checkin, 'YYYY-MM-DD'),
           'Seña' || COALESCE(' · ' || guest_name, ''),
           CASE WHEN deposit_currency = 'ARS' THEN COALESCE(deposit_ars, 0) ELSE 0 END,
           CASE WHEN deposit_currency = 'ARS' THEN 0 ELSE COALESCE(deposit_usd, 0) END,
           'sena', 'sena', false
    FROM reservations
    WHERE cancelled_at IS NULL AND deposit_account ILIKE '%santander%'
      AND checkin > (SELECT d FROM cutoff)
    UNION ALL
    SELECT NULL, to_char(date, 'YYYY-MM-DD'),
           'Egreso' || COALESCE(' · ' || description, ''),
           -COALESCE(amount_ars, 0), 0, 'egreso', 'egreso', false
    FROM transactions
    WHERE kind = 'egreso' AND ${CUENTA_METHOD}
      AND date > (SELECT d FROM cutoff)
    ORDER BY date DESC, id DESC NULLS LAST`;
}
