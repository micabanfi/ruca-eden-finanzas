import EditableTxCell from "@/components/EditableTxCell";
import EntregaPopup from "@/components/EntregaPopup";
import NotePopup from "@/components/NotePopup";
import PendingCobroRow from "@/components/PendingCobroRow";
import type { PendingCobro, Tx } from "@/db/transactions";
import { HOLDERS, PAYMENT_METHODS } from "@/lib/catalog";
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

/** Celda "Metodo Pago" de un ingreso, editable por doble-click. Si lo tiene una
 *  persona (no Mica), muestra un "+" para registrar que se entregó a Mica; una vez
 *  registrada, la celda pasa a "<método> → Mica" y el "+" reabre el popup. */
function MetodoPagoCell({ t }: { t: Tx }) {
  const holder = holderOf(t);
  const person = holder && holder !== "Mica" ? holder : null;
  const label = t.payment_method ?? holder ?? "";
  return (
    <EditableTxCell
      id={t.id}
      field="payment_method"
      type="select"
      options={PAYMENT_METHODS}
      raw={t.payment_method ?? ""}
      className={`${td} whitespace-nowrap`}
      after={person ? <EntregaPopup tx={t} holder={person} /> : undefined}
    >
      {t.entrega_id ? (
        <span title="Se entregó a Mica" className="text-amber-900">
          {label} → Mica
        </span>
      ) : (
        <span>{label}</span>
      )}
    </EditableTxCell>
  );
}

type Item =
  | { kind: "group"; date: string; txs: Tx[] }
  | { kind: "pending"; date: string; p: PendingCobro };

/** Filas de un cobro (seña + resto comparten Fecha/Nombre). Todas las celdas son
 *  editables por doble-click (fecha, nombre, precio USD, quién lo tiene, método).
 *  Si la reserva fue cancelada y se cobró igual, va resaltado en rojo con badge. */
function IncomeGroupRows({ txs }: { txs: Tx[] }) {
  const cancelado = txs.some((t) => t.from_cancelled);
  return txs.map((t, i) => (
    <tr
      key={t.id}
      className={`group ${cancelado ? "bg-red-50 hover:bg-red-100" : "odd:bg-neutral-50 hover:bg-amber-50"}`}
    >
      {i === 0 && (
        <>
          <EditableTxCell id={t.id} field="date" type="date" raw={t.date}
            rowSpan={txs.length} className={`${td} whitespace-nowrap`}>
            {fmtDate(t.date)}
          </EditableTxCell>
          <EditableTxCell id={t.id} field="description" raw={t.description ?? ""}
            rowSpan={txs.length} className={`${td} max-w-48 font-medium`}
            after={<NotePopup kind="tx" id={t.id} notes={t.notes} label={t.description} />}>
            {/* truncar el nombre en un span (no en la celda) para no recortar el 📝 */}
            <span className="inline-block max-w-36 truncate align-bottom">{t.description}</span>
            {cancelado && (
              <span
                className="ml-1 rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-900"
                title="La reserva se canceló pero igual se cobró (seña/penalidad por cancelar tarde)"
              >
                🚫 canceló · se cobró
              </span>
            )}
          </EditableTxCell>
        </>
      )}
      <EditableTxCell id={t.id} field="amount_usd" type="number" raw={t.amount_usd ?? ""}
        className={`${td} text-right tabular-nums`}>
        {fmtUSD(t.amount_usd)}
      </EditableTxCell>
      <EditableTxCell id={t.id} field="holder" type="select" options={HOLDERS}
        raw={holderOf(t) ?? ""} className={`${td} whitespace-nowrap`}>
        {holderOf(t)}
      </EditableTxCell>
      <MetodoPagoCell t={t} />
    </tr>
  ));
}

export default function TransactionsTables({
  txs,
  pendientes = [],
  categories = [],
}: {
  txs: Tx[];
  pendientes?: PendingCobro[];
  categories?: string[];
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
          Egresos · {egresos.length} · {fmtARS(sum(egresos, "amount_ars"), 2)} ·{" "}
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
                <tr key={t.id} className="group odd:bg-neutral-50 hover:bg-amber-50">
                  <EditableTxCell id={t.id} field="date" type="date" raw={t.date} className={`${td} whitespace-nowrap`}>
                    {fmtDate(t.date)}
                  </EditableTxCell>
                  <EditableTxCell id={t.id} field="description" raw={t.description ?? ""} className={`${td} max-w-64`}
                    after={<NotePopup kind="tx" id={t.id} notes={t.notes} label={t.description} />}>
                    <span className="inline-block max-w-52 truncate align-bottom">{t.description}</span>
                  </EditableTxCell>
                  <EditableTxCell id={t.id} field="amount_ars" type="number" raw={t.amount_ars ?? ""} className={`${td} text-right tabular-nums`}>
                    {fmtARS(t.amount_ars, 2)}
                  </EditableTxCell>
                  <EditableTxCell id={t.id} field="payment_method" type="select" options={PAYMENT_METHODS} raw={t.payment_method ?? ""} className={`${td} whitespace-nowrap`}>
                    {t.payment_method}
                  </EditableTxCell>
                  <EditableTxCell id={t.id} field="blue_rate" type="number" raw={t.blue_rate ?? ""} className={`${td} text-right tabular-nums`}>
                    {t.blue_rate ? Number(t.blue_rate) : ""}
                  </EditableTxCell>
                  <td className={`${td} text-right tabular-nums`} title="Precio blue = Precio ÷ Valor blue (se recalcula solo)">
                    {fmtUSD(t.amount_usd)}
                  </td>
                  <EditableTxCell id={t.id} field="category" type="select" options={categories} raw={t.category ?? ""} className={`${td} whitespace-nowrap`}>
                    {t.category && (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5">{t.category}</span>
                    )}
                  </EditableTxCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
