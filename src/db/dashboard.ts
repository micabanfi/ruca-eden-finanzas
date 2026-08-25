import { sql } from "@/lib/db";
import { phys } from "@/lib/ical";

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
  noches_disponibles: number; // cupo rentable del año (ventana real); 0 en global
  ocupacion_pct: number | null; // null en global
  tarifa_prom: number;
  reservas: number;
}

// --- Disponibilidad real por casa física (reglas de Mimi, 2026-07-27) --------
// Casas físicas = 5. "Ruca Chico" NO es una sexta: es la misma casa que Ruca
// (se alquila una o la otra, nunca las dos) → no suma cupo propio y sus noches
// se le imputan a Ruca.
//   · Maitén — solo temporada de verano (15/12–15/03).
//   · Coihue — era solo verano, igual que Maitén. Desde el 16/03/2026 se
//     alquila todo el año.
//   · Alerce, Ruca, Ruqui — todo el año.
// Septiembre es de uso familiar, pero NO se descuenta del cupo: la casa está
// disponible y la decisión de no alquilarla es propia. En el gráfico se aclara.
export const CASAS = ["Alerce", "Coihue", "Maiten", "Ruca", "Ruqui"];
const COIHUE_TODO_EL_ANIO_DESDE = "2026-03-16";

export const TEMPORADAS = [
  "Verano (alta)",
  "Otoño (baja)",
  "Invierno (alta)",
  "Primavera (baja)",
] as const;

// Mismos cortes que el CASE de getOcupacionTemporadas (mantener en sync).
function temporadaDe(mes: number, dia: number): string {
  if ((mes === 12 && dia >= 15) || mes === 1 || mes === 2 || (mes === 3 && dia <= 15))
    return "Verano (alta)";
  if ((mes === 3 && dia >= 16) || mes === 4 || mes === 5 || mes === 6) return "Otoño (baja)";
  if (mes === 7 || mes === 8) return "Invierno (alta)";
  return "Primavera (baja)";
}

function esVerano(mes: number, dia: number): boolean {
  return temporadaDe(mes, dia) === "Verano (alta)";
}

function disponible(casa: string, iso: string, mes: number, dia: number): boolean {
  if (casa === "Maiten") return esVerano(mes, dia);
  if (casa === "Coihue") return esVerano(mes, dia) || iso >= COIHUE_TODO_EL_ANIO_DESDE;
  return true;
}

/** Cupo del año en noches-casa, desglosado por temporada y por casa física.
 *  Recorre día por día (365/366 × 5 = trivial) para que el corte de Coihue en
 *  marzo 2026 y los bisiestos caigan exactos, sin constantes a mano. */
function cupoAnual(year: number) {
  const porTemporada = new Map<string, number>();
  const porCasa = new Map<string, number>();
  const casasDeTemporada = new Map<string, Set<string>>();
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    const mes = d.getUTCMonth() + 1;
    const dia = d.getUTCDate();
    const iso = d.toISOString().slice(0, 10);
    const t = temporadaDe(mes, dia);
    for (const casa of CASAS) {
      if (!disponible(casa, iso, mes, dia)) continue;
      porTemporada.set(t, (porTemporada.get(t) ?? 0) + 1);
      porCasa.set(casa, (porCasa.get(casa) ?? 0) + 1);
      if (!casasDeTemporada.has(t)) casasDeTemporada.set(t, new Set());
      casasDeTemporada.get(t)!.add(casa);
    }
    d.setUTCDate(dia + 1);
  }
  const total = [...porCasa.values()].reduce((a, b) => a + b, 0);
  return { porTemporada, porCasa, casasDeTemporada, total };
}

// Noches rentables del año para una cabaña. null = no tiene cupo propio
// (Ruca Chico comparte casa con Ruca) o vista global.
function capacidadCabana(cabin: string, year: number | null): number | null {
  if (year === null) return null; // global
  if (cabin === "Ruca Chico") return null; // comparte casa con Ruca
  return cupoAnual(year).porCasa.get(phys(cabin) ?? cabin) ?? null;
}

// Cupo total del año sumando las 5 casas según su ventana real.
function capacidadTotal(year: number | null): number {
  if (year === null) return 0;
  return cupoAnual(year).total;
}

export async function getKPIs(year: number | null): Promise<KPIs> {
  const { desde, hasta } = bounds(year);
  // ingresos por checkin (v_monthly_summary), egresos de la matriz.
  // Los Ajustes (ej. "Pago Ruben" 3.000 USD en 2024) SÍ cuentan acá: son plata que
  // salió de verdad. La matriz de Pagos Fijos los excluye a propósito (replica la
  // planilla vieja, donde no eran un gasto fijo mensual), pero el Dashboard mide
  // el resultado real y tiene que dar lo mismo que el acumulado del Resumen.
  const [ing] = await sql<{ usd: string | null }[]>`
    SELECT ROUND(SUM(ingresos_usd),2) AS usd FROM v_monthly_summary
    WHERE ${year === null ? sql`true` : sql`mes >= ${`${year}-01`} AND mes <= ${`${year}-12`}`}`;
  const [egr] = await sql<{ usd: string | null }[]>`
    SELECT ROUND(SUM(usd),2) AS usd FROM v_pagos_fijos_sheet
    WHERE ${year === null ? sql`true` : sql`left(mes,4) = ${String(year)}`}`;
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
  // Cupo "ventana real": suma de las 5 casas según su ventana de alquiler.
  const capacidad = capacidadTotal(year);
  return {
    ingresos,
    egresos,
    balance: Math.round((ingresos - egresos) * 100) / 100,
    noches,
    noches_disponibles: capacidad,
    ocupacion_pct: capacidad ? Math.round((noches / capacidad) * 1000) / 10 : null,
    tarifa_prom: Number(occ?.tarifa ?? 0),
    reservas: Number(res?.n ?? 0),
  };
}

export interface CabinRow {
  cabin: string;
  noches: number;
  disponibles: number | null; // cupo del año (ventana real); null = comparte casa
  ocupacion_pct: number | null;
  tarifa_prom: number;
  ingresos: number;
  ganancia_est: number; // ingresos − gastos prorrateados por noches
}

export async function getPorCabana(year: number | null): Promise<CabinRow[]> {
  const { desde, hasta } = bounds(year);
  // "Cohiue" es la grafía vieja de "Coihue" (misma casa): se normaliza acá o si
  // no la tabla y el gráfico muestran la cabaña dos veces (igual que phys(),
  // pero SIN unir Ruca con Ruca Chico, que acá van en filas separadas).
  const rows = await sql<
    { cabin: string; noches: string; tarifa: string | null; revenue: string | null }[]
  >`
    SELECT CASE WHEN cabin = 'Cohiue' THEN 'Coihue' ELSE cabin END AS cabin,
           COUNT(*) AS noches, ROUND(AVG(rate_usd),2) AS tarifa,
           ROUND(SUM(rate_usd),2) AS revenue
    FROM reservation_nights
    WHERE night >= ${desde} AND night < ${hasta} AND cabin IS NOT NULL
    GROUP BY 1 ORDER BY revenue DESC NULLS LAST`;
  // gastos totales del período para prorratear por noches (Ajustes incluidos,
  // igual que en los KPIs: si no, la ganancia estimada no cierra con el balance)
  const [egr] = await sql<{ usd: string | null }[]>`
    SELECT ROUND(SUM(amount_usd),2) AS usd FROM transactions
    WHERE kind='egreso' AND date >= ${desde} AND date < ${hasta}`;
  const totalEgresos = Number(egr?.usd ?? 0);
  const totalNoches = rows.reduce((a, r) => a + Number(r.noches), 0) || 1;
  const nochesPorCabana = new Map(rows.map((r) => [r.cabin, Number(r.noches)]));
  return rows.map((r) => {
    const noches = Number(r.noches);
    const ingresos = Number(r.revenue ?? 0);
    const prorr = (totalEgresos * noches) / totalNoches;
    const disponibles = capacidadCabana(r.cabin, year);
    // Ruca y Ruca Chico = misma casa: la ocupación de Ruca incluye las noches
    // de Ruca Chico (que no tiene cupo propio), para no subestimar la casa.
    const nochesOcup =
      r.cabin === "Ruca" ? noches + (nochesPorCabana.get("Ruca Chico") ?? 0) : noches;
    return {
      cabin: r.cabin,
      noches,
      disponibles,
      ocupacion_pct: disponibles ? Math.round((nochesOcup / disponibles) * 1000) / 10 : null,
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

// Métodos de pago de INGRESOS.
//
// OJO con la calidad del dato (verificado 2026-08-05): `payment_method` es texto
// libre escrito a mano — 35 valores distintos con variantes y typos ("Cash Male"
// / "cash male" / "Cash male/laprida", "Mica Santander" / "mica banco"). No hay
// campo limpio alternativo: `currency` es 'USD' en los 194 ingresos (todo se
// guarda normalizado a dólares) y `holder` está vacío en el 91%. Así que la
// separación transferencia/efectivo se deduce del texto y es aproximada.
//
// El orden de los WHEN importa: "cash nati/y 100usd transferidos" es mayormente
// efectivo, así que efectivo se evalúa ANTES que transferencia.
//
// Decisión de Mimi (2026-08-05): los ~73.600 USD cuyo payment_method es solo un
// nombre ("Carlos", "aline", "Mica", "nati" — el 37% de los ingresos) cuentan
// como Efectivo / USD, o sea que caen en el ELSE. El dato no lo dice; es una
// asunción deliberada para que la torta quede legible.
export async function getMetodosPago(year: number | null): Promise<NamedAmount[]> {
  const { desde, hasta } = bounds(year);
  const rows = await sql<{ grupo: string; usd: string; n: string }[]>`
    SELECT CASE
             WHEN payment_method IS NULL OR btrim(payment_method) = '' THEN 'Sin dato'
             WHEN payment_method ~* 'paypal|airbnb' THEN 'PayPal / Airbnb'
             WHEN payment_method ~* 'cash|efectivo|financiera|western|usd' THEN 'Efectivo / USD'
             -- 'alquileres' = la cuenta DÉBITO del Santander (ver catalog.ts), o sea
             -- transferencia. Es el nombre canónico de lo que en el texto libre
             -- aparece como "micaela santander" / "Mica Santander" (Mimi 2026-08-05:
             -- "micaela santander es lo mismo que alquileres, o sea santander débito").
             -- Sin esto caía en el ELSE = Efectivo / USD, que es justo lo contrario.
             WHEN payment_method ~* 'santander|banco|galicia|alquileres|mercado ?pago|transferen|transferid|(^|[^a-z])mp([^a-z]|$)'
               THEN 'Transferencia'
             ELSE 'Efectivo / USD'
           END AS grupo,
           ROUND(SUM(amount_usd),2) AS usd, COUNT(*) AS n
    FROM transactions
    WHERE kind='ingreso' AND amount_usd IS NOT NULL AND date >= ${desde} AND date < ${hasta}
    GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ nombre: r.grupo, usd: Number(r.usd), n: Number(r.n) }));
}

// Lavandería se detecta por la descripción, no por categoría: en la base cae
// dentro de category='Gastos Varios'. La regex vive acá, en una sola constante,
// porque la usan DOS gráficos (Gastos por grupo y el desglose de Gastos Varios)
// y si se desincronizan los totales dejan de cerrar entre sí.
// Se interpola como parámetro (`description ~* ${RE}`), no como SQL crudo.
const RE_LAVANDERIA = "lavander|lavadero|ropa blanca|sabanas? lav|lavado";
// Excepciones: cosas físicas PARA el lavadero que no son gasto de lavandería.
// "vidrio ruqui lavadero" es un vidrio, no un lavado (Mimi, 2026-08-05).
const RE_LAVANDERIA_EXCEPCIONES = "vidrio";

// Gastos por grupo: todas las categorías del select de Ingresos/Egresos, con las
// variantes de un mismo servicio unificadas (Mimi 2026-08-05: "luz(todo) /
// gas(todo) / internet / agua / impuestos / vep / sueldos").
//   Luz      <- Luz CEB, Luz Ruca
//   Gas      <- Gas, Gas Ruca, Gas Ruqui, Gas Casero
//   Agua     <- Agua, Agua Casero
//   Sueldos  <- Sueldo Casero, Sueldo Natalia
//   Limpieza <- Limpieza Casera, Limpieza Juana, Costo IN/OUT
// Internet, Impuestos, VEP, Gastos Varios y Ajuste quedan solos.
// Lavandería sale de adentro de Gastos Varios y va como grupo propio: es un
// gasto grande y recurrente (USD 5.349 solo en 2026) que no se veía (Mimi,
// 2026-08-05). Por eso la barra "Gastos Varios" acá EXCLUYE lavandería, y
// "Gastos Varios" + "Lavandería" = el total de la torta de desglose.
// Se dibuja con barras horizontales, no torta: Gastos Varios es ~78% del total,
// así que en una torta el resto quedaba invisible.
export async function getGastosPorGrupo(year: number | null): Promise<NamedAmount[]> {
  const { desde, hasta } = bounds(year);
  const rows = await sql<{ grupo: string; usd: string; n: string }[]>`
    SELECT CASE
             WHEN category IN ('Luz CEB','Luz Ruca')                        THEN 'Luz'
             WHEN category IN ('Gas','Gas Ruca','Gas Ruqui','Gas Casero')   THEN 'Gas'
             WHEN category IN ('Agua','Agua Casero')                        THEN 'Agua'
             WHEN category IN ('Sueldo Casero','Sueldo Natalia')            THEN 'Sueldos'
             WHEN category IN ('Limpieza Casera','Limpieza Juana','Costo IN/OUT') THEN 'Limpieza'
             WHEN category = 'Internet'      THEN 'Internet'
             WHEN category = 'Impuestos'     THEN 'Impuestos'
             WHEN category = 'VEP'           THEN 'VEP'
             -- lavandería antes que el Gastos Varios genérico, si no nunca entra
             WHEN category = 'Gastos Varios'
                  AND description ~* ${RE_LAVANDERIA}
                  AND description !~* ${RE_LAVANDERIA_EXCEPCIONES} THEN 'Lavandería'
             WHEN category = 'Gastos Varios' THEN 'Gastos Varios'
             -- grupo propio para que un Ajuste no se esconda dentro de "Otros"
             WHEN category = 'Ajuste'        THEN 'Ajuste'
             ELSE 'Otros'
           END AS grupo,
           ROUND(SUM(amount_usd),2) AS usd, COUNT(*) AS n
    FROM transactions
    WHERE kind='egreso' AND amount_usd IS NOT NULL
      AND date >= ${desde} AND date < ${hasta}
    GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ nombre: r.grupo, usd: Number(r.usd), n: Number(r.n) }));
}

export interface VarioRow {
  id: number;
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  usd: number;
  grupo: string;
}

// Subdivisión de Gastos Varios por palabras clave (aproximado).
//
// Devuelve las FILAS, no los totales: la torta se agrega en el cliente a partir
// de esto (ver DashboardCharts). Así el desglose que se abre al clickear una
// porción sale exactamente de las mismas filas que la porción — no hay dos
// clasificaciones que se puedan desincronizar.
export async function getGastosVariosRows(year: number | null): Promise<VarioRow[]> {
  const { desde, hasta } = bounds(year);
  const rows = await sql<
    { id: string; fecha: string; descripcion: string | null; usd: string; grupo: string }[]
  >`
    SELECT id, date::text AS fecha, description AS descripcion,
           -- SIN redondear: la torta se agrega sumando estas filas en el cliente,
           -- y 790 de las 846 tienen más de 2 decimales. Redondeando acá, la suma
           -- de las porciones quedaba 13 centavos abajo del total de "Gastos
           -- Varios" en el gráfico de al lado. Se redondea al mostrar (fmtUSD).
           amount_usd AS usd,
           CASE
             WHEN description ~* ${RE_LAVANDERIA}
                  AND description !~* ${RE_LAVANDERIA_EXCEPCIONES} THEN 'Lavandería'
             WHEN description ~* 'juicio|abogad|indemniz|acuerdo|walter|legal|laboral' THEN 'Legal / juicios'
             -- 'radiador' agregado 2026-08-05: los 4 movimientos de radiadores de
             -- ruqui (mario 981 + morales 105/93/19) caían en "Otros varios",
             -- separados de las otras 3 filas del mismo trabajo.
             WHEN description ~* 'cerco|porton|tech|material|palm|construc|pintur|pared|garage|raul|ventana|albañil|obra|pablo|cemento|losa|escalera|radiador' THEN 'Obras y mejoras'
             WHEN description ~* 'salamandra|alarma|helad|colch|sommier|mueble|sabana|toalla|griferia|electro| tv|lavarrop|cocina|calef|aire|termotanque|vajilla|deco|sillon|cama' THEN 'Muebles y equipamiento'
             WHEN description ~* 'arreglo|reparac|plomer|service|manten|jardin|poda|desmaleza|electricista|gasista|destap' THEN 'Mantenimiento'
             WHEN description ~* 'seguro|contad|gestor|comision|banc|fee' THEN 'Administrativos'
             ELSE 'Otros varios'
           END AS grupo
    FROM transactions
    WHERE kind='egreso' AND category='Gastos Varios' AND amount_usd IS NOT NULL
      AND date >= ${desde} AND date < ${hasta}
    ORDER BY date DESC, id DESC`;
  return rows.map((r) => ({
    id: Number(r.id),
    fecha: r.fecha,
    descripcion: r.descripcion ?? "(sin descripción)",
    usd: Number(r.usd),
    grupo: r.grupo,
  }));
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
    FROM v_pagos_fijos_sheet GROUP BY 1`; // con Ajustes, igual que los KPIs
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

export interface MesSerie {
  mes: string; // 'Ene', 'Feb', ...
  ingresos: number;
  egresos: number;
  ganancia: number;
}

/** Ingresos / egresos / ganancia mes a mes de un año (barras). El equivalente
 *  mensual de getSerieAnual: mismas fuentes (v_monthly_summary + la matriz) para
 *  que los 12 meses sumen exactamente los KPIs del año. Los meses sin datos van
 *  en 0 para que el eje X siempre muestre el año completo. */
export async function getSerieMensual(year: number): Promise<MesSerie[]> {
  const ing = await sql<{ m: string; usd: string | null }[]>`
    SELECT right(mes,2) AS m, ROUND(SUM(ingresos_usd),2) AS usd
    FROM v_monthly_summary WHERE left(mes,4) = ${String(year)} GROUP BY 1`;
  const egr = await sql<{ m: string; usd: string | null }[]>`
    SELECT right(mes,2) AS m, ROUND(SUM(usd),2) AS usd
    FROM v_pagos_fijos_sheet WHERE left(mes,4) = ${String(year)} GROUP BY 1`;
  const mI = new Map(ing.map((r) => [Number(r.m), Number(r.usd ?? 0)]));
  const mE = new Map(egr.map((r) => [Number(r.m), Number(r.usd ?? 0)]));
  return MESES.map((nombre, i) => {
    const ingresos = mI.get(i + 1) ?? 0;
    const egresos = mE.get(i + 1) ?? 0;
    return {
      mes: nombre,
      ingresos,
      egresos,
      ganancia: Math.round((ingresos - egresos) * 100) / 100,
    };
  });
}

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
  rango: string; // "15/12–15/03"
  casas: string[]; // casas realmente disponibles en esa temporada, ese año
  nota: string | null; // aclaración a mostrar bajo el nombre
  noches: number;
  dias_cap: number; // cupo real = Σ días disponibles de cada casa
  ocupacion_pct: number;
  revenue: number;
}

const RANGO_TEMPORADA: Record<string, string> = {
  "Verano (alta)": "15/12–15/03",
  "Otoño (baja)": "16/03–30/06",
  "Invierno (alta)": "01/07–31/08",
  "Primavera (baja)": "01/09–14/12",
};

/** Ocupación e ingresos por temporada (alta/baja) de un año.
 * El cupo NO es "días × 5": usa solo las casas disponibles en esa temporada
 * (Maitén solo verano; Coihue solo verano hasta el 16/03/2026; Ruca y Ruca
 * Chico cuentan como una sola casa). Ver cupoAnual(). */
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
  const { porTemporada, casasDeTemporada } = cupoAnual(year);
  const byT = new Map(rows.map((r) => [r.temporada, r]));
  return TEMPORADAS.map((t) => {
    const r = byT.get(t);
    const noches = r ? Number(r.noches) : 0;
    const cap = porTemporada.get(t) ?? 0;
    return {
      temporada: t,
      rango: RANGO_TEMPORADA[t],
      casas: CASAS.filter((c) => casasDeTemporada.get(t)?.has(c)),
      nota: t === "Primavera (baja)" ? "septiembre familiar" : null,
      noches,
      dias_cap: cap,
      ocupacion_pct: cap ? Math.round((noches / cap) * 1000) / 10 : 0,
      revenue: r ? Number(r.revenue ?? 0) : 0,
    };
  });
}

export interface Proyeccion {
  cobrado: number; // ingresos ya cobrados del año (transactions)
  por_cobrar: number; // restante de reservas futuras confirmadas (no canceladas)
  proyeccion: number; // cobrado + por_cobrar
  reservas_futuras: number;
}

/** Proyección de fin de año: lo ya cobrado + lo que falta cobrar de las
 *  reservas futuras (checkin de hoy en adelante, dentro del año, no canceladas).
 *  El "por cobrar" usa el restante (balance_usd) para no duplicar señas ya cobradas. */
export async function getProyeccionAnual(year: number): Promise<Proyeccion> {
  const { hasta } = bounds(year);
  const [ing] = await sql<{ usd: string | null }[]>`
    SELECT ROUND(SUM(ingresos_usd),2) AS usd FROM v_monthly_summary
    WHERE mes >= ${`${year}-01`} AND mes <= ${`${year}-12`}`;
  const [fut] = await sql<{ usd: string | null; n: string }[]>`
    SELECT ROUND(SUM(COALESCE(balance_usd, total_usd)),2) AS usd, COUNT(*) AS n
    FROM reservations
    WHERE cabin <> 'TODAS' AND cancelled_at IS NULL
      AND checkin >= CURRENT_DATE AND checkin < ${hasta}`;
  const cobrado = Number(ing?.usd ?? 0);
  const por_cobrar = Number(fut?.usd ?? 0);
  return {
    cobrado,
    por_cobrar,
    proyeccion: Math.round((cobrado + por_cobrar) * 100) / 100,
    reservas_futuras: Number(fut?.n ?? 0),
  };
}
