// Disponibilidad por cabaña para los meses que se elijan (tab Mensajes).
//
// REGLA DE MIMI (2026-08-31): entre una salida y la próxima entrada tiene que
// quedar SIEMPRE una noche libre (recambio). O sea: si salen el 12, la próxima
// entrada es el 13; si entran el 17, la salida anterior es el 16. Por eso una
// ventana libre entre dos reservas es  [checkout_anterior + 1 , checkin_siguiente − 1]
// y sus noches son (fin − inicio) — una ventana de un solo día = 0 noches y no
// se lista.
//
// La ocupación NO sale solo de Alquileres Detalle: se suma lo que aparece en el
// calendario de Google / Airbnb y no está cargado en la app (si no, una reserva
// que Mimi anotó solo en Google haría figurar la cabaña como libre). Esos bloques
// se marcan aparte para que se puedan cargar.

import { addDays, phys, type DiffResult } from "./ical-core";
import { ddmm } from "./mensajes";

/** Casas físicas, en el orden en que Mimi las lista. Ruca Chico es la misma casa
 *  que Ruca (ver `phys`), así que no va como fila propia. */
export const CASAS = ["Ruca", "Ruqui", "Alerce", "Coihue", "Maiten"] as const;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Subconjunto de `Reservation` que necesita el cálculo. */
export interface ResForDisp {
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD (día de salida)
  cabin: string | null;
  guest_name: string | null;
  cancelled_at: string | null;
}

/** Un tramo ocupado de una casa. `origen` distingue lo cargado en la app de lo
 *  que solo vive en un calendario externo. */
export interface Bloque {
  casa: string;
  checkin: string;
  checkout: string;
  guest: string | null;
  origen: "app" | "google" | "airbnb";
  detalle: string | null; // texto crudo del calendario, para el aviso
}

/** Ventana libre ofrecible: se puede entrar el `desde` y hay que salir el `hasta`. */
export interface Ventana {
  desde: string;
  hasta: string;
  noches: number;
  abierta: boolean; // termina en el borde del rango (o sea: "hasta fin de mes")
}

export interface DispCasa {
  casa: string;
  ventanas: Ventana[];
  ocupado: Bloque[];
}

/** Un tramo contiguo de meses elegidos (las ventanas pueden cruzar de mes). */
export interface Tramo {
  desde: string; // primer día del primer mes
  hasta: string; // último día del último mes
  meses: string[]; // 'YYYY-MM'
  titulo: string; // "enero y febrero 2027"
}

export const MIN_NOCHES = 3; // mínimo de alquiler (ver costos por recambio)

const dias = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Primer y último día (inclusive) de un mes 'YYYY-MM'. */
export const mesDesde = (mes: string): string => `${mes}-01`;
export const mesHasta = (mes: string): string => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** 'YYYY-MM' → "enero 2027" */
export const nombreMes = (mes: string): string => {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
};

/** Lista de meses seleccionables: `n` meses a partir del mes de `hoy`. */
export function mesesDisponibles(hoy: string, n = 14): string[] {
  const [y, m] = hoy.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

const siguienteMes = (mes: string): string => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** "enero y febrero 2027" / "diciembre 2026 y enero 2027" / "enero, febrero y marzo 2027" */
function tituloMeses(meses: string[]): string {
  const anios = new Set(meses.map((m) => m.slice(0, 4)));
  const partes =
    anios.size === 1
      ? meses.map((m) => MESES[Number(m.slice(5, 7)) - 1])
      : meses.map(nombreMes);
  const cola = anios.size === 1 ? ` ${meses[0].slice(0, 4)}` : "";
  if (partes.length === 1) return `${partes[0]}${cola}`;
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}${cola}`;
}

/** Agrupa los meses elegidos en tramos contiguos (así una ventana puede ir del
 *  13/01 al 04/02 en vez de cortarse el 31/01). */
export function tramosDeMeses(meses: string[]): Tramo[] {
  const orden = [...new Set(meses)].sort();
  const tramos: Tramo[] = [];
  for (const mes of orden) {
    const ult = tramos[tramos.length - 1];
    if (ult && siguienteMes(ult.meses[ult.meses.length - 1]) === mes) {
      ult.meses.push(mes);
      ult.hasta = mesHasta(mes);
      ult.titulo = tituloMeses(ult.meses);
    } else {
      tramos.push({ desde: mesDesde(mes), hasta: mesHasta(mes), meses: [mes], titulo: tituloMeses([mes]) });
    }
  }
  return tramos;
}

/** Bloques ocupados de todas las fuentes. `diff` es opcional: si el chequeo del
 *  calendario no corrió, solo se usa Alquileres Detalle. */
export function bloquesOcupados(reservas: ResForDisp[], diff?: DiffResult | null): Bloque[] {
  const out: Bloque[] = [];

  for (const r of reservas) {
    const casa = phys(r.cabin);
    if (r.cancelled_at || !casa || r.cabin === "TODAS") continue;
    out.push({ casa, checkin: r.checkin, checkout: r.checkout, guest: r.guest_name, origen: "app", detalle: null });
  }

  if (diff) {
    // Reserva anotada en Google que no está en ningún registro nuestro.
    // Convención verificada: DTEND de Google = día de salida + 1 (ver computeDiff).
    for (const e of diff.googleNotInRecords) {
      if (!e.phys) continue;
      out.push({
        casa: e.phys,
        checkin: e.start,
        checkout: addDays(e.end, -1),
        guest: e.guest,
        origen: "google",
        detalle: e.raw || null,
      });
    }
    // Reserva de Airbnb que no se cargó en Alquileres Detalle (el DTEND de Airbnb
    // ya es el día de salida).
    for (const e of diff.airbnbNotInApp) {
      if (!e.phys) continue;
      out.push({
        casa: e.phys,
        checkin: e.start,
        checkout: e.end,
        guest: e.guest,
        origen: "airbnb",
        detalle: e.raw || null,
      });
    }
    // Misma reserva con fechas distintas: se toma también el rango de Google, así
    // el tramo ocupado queda por el máximo de los dos (los bloques se fusionan).
    for (const m of diff.dateMismatch) {
      const casa = phys(m.cabin);
      if (!casa) continue;
      out.push({
        casa,
        checkin: m.google.start,
        checkout: m.google.end,
        guest: m.guest,
        origen: "google",
        detalle: `${m.cabin ?? "—"} ${ddmm(m.google.start)}–${ddmm(m.google.end)} (fechas distintas a la app)`,
      });
    }
  }

  return out;
}

/** Ventanas libres de una casa dentro de [desde, hasta], aplicando la noche de
 *  recambio. `piso` recorta el arranque (para no ofrecer días ya pasados). */
export function ventanasLibres(
  bloques: Bloque[],
  desde: string,
  hasta: string,
  piso?: string,
): Ventana[] {
  const inicio = piso && piso > desde ? piso : desde;
  if (inicio > hasta) return [];

  const orden = [...bloques].sort((a, b) => a.checkin.localeCompare(b.checkin));
  const ventanas: Ventana[] = [];
  let cursor = inicio;

  const push = (a: string, b: string, abierta: boolean) => {
    const noches = dias(a, b);
    if (noches >= 1) ventanas.push({ desde: a, hasta: b, noches, abierta });
  };

  for (const b of orden) {
    if (b.checkout < inicio) continue; // terminó antes del rango
    if (b.checkin > hasta) break; // arranca después del rango
    push(cursor, addDays(b.checkin, -1) < hasta ? addDays(b.checkin, -1) : hasta, false);
    const reapertura = addDays(b.checkout, 1);
    if (reapertura > cursor) cursor = reapertura;
  }
  push(cursor, hasta, true);

  return ventanas;
}

export function disponibilidadPorCasa(bloques: Bloque[], tramo: Tramo, hoy?: string): DispCasa[] {
  return CASAS.map((casa) => {
    const propios = bloques.filter((b) => b.casa === casa && b.checkout >= tramo.desde && b.checkin <= tramo.hasta);
    return {
      casa,
      ventanas: ventanasLibres(propios, tramo.desde, tramo.hasta, hoy),
      ocupado: propios.sort((a, b) => a.checkin.localeCompare(b.checkin)),
    };
  });
}

const rango = (v: Ventana): string =>
  v.abierta ? `${ddmm(v.desde)} hasta fin de mes` : `${ddmm(v.desde)} al ${ddmm(v.hasta)}`;

export interface DispOpts {
  meses: string[];
  hoy?: string; // recorta el mes en curso: no ofrece días pasados
  conOcupado?: boolean; // agrega el detalle de lo ocupado
}

/** Texto de disponibilidad para copiar y pegar. */
export function buildDisponibilidad(
  reservas: ResForDisp[],
  diff: DiffResult | null | undefined,
  opts: DispOpts,
): string {
  const tramos = tramosDeMeses(opts.meses);
  if (tramos.length === 0) return "(elegí al menos un mes)";

  const bloques = bloquesOcupados(reservas, diff);
  const lineas: string[] = [];
  const externos: Bloque[] = [];

  lineas.push(`DISPONIBILIDAD — ${tramos.map((t) => t.titulo).join(" / ")}`);
  lineas.push("(se puede entrar el primer día y hay que salir el último; entre una");
  lineas.push("salida y la próxima entrada ya queda la noche de recambio libre)");

  for (const tramo of tramos) {
    if (tramos.length > 1) {
      lineas.push("", `── ${tramo.titulo.toUpperCase()} ──`);
    }
    for (const d of disponibilidadPorCasa(bloques, tramo, opts.hoy)) {
      lineas.push("");
      lineas.push(`${d.casa === "Ruca" ? "Ruca (o Ruca Chico)" : d.casa}:`);
      if (d.ventanas.length === 0) {
        lineas.push("sin disponibilidad");
      } else {
        for (const v of d.ventanas) {
          const corta = v.noches < MIN_NOCHES ? "  ← abajo del mínimo de 3" : "";
          lineas.push(`${rango(v)} (${v.noches} noche${v.noches === 1 ? "" : "s"})${corta}`);
        }
      }
      if (opts.conOcupado) {
        for (const b of d.ocupado) {
          lineas.push(`   · ocupado ${ddmm(b.checkin)} al ${ddmm(b.checkout)} — ${b.guest ?? "—"}`);
        }
      }
      externos.push(...d.ocupado.filter((b) => b.origen !== "app"));
    }
  }

  if (externos.length > 0) {
    lineas.push("", "─────────────────────────────");
    lineas.push("⚠ OJO: estos tramos los conté como ocupados porque están en el");
    lineas.push("calendario, pero NO están cargados en Alquileres Detalle:");
    for (const b of externos) {
      lineas.push(
        `   ${b.casa}: ${ddmm(b.checkin)} al ${ddmm(b.checkout)} — ${b.guest ?? "—"} (${b.origen})`,
      );
    }
  }

  return lineas.join("\n");
}
