import { sql } from "@/lib/db";

export interface Tx {
  id: string;
  kind: "ingreso" | "egreso";
  date: string;
  description: string | null;
  amount_ars: string | null;
  amount_usd: string | null;
  blue_rate: string | null;
  category: string | null;
  payment_method: string | null;
  notes: string | null;
  holder: string | null;
  reservation_id: string | null;
  /** moneda nativa del ingreso: 'USD' | 'ARS' (pesos). Egresos: siempre pesos. */
  currency: string | null;
  /** true si el ingreso está ligado a una reserva cancelada (canceló tarde y
   *  se le cobró igual la seña/penalidad) → se resalta en rojo. */
  from_cancelled: boolean;
  // Entrega activa atada a este cobro (si la hay): cuando existe, la columna
  // "Metodo Pago" muestra "holder → mica" y el "+" abre el popup con su info.
  entrega_id: string | null;
  entrega_date: string | null;
  entrega_holder: string | null;
  entrega_amount_usd: string | null;
  entrega_amount_ars: string | null;
  entrega_currency: string | null;
  entrega_notes: string | null;
}

export async function getTransactionsByYear(year: number): Promise<Tx[]> {
  return sql<Tx[]>`
    SELECT t.id, t.kind, to_char(t.date,'YYYY-MM-DD') AS date, t.description,
           t.amount_ars, t.amount_usd, t.blue_rate, t.category, t.payment_method,
           t.notes, t.holder, t.reservation_id, t.currency,
           (r.cancelled_at IS NOT NULL) AS from_cancelled,
           e.id::text AS entrega_id, to_char(e.date,'YYYY-MM-DD') AS entrega_date,
           e.holder AS entrega_holder, e.amount_usd AS entrega_amount_usd,
           e.amount_ars AS entrega_amount_ars, e.currency AS entrega_currency,
           e.notes AS entrega_notes
    FROM transactions t
    LEFT JOIN reservations r ON r.id = t.reservation_id
    LEFT JOIN LATERAL (
      SELECT en.id, en.date, en.holder, en.amount_usd, en.amount_ars,
             en.currency, en.notes
      FROM entregas en
      WHERE en.transaction_id = t.id AND en.cancelled_at IS NULL
      ORDER BY en.id DESC LIMIT 1
    ) e ON true
    WHERE t.date >= ${`${year}-01-01`} AND t.date < ${`${year + 1}-01-01`}
    ORDER BY t.date, t.id`;
}

/** Reservas con checkin pasado, sin cobrar y sin ingreso vinculado, con un
 * candidato de ingreso existente sugerido por nombre y cercanía de fecha. */
export interface PendingCobro {
  id: string;
  checkin: string;
  guest_name: string | null;
  cabin: string | null;
  platform: string | null;
  total_usd: string | null;
  deposit_usd: string | null;
  balance_usd: string | null;
  match_tx_id: string | null;
  match_date: string | null;
  match_usd: string | null;
  match_desc: string | null;
}

export async function getPendingCobros(year: number): Promise<PendingCobro[]> {
  return sql<PendingCobro[]>`
    SELECT r.id, to_char(r.checkin,'YYYY-MM-DD') AS checkin, r.guest_name, r.cabin,
           r.platform, r.total_usd, r.deposit_usd, r.balance_usd,
           m.id AS match_tx_id, to_char(m.date,'YYYY-MM-DD') AS match_date,
           m.amount_usd AS match_usd, m.description AS match_desc
    FROM reservations r
    LEFT JOIN LATERAL (
      SELECT t.id, t.date, t.amount_usd, t.description
      FROM transactions t
      WHERE t.kind = 'ingreso' AND t.reservation_id IS NULL
        AND t.date BETWEEN r.checkin - 90 AND r.checkin + 60
        AND r.guest_name IS NOT NULL
        AND lower(t.description) LIKE
            '%' || lower(split_part(trim(r.guest_name), ' ', 1)) || '%'
      ORDER BY abs(t.date - r.checkin) LIMIT 1
    ) m ON true
    WHERE r.checkin <= current_date
      AND r.cancelled_at IS NULL
      AND r.checkin >= ${`${year}-01-01`} AND r.checkin < ${`${year + 1}-01-01`}
      AND r.collected IS DISTINCT FROM 1
      AND NOT EXISTS (SELECT 1 FROM transactions t
                      WHERE t.reservation_id = r.id AND t.kind = 'ingreso')
      AND NOT EXISTS (SELECT 1 FROM res_invitaciones i
                      WHERE i.reservation_id = r.id)
    ORDER BY r.checkin, r.id`;
}

/** Cuánto tiene cada persona = ingresos en su poder − entregas registradas.
 * Filas viejas de la planilla: el holder se infiere del método de pago —
 * "gus…" → Gustavo; "paypal"/"airbnb" → Paypal (confirmado por Mimi 2026-06-07:
 * los payouts de Airbnb caen en la cuenta PayPal). */
export interface HolderBalance {
  holder: string;
  balance_usd: string;
  balance_ars: string;
}

export async function getHolderBalances(): Promise<HolderBalance[]> {
  return sql<HolderBalance[]>`
    WITH movs AS (
      -- ingresos en poder de cada persona, separados por moneda nativa
      SELECT COALESCE(holder,
               CASE WHEN payment_method ILIKE 'gus%' THEN 'Gustavo'
                    WHEN payment_method ILIKE '%paypal%'
                      OR payment_method ILIKE '%airbnb%' THEN 'Paypal' END) AS holder,
             CASE WHEN currency = 'ARS' THEN 0 ELSE COALESCE(amount_usd, 0) END AS d_usd,
             CASE WHEN currency = 'ARS' THEN COALESCE(amount_ars, 0) ELSE 0 END AS d_ars
      FROM transactions
      WHERE kind = 'ingreso' AND (amount_usd IS NOT NULL OR amount_ars IS NOT NULL)
      UNION ALL
      -- entregas activas: restan, por moneda
      SELECT holder,
             CASE WHEN currency = 'ARS' THEN 0 ELSE -COALESCE(amount_usd, 0) END,
             CASE WHEN currency = 'ARS' THEN -COALESCE(amount_ars, 0) ELSE 0 END
      FROM entregas
      WHERE cancelled_at IS NULL
    )
    SELECT holder, ROUND(SUM(d_usd), 2) AS balance_usd,
           ROUND(SUM(d_ars), 2) AS balance_ars
    FROM movs
    WHERE holder IS NOT NULL AND holder <> 'Mica'
    GROUP BY holder
    HAVING ABS(SUM(d_usd)) > 0.01 OR ABS(SUM(d_ars)) > 0.01
    ORDER BY 2 DESC, 3 DESC`;
}

export interface Entrega {
  id: string;
  date: string;
  holder: string;
  amount_usd: string | null;
  amount_ars: string | null;
  currency: string;
  notes: string | null;
}

export async function getEntregas(): Promise<Entrega[]> {
  return sql<Entrega[]>`
    SELECT id, to_char(date,'YYYY-MM-DD') AS date, holder, amount_usd, amount_ars,
           COALESCE(currency, 'USD') AS currency, notes
    FROM entregas
    WHERE cancelled_at IS NULL
    ORDER BY date DESC, id DESC LIMIT 20`;
}

export async function getYears(): Promise<number[]> {
  const rows = await sql<{ y: string }[]>`
    SELECT DISTINCT to_char(date,'YYYY') AS y FROM transactions ORDER BY 1`;
  return rows.map((r) => Number(r.y));
}

export async function getCategories(): Promise<string[]> {
  const rows = await sql<{ canonical: string }[]>`
    SELECT canonical FROM category_map ORDER BY canonical`;
  return rows.map((r) => r.canonical);
}
