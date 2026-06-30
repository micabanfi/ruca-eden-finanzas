import { sql } from "@/lib/db";

/** Saldo de la cuenta Santander, en sus dos monedas.
 *  Combina 3 fuentes (sin duplicar filas):
 *   - cuenta_movimientos activos (apertura / ingreso/egreso manual / compra-venta)
 *   - señas de reservas activas con cuenta = Santander (suman; USD o pesos)
 *   - egresos de transactions con método de pago Santander (restan; pesos) */
export interface CuentaSaldo {
  saldo_ars: string;
  saldo_usd: string;
}

export async function getCuentaSaldo(): Promise<CuentaSaldo> {
  const [row] = await sql<CuentaSaldo[]>`
    WITH movs AS (
      SELECT delta_ars, delta_usd
      FROM cuenta_movimientos
      WHERE cancelled_at IS NULL AND account ILIKE 'santander'
      UNION ALL
      SELECT
        CASE WHEN deposit_currency = 'ARS' THEN COALESCE(deposit_ars, 0) ELSE 0 END,
        CASE WHEN deposit_currency = 'ARS' THEN 0 ELSE COALESCE(deposit_usd, 0) END
      FROM reservations
      WHERE cancelled_at IS NULL AND deposit_account ILIKE '%santander%'
      UNION ALL
      SELECT -COALESCE(amount_ars, 0), 0
      FROM transactions
      WHERE kind = 'egreso' AND payment_method ILIKE '%santander%'
    )
    SELECT ROUND(COALESCE(SUM(delta_ars), 0), 2) AS saldo_ars,
           ROUND(COALESCE(SUM(delta_usd), 0), 2) AS saldo_usd
    FROM movs`;
  return row ?? { saldo_ars: "0", saldo_usd: "0" };
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
    SELECT id::text AS id, to_char(date, 'YYYY-MM-DD') AS date,
           COALESCE(NULLIF(description, ''),
                    CASE kind WHEN 'apertura' THEN 'Saldo inicial'
                              WHEN 'fx' THEN 'Compra/venta USD' END,
                    kind) AS concepto,
           delta_ars, delta_usd, kind, 'cuenta' AS source,
           (cancelled_at IS NOT NULL) AS cancelled
    FROM cuenta_movimientos
    WHERE account ILIKE 'santander'
    UNION ALL
    SELECT NULL, to_char(checkin, 'YYYY-MM-DD'),
           'Seña' || COALESCE(' · ' || guest_name, ''),
           CASE WHEN deposit_currency = 'ARS' THEN COALESCE(deposit_ars, 0) ELSE 0 END,
           CASE WHEN deposit_currency = 'ARS' THEN 0 ELSE COALESCE(deposit_usd, 0) END,
           'sena', 'sena', false
    FROM reservations
    WHERE cancelled_at IS NULL AND deposit_account ILIKE '%santander%'
    UNION ALL
    SELECT NULL, to_char(date, 'YYYY-MM-DD'),
           'Egreso' || COALESCE(' · ' || description, ''),
           -COALESCE(amount_ars, 0), 0, 'egreso', 'egreso', false
    FROM transactions
    WHERE kind = 'egreso' AND payment_method ILIKE '%santander%'
    ORDER BY date DESC, id DESC NULLS LAST`;
}
