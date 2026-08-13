// Formatters matching the sheet's display conventions (es-AR)

const ars0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const ars2 = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usd = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Pesos. Por defecto sin decimales (convención de la planilla); pasá
 *  `decimals = 2` para mostrarlos (se usa solo en Ingresos/Egresos). */
export function fmtARS(n: number | string | null | undefined, decimals: 0 | 2 = 0): string {
  if (n === null || n === undefined || n === "") return "";
  return `$${(decimals === 2 ? ars2 : ars0).format(Number(n))}`;
}

export function fmtUSD(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "";
  return `USD$${usd.format(Number(n))}`;
}

/** Interpreta un número escrito/pegado a la argentina (o a la inglesa) y lo
 *  devuelve como number. Pensado para lo que se copia de la planilla, del
 *  homebanking o de una factura: `"$ 262.904,86"`, `"262.904,86"`, `"1.485"`,
 *  `"262,904.86"`, `"262904.86"`. Devuelve null si no hay un número adentro.
 *
 *  Reglas (en este orden):
 *  - se descarta todo lo que no sea dígito, `.`, `,` o `-` (símbolos, espacios).
 *  - si hay coma → la coma es el decimal y los puntos son de miles.
 *  - si hay varios puntos → todos son de miles.
 *  - un solo punto con exactamente 3 dígitos atrás (`262.904`, `1.485`) es de
 *    miles: es como se escribe acá, y un monto de "1,485 pesos" no existe.
 *  - cualquier otro punto es decimal (`262.90`, `1.5`). */
export function parseLocaleNumber(raw: string): number | null {
  const match = raw.match(/\d[\d.,]*/); // el primer número; ignora "$", "M3", etc.
  if (!match) return null;
  const neg = /-\s*$/.test(raw.slice(0, match.index));
  const body = match[0].replace(/[.,]+$/, "");

  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    // decimal = coma (es-AR): "262.904,86"
    const parts = body.replace(/\./g, "").split(",");
    const dec = parts.pop();
    normalized = `${parts.join("")}.${dec}`;
  } else if (lastComma > -1) {
    // hay coma y el punto va después → formato inglés: "262,904.86"
    normalized = body.replace(/,/g, "");
  } else if (lastDot > -1) {
    const dots = body.split(".").length - 1;
    const thousands = dots > 1 || body.length - lastDot - 1 === 3;
    normalized = thousands ? body.replace(/\./g, "") : body;
  } else {
    normalized = body;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "2-digit",
    year: "numeric",
  });
}

/** '2026-03' -> 'mar 2026' (sheet shows month headers as dates) */
export function fmtMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "short" });
  return `${name} ${y}`;
}
