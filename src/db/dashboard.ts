import { sql } from "@/lib/db";

// year === null => global (todos los años). Rango [desde, hasta).
function bounds(year: number | null): { desde: string; hasta: string; dias: number } {
  if (year === null) return { desde: "2000-01-01", hasta: "2100-01-01", dias: 0 };
  const desde = `${year}-01-01`;
  const hasta = `${year + 1}-01-01`;
  const bis = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return { desde, hasta, dias: bis ? 366 : 365 };
}

export async function getYears(): Promise<number[]> {
  const rows = await sql<{ y: string }[]>`
    SELECT DISTINCT to_char(date,'YYYY') AS y FROM transactions ORDER BY 1`;
  return rows.map((r) => Number(r.y));
}

export interface KPIs {
  ingresos: number;
  egresos: number;
  balance: number;
  noches: number;
  ocupacion_pct: number | null; // null en global
  tarifa_prom: number;
  reservas: number;
}

export async function getKPIs(year: number | null): Promise<KPIs> {
  const { desde, hasta, dias } = bounds(year);
  // ingresos por checkin (v_monthly_summary), egresos matriz sin Ajuste
  const [ing] = await sql<{ usd: string | null }[]>`
    SELECT ROUND(SUM(ingresos_usd),2) AS usd FROM v_monthly_summary
    WHERE ${year === null ? sql`true` : sql`mes >= ${`${year}-01`} AND mes <= ${`${year}-12`}`}`;
  const [egr] = await sql<{ usd: string | null }[]>`
    SELECT ROUND(SUM(usd),2) AS usd FROM v_pagos_fijos_sheet
    WHERE category IS DISTINCT FROM 'Ajuste'
      AND ${year === null ? sql`true` : sql`left(mes,4) = ${String(year)}`}`;
  const [occ] = await sql<{ noches: string; tarifa: string | null }[]>`
    SELECT COUNT(*) AS noches, ROUND(AVG(rate_usd),2) AS tarifa
    FROM reservation_nights WHERE night >= ${desde} AND night < ${hasta}`;
  const [res] = await sql<{ n: string }[]>`
    SELECT COUNT(*) AS n FROM reservations
    WHERE cabin <> 'TODAS' AND cancelled_at IS NULL
      AND checkin >= ${desde} AND checkin < ${hasta}`;

  const ingresos = Number(ing?.usd ?? 0);
  const egresos = Number(egr?.usd ?? 0);
  const noches = Number(occ?.noches ?? 0);
  // 5 casas físicas (Ruca y Ruca Chico son la MISMA casa, no se solapan)
  const capacidad = year === null ? 0 : dias * 5;
  return {
    ingresos,
    egresos,
    balance: Math.round((ingresos - egresos) * 100) / 100,
    noches,
    ocupacion_pct: capacidad ? Math.round((noches / capacidad) * 1000) / 10 : null,
    tarifa_prom: Number(occ?.tarifa ?? 0),
    reservas: Number(res?.n ?? 0),
  };
}

export interface CabinRow {
  cabin: string;
  noches: number;
  ocupacion_pct: number | null;
  tarifa_prom: number;
  ingresos: number;
  ganancia_est: number; // ingresos − gastos prorrateados por noches
}

export async function getPorCabana(year: number | null): Promise<CabinRow[]> {
  const { desde, hasta, dias } = bounds(year);
  const rows = await sql<
    { cabin: string; noches: string; tarifa: string | null; revenue: string | null }[]
  >`
    SELECT cabin, COUNT(*) AS noches, ROUND(AVG(rate_usd),2) AS tarifa,
           ROUND(SUM(rate_usd),2) AS revenue
    FROM reservation_nights
    WHERE night >= ${desde} AND night < ${hasta} AND cabin IS NOT NULL
    GROUP BY cabin ORDER BY revenue DESC NULLS LAST`;
  // gastos totales del período (sin Ajuste) para prorratear por noches
  const [egr] = await sql<{ usd: string | null }[]>`
    SELECT ROUND(SUM(amount_usd),2) AS usd FROM transactions
    WHERE kind='egreso' AND category IS DISTINCT FROM 'Ajuste'
      AND date >= ${desde} AND date < ${hasta}`;
  const totalEgresos = Number(egr?.usd ?? 0);
  const totalNoches = rows.reduce((a, r) => a + Number(r.noches), 0) || 1;
  return rows.map((r) => {
    const noches = Number(r.noches);
    const ingresos = Number(r.revenue ?? 0);
    const prorr = (totalEgresos * noches) / totalNoches;
    return {
      cabin: r.cabin,
      noches,
      ocupacion_pct: year === null ? null : Math.round((noches / dias) * 1000) / 10,
      tarifa_prom: Number(r.tarifa ?? 0),
      ingresos,
      ganancia_est: Math.round((ingresos - prorr) * 100) / 100,
    };
  });
}

export interface NamedAmount {
  nombre: string;
  usd: number;
  n: number;
}

// Métodos de pago de INGRESOS agrupados en ~6 grupos
export async function getMetodosPago(year: number | null): Promise<NamedAmount[]> {
  const { desde, hasta } = bounds(year);
  const rows = await sql<{ grupo: string; usd: string; n: string }[]>`
    SELECT CASE
             WHEN payment_method ILIKE '%paypal%' OR payment_method ILIKE '%airbnb%' THEN 'PayPal / Airbnb'
             ELSE 'Transferencia / USD'
           END AS grupo,
           ROUND(SUM(amount_usd),2) AS usd, COUNT(*) AS n
    FROM transactions
    WHERE kind='ingreso' AND amount_usd IS NOT NULL AND date >= ${desde} AND date < ${hasta}
    GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ nombre: r.grupo, usd: Number(r.usd), n: Number(r.n) }));
}

// Gastos agrupados en Servicios / Sueldos y limpieza / Gastos Varios
export async function getGastosPorGrupo(year: number | null): Promise<NamedAmount[]> {
  const { desde, hasta } = bounds(year);
  const rows = await sql<{ grupo: string; usd: string; n: string }[]>`
    SELECT CASE
             WHEN category IN ('Agua','Agua Casero','Luz CEB','Luz Ruca','Gas','Gas Ruca',
                  'Gas Ruqui','Gas Casero','Internet','Impuestos','VEP') THEN 'Servicios e impuestos'
             WHEN category IN ('Sueldo Casero','Sueldo Natalia','Limpieza Casera',
                  'Limpieza Juana','Costo IN/OUT') THEN 'Sueldos y limpieza'
             WHEN category = 'Gastos Varios' THEN 'Arreglos / Gastos Varios'
             ELSE 'Otros'
           END AS grupo,
           ROUND(SUM(amount_usd),2) AS usd, COUNT(*) AS n
    FROM transactions
    WHERE kind='egreso' AND amount_usd IS NOT NULL AND category IS DISTINCT FROM 'Ajuste'
      AND date >= ${desde} AND date < ${hasta}
    GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ nombre: r.grupo, usd: Number(r.usd), n: Number(r.n) }));
}

// Subdivisión de Gastos Varios por palabras clave (aproximado)
export async function getGastosVariosDetalle(year: number | null): Promise<NamedAmount[]> {
  const { desde, hasta } = bounds(year);
  const rows = await sql<{ grupo: string; usd: string; n: string }[]>`
    SELECT CASE
             WHEN description ~* 'lavander|lavadero|ropa blanca|sabanas? lav|lavado' THEN 'Lavandería'
             WHEN description ~* 'juicio|abogad|indemniz|acuerdo|walter|legal|laboral' THEN 'Legal / juicios'
             WHEN description ~* 'cerco|porton|tech|material|palm|construc|pintur|pared|garage|raul|ventana|albañil|obra|pablo|cemento|losa|escalera' THEN 'Obras y mejoras'
             WHEN description ~* 'salamandra|alarma|helad|colch|sommier|mueble|sabana|toalla|griferia|electro| tv|lavarrop|cocina|calef|aire|termotanque|vajilla|deco|sillon|cama' THEN 'Muebles y equipamiento'
             WHEN description ~* 'arreglo|reparac|plomer|service|manten|jardin|poda|desmaleza|electricista|gasista|destap' THEN 'Mantenimiento'
             WHEN description ~* 'seguro|contad|gestor|comision|banc|fee' THEN 'Administrativos'
             ELSE 'Otros varios'
           END AS grupo,
           ROUND(SUM(amount_usd),2) AS usd, COUNT(*) AS n
    FROM transactions
    WHERE kind='egreso' AND category='Gastos Varios' AND amount_usd IS NOT NULL
      AND date >= ${desde} AND date < ${hasta}
    GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ nombre: r.grupo, usd: Number(r.usd), n: Number(r.n) }));
}

export interface PlatformRow {
  platform: string;
  reservas: number;
  noches: number;
  revenue: number;
}

export async function getPorPlataforma(year: number | null): Promise<PlatformRow[]> {
  const { desde, hasta } = bounds(year);
  const rows = await sql<
    { platform: string | null; reservas: string; noches: string | null; revenue: string | null }[]
  >`
    SELECT COALESCE(platform,'(sin dato)') AS platform, COUNT(*) AS reservas,
           SUM(nights) AS noches, ROUND(SUM(total_usd),2) AS revenue
    FROM reservations
    WHERE cabin <> 'TODAS' AND cancelled_at IS NULL
      AND checkin >= ${desde} AND checkin < ${hasta}
    GROUP BY 1 ORDER BY revenue DESC NULLS LAST`;
  return rows.map((r) => ({
    platform: r.platform!,
    reservas: Number(r.reservas),
    noches: Number(r.noches ?? 0),
    revenue: Number(r.revenue ?? 0),
  }));
}

// --- vistas globales / por mes / por temporada ---------------------------

export interface YearSerie {
  anio: string;
  ingresos: number;
  egresos: number;
  ganancia: number;
  tarifa_prom: number;
}

/** Serie por año para los gráficos globales (barras + tarifa). */
export async function getSerieAnual(): Promise<YearSerie[]> {
  const ing = await sql<{ anio: string; usd: string | null }[]>`
    SELECT left(mes,4) AS anio, ROUND(SUM(ingresos_usd),2) AS usd
    FROM v_monthly_summary GROUP BY 1`;
  const egr = await sql<{ anio: string; usd: string | null }[]>`
    SELECT left(mes,4) AS anio, ROUND(SUM(usd),2) AS usd
    FROM v_pagos_fijos_sheet WHERE category IS DISTINCT FROM 'Ajuste' GROUP BY 1`;
  const tar = await sql<{ anio: string; t: string | null }[]>`
    SELECT to_char(night,'YYYY') AS anio, ROUND(AVG(rate_usd),2) AS t
    FROM reservation_nights GROUP BY 1`;
  const mI = new Map(ing.map((r) => [r.anio, Number(r.usd ?? 0)]));
  const mE = new Map(egr.map((r) => [r.anio, Number(r.usd ?? 0)]));
  const mT = new Map(tar.map((r) => [r.anio, Number(r.t ?? 0)]));
  const anios = [...new Set([...mI.keys(), ...mE.keys(), ...mT.keys()])].sort();
  return anios.map((a) => {
    const i = mI.get(a) ?? 0;
    const e = mE.get(a) ?? 0;
    return { anio: a, ingresos: i, egresos: e, ganancia: Math.round((i - e) * 100) / 100, tarifa_prom: mT.get(a) ?? 0 };
  });
}

export interface MesTarifa {
  mes: string; // 'Ene', 'Feb', ...
  tarifa: number;
  noches: number;
}

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

/** Tarifa promedio por mes de un año (line chart). */
export async function getTarifaPorMes(year: number): Promise<MesTarifa[]> {
  const rows = await sql<{ m: string; t: string | null; n: string }[]>`
    SELECT to_char(night,'MM') AS m, ROUND(AVG(rate_usd),2) AS t, COUNT(*) AS n
    FROM reservation_nights
    WHERE night >= ${`${year}-01-01`} AND night < ${`${year + 1}-01-01`}
    GROUP BY 1`;
  const byM = new Map(rows.map((r) => [Number(r.m), r]));
  return MESES.map((nombre, i) => {
    const r = byM.get(i + 1);
    return { mes: nombre, tarifa: r ? Number(r.t ?? 0) : 0, noches: r ? Number(r.n) : 0 };
  });
}

export interface Temporada {
  temporada: string;
  noches: number;
  dias_cap: number; // días de la temporada × 5 casas
  ocupacion_pct: number;
  revenue: number;
}

/** Ocupación e ingresos por temporada (alta/baja) de un año.
 * Verano alta 15/12-15/03 · Otoño baja 16/03-30/06 · Invierno alta jul-ago ·
 * Primavera baja 01/09-14/12. Capacidad = días × 5 casas físicas. */
export async function getOcupacionTemporadas(year: number): Promise<Temporada[]> {
  const { desde, hasta } = bounds(year);
  const rows = await sql<{ temporada: string; noches: string; revenue: string | null }[]>`
    SELECT CASE
             WHEN (extract(month from night)=12 AND extract(day from night)>=15)
               OR extract(month from night) IN (1,2)
               OR (extract(month from night)=3 AND extract(day from night)<=15) THEN 'Verano (alta)'
             WHEN (extract(month from night)=3 AND extract(day from night)>=16)
               OR extract(month from night) IN (4,5,6) THEN 'Otoño (baja)'
             WHEN extract(month from night) IN (7,8) THEN 'Invierno (alta)'
             ELSE 'Primavera (baja)'
           END AS temporada,
           COUNT(*) AS noches, ROUND(SUM(rate_usd),2) AS revenue
    FROM reservation_nights WHERE night >= ${desde} AND night < ${hasta}
    GROUP BY 1`;
  const bis = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  // días de cada temporada (no bisiesto: 91/107/62/105)
  const dias: Record<string, number> = {
    "Verano (alta)": bis ? 92 : 91,
    "Otoño (baja)": 107,
    "Invierno (alta)": 62,
    "Primavera (baja)": 105,
  };
  const orden = ["Verano (alta)", "Otoño (baja)", "Invierno (alta)", "Primavera (baja)"];
  const byT = new Map(rows.map((r) => [r.temporada, r]));
  return orden.map((t) => {
    const r = byT.get(t);
    const noches = r ? Number(r.noches) : 0;
    const cap = dias[t] * 5;
    return {
      temporada: t,
      noches,
      dias_cap: cap,
      ocupacion_pct: Math.round((noches / cap) * 1000) / 10,
      revenue: r ? Number(r.revenue ?? 0) : 0,
    };
  });
}
