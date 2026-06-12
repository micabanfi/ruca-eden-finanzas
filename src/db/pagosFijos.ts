import { sql } from "@/lib/db";

export interface PagoFijoCell {
  mes: string; // 'YYYY-MM'
  category: string | null;
  ars: string | null; // numerics arrive as strings from postgres.js
  usd: string | null;
}

export interface MonthlySummary {
  mes: string;
  ingresos_usd: string | null;
  egresos_usd: string | null;
  balance_usd: string | null;
}

export async function getPagosFijosSheet(): Promise<PagoFijoCell[]> {
  return sql<PagoFijoCell[]>`
    SELECT mes, category, ars, usd FROM v_pagos_fijos_sheet ORDER BY mes, category`;
}

export async function getMonthlySummary(): Promise<MonthlySummary[]> {
  return sql<MonthlySummary[]>`SELECT * FROM v_monthly_summary ORDER BY mes`;
}
