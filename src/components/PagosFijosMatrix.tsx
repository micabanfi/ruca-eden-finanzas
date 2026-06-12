import type { MonthlySummary, PagoFijoCell } from "@/db/pagosFijos";
import { fmtARS, fmtMes, fmtUSD } from "@/lib/format";

// Category order + labels mirroring the sheet's Pagos Fijos rows
const CATEGORY_ORDER: [canonical: string, label: string][] = [
  ["Agua", "Agua"],
  ["Agua Casero", "Agua Casero"],
  ["Luz CEB", "Luz CEB"],
  ["Luz Ruca", "Luz Ruca"],
  ["Gas", "Gas (2023-24, sin separar)"],
  ["Gas Ruca", "Gas Ruca"],
  ["Gas Ruqui", "Gas Ruqui"],
  ["Gas Casero", "Gas Casero"],
  ["Internet", "Internet"],
  ["Sueldo Casero", "Sueldo Casero"],
  ["Limpieza Casera", "Sueldo Casera"],
  ["Impuestos", "Impuestos Varios"],
  ["VEP", "VEP"],
  ["Costo IN/OUT", "Costo IN/OUT"],
  ["Limpieza Juana", "Limpieza Juana"],
  ["Sueldo Natalia", "Sueldo Natalia"],
  ["Gastos Varios", "Arreglos/Gastos Varios"],
];

function monthRange(months: string[]): string[] {
  if (months.length === 0) return [];
  const sorted = [...months].sort();
  const out: string[] = [];
  let [y, m] = sorted[0].split("-").map(Number);
  const last = sorted[sorted.length - 1];
  for (;;) {
    const mes = `${y}-${String(m).padStart(2, "0")}`;
    out.push(mes);
    if (mes === last) break;
    m++;
    if (m > 12) (m = 1), y++;
  }
  return out;
}

export default function PagosFijosMatrix({
  cells,
  monthly,
}: {
  cells: PagoFijoCell[];
  monthly: MonthlySummary[];
}) {
  // pivot: category -> mes -> {ars, usd}
  const byCat = new Map<string, Map<string, { ars: number | null; usd: number | null }>>();
  for (const c of cells) {
    const cat = c.category ?? "(sin categoría)";
    if (!byCat.has(cat)) byCat.set(cat, new Map());
    byCat.get(cat)!.set(c.mes, {
      ars: c.ars === null ? null : Number(c.ars),
      usd: c.usd === null ? null : Number(c.usd),
    });
  }
  const ingresos = new Map(monthly.map((m) => [m.mes, Number(m.ingresos_usd ?? 0)]));

  const months = monthRange([
    ...cells.map((c) => c.mes),
    ...monthly.map((m) => m.mes),
  ]);
  const currentMes = new Date().toISOString().slice(0, 7);

  // ordered categories: sheet order first, then any extras found in data
  const known = new Set(CATEGORY_ORDER.map(([c]) => c));
  const extras = [...byCat.keys()].filter((c) => !known.has(c)).sort();
  const rows: [string, string][] = [
    ...CATEGORY_ORDER.filter(([c]) => byCat.has(c)),
    ...extras.map((c): [string, string] => [c, c]),
  ];

  // column totals (over displayed/shifted values, like the sheet's row 43/44)
  const totUSD = new Map<string, number>();
  const totARS = new Map<string, number>();
  for (const mes of months) {
    let u = 0,
      a = 0;
    for (const [cat] of rows) {
      const v = byCat.get(cat)?.get(mes);
      u += v?.usd ?? 0;
      a += v?.ars ?? 0;
    }
    totUSD.set(mes, u);
    totARS.set(mes, a);
  }

  const thMes = (mes: string) =>
    `whitespace-nowrap border-b border-l border-neutral-300 px-2 py-1 text-right text-xs font-semibold ${
      mes === currentMes ? "bg-green-100 text-green-900" : "bg-neutral-100"
    }`;
  const tdNum = (mes: string, extra = "") =>
    `whitespace-nowrap border-l border-neutral-200 px-2 py-0.5 text-right tabular-nums ${
      mes === currentMes ? "bg-green-50" : ""
    } ${extra}`;

  return (
    <div className="max-h-[80vh] overflow-auto rounded border border-neutral-300 text-xs">
      <table className="border-collapse">
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="sticky left-0 z-30 border-b border-neutral-300 bg-neutral-100 px-2 py-1 text-left" />
            {months.map((mes) => (
              <th key={mes} className={thMes(mes)}>
                {fmtMes(mes)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Ingresos */}
          <tr className="bg-green-50 font-semibold">
            <td className="sticky left-0 z-10 border-b-4 border-neutral-700 bg-green-50 px-2 py-1">
              Alquileres (USD)
            </td>
            {months.map((mes) => (
              <td key={mes} className={tdNum(mes, "border-b-4 border-neutral-700 font-semibold text-green-900")}>
                {ingresos.get(mes) ? fmtUSD(ingresos.get(mes)) : ""}
              </td>
            ))}
          </tr>

          {/* Egresos: ARS row + "En USD" sub-row per category */}
          {rows.map(([cat, label]) => {
            const data = byCat.get(cat);
            return (
              <FragmentRows key={cat} label={label} months={months} data={data} tdNum={tdNum} />
            );
          })}

          {/* Footer totals */}
          <tr className="border-t-2 border-neutral-400 bg-neutral-100 font-semibold">
            <td className="sticky left-0 z-10 bg-neutral-100 px-2 py-1">Total Egresos USD</td>
            {months.map((mes) => (
              <td key={mes} className={tdNum(mes, "font-semibold")}>
                {totUSD.get(mes) ? fmtUSD(totUSD.get(mes)) : ""}
              </td>
            ))}
          </tr>
          <tr className="bg-neutral-50 text-neutral-500">
            <td className="sticky left-0 z-10 bg-neutral-50 px-2 py-0.5 pl-5 italic">
              Total Egresos $ARS
            </td>
            {months.map((mes) => (
              <td key={mes} className={tdNum(mes, "text-neutral-600")}>
                {totARS.get(mes) ? fmtARS(totARS.get(mes)) : ""}
              </td>
            ))}
          </tr>
          <tr className="border-t-4 border-neutral-700 bg-green-100 font-semibold">
            <td className="sticky left-0 z-10 border-t-4 border-neutral-700 bg-green-100 px-2 py-1">Caja (USD)</td>
            {months.map((mes) => {
              const v = (ingresos.get(mes) ?? 0) - (totUSD.get(mes) ?? 0);
              return (
                <td
                  key={mes}
                  className={tdNum(
                    mes,
                    `font-semibold ${v < 0 ? "text-red-700" : "text-green-900"}`,
                  )}
                >
                  {ingresos.get(mes) || totUSD.get(mes) ? fmtUSD(v) : ""}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FragmentRows({
  label,
  months,
  data,
  tdNum,
}: {
  label: string;
  months: string[];
  data?: Map<string, { ars: number | null; usd: number | null }>;
  tdNum: (mes: string, extra?: string) => string;
}) {
  return (
    <>
      <tr className="border-t border-neutral-400">
        <td className="sticky left-0 z-10 border-t border-neutral-400 bg-white px-2 py-0.5 font-medium">{label}</td>
        {months.map((mes) => (
          <td key={mes} className={tdNum(mes)}>
            {fmtARS(data?.get(mes)?.ars)}
          </td>
        ))}
      </tr>
      <tr className="text-neutral-500">
        <td className="sticky left-0 z-10 bg-white px-2 py-0.5 pl-5 italic">En USD</td>
        {months.map((mes) => (
          <td key={mes} className={tdNum(mes, "text-neutral-600")}>
            {fmtUSD(data?.get(mes)?.usd)}
          </td>
        ))}
      </tr>
    </>
  );
}
