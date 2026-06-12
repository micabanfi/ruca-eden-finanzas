import { sql } from "@/lib/db";

export interface YearTotals {
  anio: string;
  ingresos_usd: string | null;
  egresos_usd: string | null;
  balance_usd: string | null;
}

export async function getYearlyTotals(): Promise<YearTotals[]> {
  // Igual que el bloque "Total" de la planilla (B57/B58): suma LA MATRIZ —
  // ingresos por mes de checkin (v_monthly_summary, fila 5) y egresos con
  // mes vencido sin Ajustes (v_pagos_fijos_sheet, fila 43).
  return sql<YearTotals[]>`
    WITH ing AS (
      SELECT left(mes,4) AS anio, SUM(ingresos_usd) AS usd
      FROM v_monthly_summary GROUP BY 1
    ), egr AS (
      SELECT left(mes,4) AS anio, SUM(usd) AS usd
      FROM v_pagos_fijos_sheet
      WHERE category IS DISTINCT FROM 'Ajuste'
      GROUP BY 1
    )
    SELECT COALESCE(i.anio, e.anio) AS anio,
           ROUND(i.usd, 2) AS ingresos_usd,
           ROUND(e.usd, 2) AS egresos_usd,
           ROUND(COALESCE(i.usd,0) - COALESCE(e.usd,0), 2) AS balance_usd
    FROM ing i FULL JOIN egr e ON i.anio = e.anio
    ORDER BY 1`;
}

export interface Ajuste {
  id: string;
  date: string;
  description: string | null;
  amount_usd: string | null;
  notes: string | null;
}

export async function getAjustes(): Promise<Ajuste[]> {
  return sql<Ajuste[]>`
    SELECT id, to_char(date,'YYYY-MM-DD') AS date, description, amount_usd, notes
    FROM transactions WHERE category = 'Ajuste' ORDER BY date`;
}

/** Control: egresos crudos (por fecha de pago) vs matriz Pagos Fijos (mes vencido,
 * sin Ajustes) por año. Si difieren, los culpables están en getProblemTxs/getShiftMoves. */
export interface ControlYear {
  anio: string;
  n_tx: string | null;
  ars: string | null;
  usd: string | null;
  matriz_usd: string | null;
}

export async function getControlEgresos(): Promise<ControlYear[]> {
  return sql<ControlYear[]>`
    WITH raw AS (
      SELECT to_char(date,'YYYY') AS anio, COUNT(*) AS n_tx,
             ROUND(SUM(amount_ars),2) AS ars, ROUND(SUM(amount_usd),2) AS usd
      FROM transactions WHERE kind='egreso' GROUP BY 1
    ), matriz AS (
      SELECT left(mes,4) AS anio, ROUND(SUM(usd),2) AS matriz_usd
      FROM v_pagos_fijos_sheet
      WHERE category IS DISTINCT FROM 'Ajuste'
      GROUP BY 1
    )
    SELECT COALESCE(r.anio, m.anio) AS anio, r.n_tx, r.ars, r.usd, m.matriz_usd
    FROM raw r FULL JOIN matriz m ON r.anio = m.anio
    ORDER BY 1`;
}

export interface ProblemTx {
  id: string;
  date: string;
  description: string | null;
  category: string | null;
  amount_ars: string | null;
  amount_usd: string | null;
  issue: string;
}

export async function getProblemTxs(): Promise<ProblemTx[]> {
  return sql<ProblemTx[]>`
    SELECT id, to_char(date,'YYYY-MM-DD') AS date, description, category,
           amount_ars, amount_usd, 'sin categoría' AS issue
    FROM transactions WHERE kind='egreso' AND category IS NULL
    UNION ALL
    SELECT id, to_char(date,'YYYY-MM-DD') AS date, description, category,
           amount_ars, amount_usd, 'sin USD' AS issue
    FROM transactions WHERE kind='egreso' AND amount_usd IS NULL
    ORDER BY date`;
}

/** Plata que el mes-vencido mueve de un año a otro (pagos de enero atribuidos
 * a diciembre del año anterior). Explica diferencias legítimas del Control. */
export interface ShiftMove {
  anio_pago: string;
  anio_matriz: string;
  usd: string | null;
  n: string;
}

export async function getShiftMoves(): Promise<ShiftMove[]> {
  return sql<ShiftMove[]>`
    SELECT to_char(t.date,'YYYY') AS anio_pago,
           to_char((t.date - (cm.month_shift || ' months')::interval)::date,'YYYY') AS anio_matriz,
           ROUND(SUM(t.amount_usd),2) AS usd, COUNT(*) AS n
    FROM transactions t
    JOIN category_map cm ON cm.canonical = t.category
    WHERE t.kind='egreso' AND cm.month_shift > 0
      AND to_char((t.date - (cm.month_shift || ' months')::interval)::date,'YYYY')
          <> to_char(t.date,'YYYY')
    GROUP BY 1, 2 ORDER BY 1`;
}
