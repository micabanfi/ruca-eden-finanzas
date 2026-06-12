import PendingCobroRow from "@/components/PendingCobroRow";
import type { PendingCobro, Tx } from "@/db/transactions";
import { fmtARS, fmtDate, fmtUSD } from "@/lib/format";

const th =
  "sticky top-0 z-10 border-b border-neutral-300 bg-neutral-100 px-2 py-1 text-left text-xs font-semibold whitespace-nowrap";
const td = "border-b border-neutral-100 px-2 py-1";

function sum(txs: Tx[], field: "amount_usd" | "amount_ars"): number {
  return txs.reduce((acc, t) => acc + (t[field] ? Number(t[field]) : 0), 0);
}

// holder efectivo: campo nuevo, o inferido del método de pago histórico
// ("gus…" → Gustavo; paypal/airbnb → Paypal, los payouts de Airbnb caen ahí)
function holderOf(t: Tx): string | null {
  if (t.holder) return t.holder;
  const pm = t.payment_method?.toLowerCase() ?? "";
  if (pm.startsWith("gus")) return "Gustavo";
  if (pm.includes("paypal") || pm.includes("airbnb")) return "Paypal";
  return null;
}

type Item =
  | { kind: "group"; date: string; txs: Tx[] }
  | { kind: "pending"; date: string; p: PendingCobro };

/** Filas de un cobro (seña + resto comparten Fecha/Nombre). Si la reserva fue
 *  cancelada y se cobró igual, va resaltado en rojo con badge. */
function IncomeGroupRows({ txs }: { txs: Tx[] }) {
  const cancelado = txs.some((t) => t.from_cancelled);
  return txs.map((t, i) => (
    <tr
      key={t.id}
      className={cancelado ? "bg-red-50 hover:bg-red-100" : "odd:bg-neutral-50 hover:bg-amber-50"}
    >
      {i === 0 && (
        <>
          <td rowSpan={txs.length} className={`${td} whitespace-nowrap`}>
            {fmtDate(t.date)}
          </td>
          <td
            rowSpan={txs.length}
            className={`${td} max-w-48 truncate font-medium`}
            title={t.notes ?? undefined}
          >
            {t.description}
            {t.notes && <span title={t.notes}> 📝</span>}
            {cancelado && (
              <span
                className="ml-1 rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-900"
                title="La reserva se canceló pero igual se cobró (seña/penalidad por cancelar tarde)"
              >
                🚫 canceló · se cobró
              </span>
            )}
          </td>
        </>
      )}
      <td className={`${td} text-right tabular-nums`}>{fmtUSD(t.amount_usd)}</td>
      <td className={`${td} whitespace-nowrap`}>{holderOf(t)}</td>
      <td className={`${td} whitespace-nowrap`}>{t.payment_method}</td>
    </tr>
  ));
}

export default function TransactionsTables({
  txs,
  pendientes = [],
}: {
  txs: Tx[];
  pendientes?: PendingCobro[];
}) {
  const ingresos = txs.filter((t) => t.kind === "ingreso");
  const egresos = txs.filter((t) => t.kind === "egreso");

  // agrupar cobros de la misma reserva (seña + resto) para combinar celdas
  const byRes = new Map<string, Tx[]>();
  const items: Item[] = [];
  for (const t of ingresos) {
    if (t.reservation_id && byRes.has(t.reservation_id)) {
      byRes.get(t.reservation_id)!.push(t);
      continue;
    }
    const group = [t];
    if (t.reservation_id) byRes.set(t.reservation_id, group);
    items.push({ kind: "group", date: t.date, txs: group });
  }
  for (const p of pendientes) items.push({ kind: "pending", date: p.checkin, p });
  items.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      {/* Ingresos */}
      <section className="xl:col-span-2">
        <h2 className="mb-1 text-sm font-semibold text-green-800">
          Ingresos Inquilinos · {ingresos.length} · {fmtUSD(sum(ingresos, "amount_usd"))}
          {pendientes.length > 0 && (
            <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
              {pendientes.length} sin cobrar
            </span>
          )}
        </h2>
        <div className="max-h-[75vh] overflow-auto rounded border border-neutral-300 text-xs">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Fecha", "Nombre", "Precio", "Lo tiene", "Metodo Pago"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) =>
                item.kind === "pending" ? (
                  <PendingCobroRow key={`p${item.p.id}`} p={item.p} />
                ) : (
                  <IncomeGroupRows key={`g${item.txs[0].id}`} txs={item.txs} />
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Egresos */}
      <section className="xl:col-span-3">
        <h2 className="mb-1 text-sm font-semibold text-red-800">
          Egresos · {egresos.length} · {fmtARS(sum(egresos, "amount_ars"))} ·{" "}
          {fmtUSD(sum(egresos, "amount_usd"))}
        </h2>
        <div className="max-h-[75vh] overflow-auto rounded border border-neutral-300 text-xs">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Fecha", "Descripcion", "Precio", "Metodo Pago", "Valor Blue",
                  "Precio Blue", "Tipo de pago"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {egresos.map((t) => (
                <tr key={t.id} className="odd:bg-neutral-50 hover:bg-amber-50">
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(t.date)}</td>
                  <td className={`${td} max-w-64 truncate`} title={t.notes ?? t.description ?? undefined}>
                    {t.description}
                    {t.notes && <span title={t.notes}> 📝</span>}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{fmtARS(t.amount_ars)}</td>
                  <td className={`${td} whitespace-nowrap`}>{t.payment_method}</td>
                  <td className={`${td} text-right tabular-nums`}>{t.blue_rate ? Number(t.blue_rate) : ""}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtUSD(t.amount_usd)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {t.category && (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5">{t.category}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
