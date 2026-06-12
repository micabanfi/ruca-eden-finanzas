import {
  getAjustes,
  getControlEgresos,
  getProblemTxs,
  getShiftMoves,
  getYearlyTotals,
} from "@/db/resumen";
import { fmtARS, fmtDate, fmtUSD } from "@/lib/format";

export const dynamic = "force-dynamic";

const th = "border-b border-neutral-300 bg-neutral-100 px-3 py-1 text-right text-xs font-semibold";
const td = "border-b border-neutral-100 px-3 py-1 text-right tabular-nums";

export default async function ResumenPage() {
  const [years, ajustes, control, problems, shifts] = await Promise.all([
    getYearlyTotals(),
    getAjustes(),
    getControlEgresos(),
    getProblemTxs(),
    getShiftMoves(),
  ]);

  // los años ya excluyen los Ajustes (la matriz no los tiene): esto es el
  // "Total histórico"; los ajustes se restan acá abajo, como en la planilla
  const sinAjustes = years.reduce((acc, y) => acc + Number(y.balance_usd ?? 0), 0);
  const totalAjustes = ajustes.reduce((acc, a) => acc + Number(a.amount_usd ?? 0), 0);
  const acumulado = sinAjustes - totalAjustes;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Total acumulado, con los ajustes a la vista (ya restados) */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-green-800">Caja acumulada (USD)</h2>
        <div className="rounded border border-neutral-300 bg-white p-3 text-sm">
          <div className="flex justify-between border-b border-neutral-200 pb-1">
            <span>Total histórico (sin ajustes)</span>
            <b className="tabular-nums">{fmtUSD(sinAjustes)}</b>
          </div>
          {ajustes.map((a) => (
            <div key={a.id} className="flex justify-between py-1 text-neutral-600" title={a.notes ?? undefined}>
              <span>
                {a.description} · {fmtDate(a.date)}
              </span>
              <span className="tabular-nums">− {fmtUSD(a.amount_usd)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t-2 border-neutral-400 pt-1 text-base">
            <b>Total</b>
            <b className={`tabular-nums ${acumulado < 0 ? "text-red-700" : "text-green-800"}`}>
              {fmtUSD(acumulado)}
            </b>
          </div>
        </div>
      </section>

      {/* Tabla anual como la planilla */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-green-800">Total por año (USD)</h2>
        <div className="overflow-auto rounded border border-neutral-300">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Total</th>
                {years.map((y) => (
                  <th key={y.anio} className={th}>{y.anio}</th>
                ))}
                <th className={`${th} border-l-2 border-neutral-400`}>TODO</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const sumI = years.reduce((a, y) => a + Number(y.ingresos_usd ?? 0), 0);
                const sumE = years.reduce((a, y) => a + Number(y.egresos_usd ?? 0), 0);
                const sumB = years.reduce((a, y) => a + Number(y.balance_usd ?? 0), 0);
                const totCell = "border-l-2 border-neutral-400 font-bold";
                return (
                  <>
                    <tr>
                      <td className={`${td} text-left font-medium text-green-800`}>ingresos</td>
                      {years.map((y) => (
                        <td key={y.anio} className={td}>{fmtUSD(y.ingresos_usd)}</td>
                      ))}
                      <td className={`${td} ${totCell} text-green-800`}>{fmtUSD(sumI)}</td>
                    </tr>
                    <tr>
                      <td className={`${td} text-left font-medium text-red-800`}>egresos</td>
                      {years.map((y) => (
                        <td key={y.anio} className={td}>{fmtUSD(y.egresos_usd)}</td>
                      ))}
                      <td className={`${td} ${totCell} text-red-800`}>{fmtUSD(sumE)}</td>
                    </tr>
                    <tr className="bg-neutral-50 font-semibold">
                      <td className={`${td} text-left`}>total</td>
                      {years.map((y) => {
                        const v = Number(y.balance_usd ?? 0);
                        return (
                          <td key={y.anio} className={`${td} ${v < 0 ? "text-red-700" : "text-green-800"}`}>
                            {fmtUSD(v)}
                          </td>
                        );
                      })}
                      <td className={`${td} ${totCell} ${sumB < 0 ? "text-red-700" : "text-green-800"}`}>
                        {fmtUSD(sumB)}
                      </td>
                    </tr>
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {/* Control de consistencia */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-neutral-800">
          Chequeo automático: ¿cuadran los gastos?
        </h2>
        <p className="mb-2 text-xs text-neutral-500">
          Los mismos gastos contados de dos formas: <b>USD crudo</b> = por la fecha
          en que se pagaron (la lista de Ingresos/Egresos); <b>USD matriz</b> = por
          el mes al que pertenecen (Pagos Fijos, con mes vencido). Dentro de un año
          pueden repartirse distinto entre meses, pero si la columna Diferencia
          muestra un monto grande que no explican las notas de abajo, falta cargar
          algo o hay un error. Es un detector de problemas: ✓ = todo bien.
        </p>
        <div className="overflow-auto rounded border border-neutral-300">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Año</th>
                <th className={th}>Tx</th>
                <th className={th}>ARS crudo</th>
                <th className={th}>USD crudo</th>
                <th className={th}>USD matriz</th>
                <th className={th}>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {control.map((c) => {
                const diff = Number(c.usd ?? 0) - Number(c.matriz_usd ?? 0);
                return (
                  <tr key={c.anio}>
                    <td className={`${td} text-left font-medium`}>{c.anio}</td>
                    <td className={td}>{c.n_tx}</td>
                    <td className={td}>{fmtARS(c.ars)}</td>
                    <td className={td}>{fmtUSD(c.usd)}</td>
                    <td className={td}>{fmtUSD(c.matriz_usd)}</td>
                    <td className={`${td} font-semibold ${Math.abs(diff) > 1 ? "text-amber-700" : "text-green-700"}`}>
                      {Math.abs(diff) > 0.005 ? fmtUSD(diff) : "✓"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {shifts.length > 0 && (
          <div className="mt-2 rounded border border-sky-200 bg-sky-50/60 p-2 text-xs">
            <b className="text-sky-900">Mes vencido entre años</b> (diferencia legítima, no es bug):
            <ul className="mt-1 list-inside list-disc text-neutral-600">
              {shifts.map((s, i) => (
                <li key={i}>
                  {fmtUSD(s.usd)} pagados en {s.anio_pago} pero atribuidos a {s.anio_matriz} ({s.n} tx)
                </li>
              ))}
            </ul>
          </div>
        )}

        {ajustes.length > 0 && (
          <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 p-2 text-xs text-neutral-600">
            Ajustes excluidos de la matriz: {ajustes.map((a) => `${a.description} ${fmtUSD(a.amount_usd)}`).join(", ")}
          </div>
        )}

        {problems.length > 0 && (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs">
            <b className="text-amber-900">⚠ {problems.length} egresos con datos incompletos</b>
            <table className="mt-1 w-full border-collapse">
              <tbody>
                {problems.map((p) => (
                  <tr key={`${p.id}-${p.issue}`} className="border-t border-amber-200">
                    <td className="px-1 py-0.5 whitespace-nowrap">{fmtDate(p.date)}</td>
                    <td className="max-w-64 truncate px-1 py-0.5">{p.description}</td>
                    <td className="px-1 py-0.5">{p.category}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{fmtARS(p.amount_ars)}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{fmtUSD(p.amount_usd)}</td>
                    <td className="px-1 py-0.5 font-medium text-amber-800">{p.issue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
