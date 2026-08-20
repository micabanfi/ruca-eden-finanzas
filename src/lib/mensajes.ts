// Helpers puros para la tab Mensajes: pax por cabaña, armado del mensaje de
// reserva, texto fijo de aclaraciones, y la URL de prellenado del contrato JotForm.

export const JOTFORM_FORM_ID = "251346404353047";

// Pax máximo por cabaña (editable en cada mensaje desde la UI).
export const CABIN_PAX: Record<string, number> = {
  Alerce: 8,
  Coihue: 6,
  Cohiue: 6, // grafía vieja, se sigue aceptando
  Maiten: 8,
  Ruca: 8,
  "Ruca Chico": 4,
  Ruqui: 6,
};

// La grafía correcta es "Coihue"; datos viejos pueden decir "Cohiue" → se muestran
// como "Coihue" igual.
const MSG_CABIN: Record<string, string> = { Cohiue: "Coihue" };
export const dispCabin = (name: string): string => MSG_CABIN[name] ?? name;

export interface CabinSel {
  name: string;
  pax: number;
}
export interface ReservaData {
  guest: string;
  cabins: CabinSel[];
  checkin: string; // 'YYYY-MM-DD'
  checkout: string; // 'YYYY-MM-DD'
  ppn: number; // valor por noche (por cabaña)
  total: number;
  senia: number;
  gastosExtra: string;
  deposito: number;
}

export const nightsBetween = (checkin: string, checkout: string): number => {
  if (!checkin || !checkout) return 0;
  return Math.max(0, Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000));
};

/** miles con punto, sin decimales (es-AR): 7500 -> "7.500" */
export const fmtMonto = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString("es-AR") : "";

export const ddmm = (d: string): string => {
  const [, m, day] = d.split("-");
  return d ? `${day}/${m}` : "";
};
/** Subcampos día/mes/año que esperan los date pickers de JotForm (no un string).
 *  El campo `fechaX` es de tipo fecha → se prellena con `fechaX[day]/[month]/[year]`,
 *  no con `fechaX=DD/MM/YYYY` (que JotForm ignora dejando el campo vacío). */
const dateParts = (field: string, d: string): Record<string, string> => {
  if (!d) return {};
  const [y, m, day] = d.split("-");
  return {
    [`${field}[day]`]: String(Number(day)),
    [`${field}[month]`]: String(Number(m)),
    [`${field}[year]`]: y,
  };
};

/** Mensaje de reserva para WhatsApp (maneja 1 o varias cabañas). */
export function buildReservaMsg(d: ReservaData): string {
  const n = d.cabins.length;
  const multi = n > 1;
  const nights = nightsBetween(d.checkin, d.checkout);
  const cabinsLine = d.cabins.map((c) => `${dispCabin(c.name)} (${c.pax} pax)`).join(", ");
  const totalSuffix = `(${nights} noche${nights === 1 ? "" : "s"}${multi ? `; ${n} cabañas` : ""})`;
  return [
    `Reserva ${d.guest || "—"}:`,
    `Cabaña ${cabinsLine}`,
    `Check-in: ${ddmm(d.checkin)} a partir de las 15hs.`,
    `Check-out: ${ddmm(d.checkout)} hasta las 11hs.`,
    `Valor por noche: ${fmtMonto(d.ppn)} USD${multi ? " (por cabaña)" : ""}`,
    `Total:  USD$${fmtMonto(d.total)} ${totalSuffix}`,
    ``,
    `Seña: ${fmtMonto(d.senia)} USD`,
    `Gastos extra: ${d.gastosExtra}`,
    `Deposito por daños: ${fmtMonto(d.deposito)} USD (${multi ? "por cabaña, " : ""}al momento del check-in)`,
  ].join("\n");
}

// ── Datos de alquileres (listado para el encargado) ─────────────────────────

/** Depósito por daños que se pide SOLO en reservas directas (no plataforma).
 *  Ver texto ACLARACIONES: "Al no ser por plataforma solicitamos… 300USD". */
export const DEPOSITO_DANIOS = 300;

/** Subconjunto de `Reservation` que usa el listado de datos de alquileres. */
export interface ResForDatos {
  id: string;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  guest_name: string | null;
  phone: string | null;
  cabin: string | null;
  platform: string | null;
  total_usd: string | null;
  balance_usd: string | null;
  collected: number | null;
  cancelled_at: string | null;
}

export interface DatosAlqOpts {
  desde: string; // YYYY-MM-DD (inclusive)
  hasta: string; // YYYY-MM-DD (inclusive)
  invitadaIds: Iterable<string>;
}

const isAirbnb = (platform: string | null): boolean => /airbnb/i.test(platform ?? "");

/** Reservas del rango que se van a listar (no canceladas, check-in en [desde,hasta]),
 *  ordenadas por check-in y cabaña. Se expone para poder cruzar con el calendario. */
export function reservasEnRango<T extends ResForDatos>(reservations: T[], desde: string, hasta: string): T[] {
  return reservations
    .filter((r) => !r.cancelled_at && r.checkin >= desde && r.checkin <= hasta)
    .sort((a, b) => a.checkin.localeCompare(b.checkin) || (a.cabin ?? "").localeCompare(b.cabin ?? ""));
}

/** Listado TXT de próximas llegadas para copiar y pegar (formato del encargado). */
export function buildDatosAlquileres(reservations: ResForDatos[], opts: DatosAlqOpts): string {
  const invitadas = new Set(opts.invitadaIds);
  const enRango = reservasEnRango(reservations, opts.desde, opts.hasta);

  const header = [
    "RESERVAS — próximas llegadas",
    `(del ${ddmm(opts.desde)} al ${ddmm(opts.hasta)})`,
  ].join("\n");

  if (enRango.length === 0) {
    return `${header}\n\n(no hay llegadas en este rango)`;
  }

  const bloques = enRango.map((r) => {
    const lineas = [
      `${ddmm(r.checkin)} al ${ddmm(r.checkout)}`,
      dispCabin(r.cabin ?? "—"),
      r.guest_name || "—",
      r.phone || "—",
    ];
    if (invitadas.has(r.id)) {
      lineas.push("🎁 invitada — no cobrar");
    } else if (isAirbnb(r.platform)) {
      lineas.push("Plataforma");
    } else {
      if (r.collected === 1) {
        lineas.push("alquiler ya cobrado");
      } else {
        const restante = Number(r.balance_usd ?? r.total_usd ?? 0);
        lineas.push(`cobrar de alquiler: ${Math.round(restante)} usd`);
      }
      lineas.push(`deposito por danios: ${DEPOSITO_DANIOS}usd`);
    }
    return lineas.join("\n");
  });

  return `${header}\n\n${bloques.join("\n\n")}`;
}

/** Datos para prellenar el contrato JotForm por URL (campos que completa Mimi).
 *
 *  ⚠️ EL ORDEN DE LOS PARÁMETROS IMPORTA: `senia` DEBE ir antes que `precioTotal`.
 *  En el form, el texto del contrato (campo 52) se arma con "replace tags"
 *  ({precioTotal}, {senia}, {resto}…), cada uno una "calculation" que escribe en
 *  ese mismo campo. JotForm tiene un anti-loop (`__antiLoopCache`) que guarda
 *  SOLO el último valor escrito por result field: si dos calcs seguidas escriben
 *  el MISMO valor en el campo 52, la segunda se descarta como "loop infinito".
 *  Al prellenar `precioTotal` se recalcula `resto = precioTotal - senia`; si
 *  `senia` todavía está vacía, `resto` == `precioTotal` → colisión y el tag
 *  {precioTotal} queda VACÍO para siempre (no se vuelve a disparar). Mandando
 *  `senia` primero, `resto` ya vale total-seña ≠ total y no colisiona.
 *  (Caso residual: seña = 0 ⇒ resto == total siempre ⇒ el total sale vacío; por
 *  eso el panel avisa. Bug diagnosticado 2026-08-20.) */
export function buildJotformUrl(d: ReservaData): string {
  const nights = nightsBetween(d.checkin, d.checkout);
  const maxInquilinos = d.cabins.reduce((s, c) => s + (Number(c.pax) || 0), 0);
  const params = new URLSearchParams({
    cabania: d.cabins.map((c) => dispCabin(c.name)).join(", "),
    maxInquilinos: String(maxInquilinos),
    senia: String(Math.round(d.senia)),
    precioTotal: String(Math.round(d.total)),
    resto: String(Math.round(d.total - d.senia)),
    noches: String(nights),
    ...dateParts("fechaDesde", d.checkin),
    ...dateParts("fechaHasta", d.checkout),
  });
  return `https://form.jotform.com/${JOTFORM_FORM_ID}?${params.toString()}`;
}

export const ACLARACIONES = `Te mando aclaraciones previas que me gusta hacer:
* Trabajamos con un 20% de seña, el resto al momento del check-in. Seña puede ser dólar billete por CABA/Zona Norte, o transferencia dólares o pesos al valor blue del día.
* Al no ser por plataforma solicitamos al momento del check-in un depósito de 300USD en caso de daños o roturas, los cuales son devueltos al momento del check-out. Y la firma de un contrato online
* Tenemos un minimo de alquiler de 25 años, no aceptamos grupos de jovenes. Las cabañas tienen un ambiente familiar, no se permiten fiestas, ni música fuerte, ni mas inquilinos que los que permite cada cabaña.
* Me gusta aclarar que nuestras cabañas son rusticas, no son cabañas modernas. Cuentan con todas las comodidades necesarias, como cocina equipada, calefacción a tiro balanceado y salamandras, están cuidadosamente mantenidas para que pasen una buena estadía. Pero por ejemplo el el agua caliente funciona con termotanques grandes, pero no es ilimitada como en un hotel.
* Las cabañas son grandes, y si desean  reforzar la calefacción recomendamos mantener la salamandra encendida. La leña se cobra aparte dependiendo del uso.`;
