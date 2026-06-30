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
