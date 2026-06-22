// Helpers puros para la tab Mensajes: pax por cabaña, armado del mensaje de
// reserva, texto fijo de aclaraciones, y la URL de prellenado del contrato JotForm.

export const JOTFORM_FORM_ID = "251346404353047";

// Pax máximo por cabaña (editable en cada mensaje desde la UI).
export const CABIN_PAX: Record<string, number> = {
  Alerce: 8,
  Cohiue: 6,
  Maiten: 8,
  Ruca: 8,
  "Ruca Chico": 4,
  Ruqui: 6,
};

// Cómo se escribe la cabaña en los mensajes/contrato (Mimi usa "Coihue").
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

const ddmm = (d: string): string => {
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

/** Datos para prellenar el contrato JotForm por URL (campos que completa Mimi). */
export function buildJotformUrl(d: ReservaData): string {
  const nights = nightsBetween(d.checkin, d.checkout);
  const maxInquilinos = d.cabins.reduce((s, c) => s + (Number(c.pax) || 0), 0);
  const params = new URLSearchParams({
    cabania: d.cabins.map((c) => dispCabin(c.name)).join(", "),
    maxInquilinos: String(maxInquilinos),
    precioTotal: String(Math.round(d.total)),
    senia: String(Math.round(d.senia)),
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
