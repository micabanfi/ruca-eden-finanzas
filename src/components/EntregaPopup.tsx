"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addEntrega, cancelEntrega, updateEntrega } from "@/actions/cobros";
import CurrencyAmount from "@/components/forms/CurrencyAmount";
import type { Tx } from "@/db/transactions";
import { HOLDERS } from "@/lib/catalog";

const input =
  "rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs focus:border-green-700 focus:outline-none";

/** "+" al lado de un cobro: registra la entrega de esa plata a Mica (atada al
 *  cobro). Si ya está registrada, reabre el popup para ver/editar o deshacer.
 *  La fecha/monto/moneda vienen precargados del cobro. */
export default function EntregaPopup({ tx, holder }: { tx: Tx; holder: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const entregado = !!tx.entrega_id;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? "Error");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const num = (s: string | null) => (s ? Number(s) : null);
  const defCurrency = (entregado ? tx.entrega_currency : tx.currency) ?? "USD";
  const defUsd = entregado ? num(tx.entrega_amount_usd) : num(tx.amount_usd);
  const defArs = entregado ? num(tx.entrega_amount_ars) : num(tx.amount_ars);
  const defBlue = num(tx.blue_rate);

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={entregado ? "Ver/editar la entrega" : "Registrar que se entregó a Mica"}
        className="ml-1 rounded px-1 font-semibold text-amber-700 hover:bg-amber-100"
      >
        +
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[min(92vw,30rem)] rounded-lg border border-amber-200 bg-white p-4 text-xs shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 font-semibold text-amber-900">
              {entregado ? "Entrega registrada" : "Registrar entrega"}
              {tx.description && (
                <span className="font-normal text-neutral-500"> · {tx.description}</span>
              )}
            </div>
            <form
              action={(fd) => run(() => (entregado ? updateEntrega(fd) : addEntrega(fd)))}
              className="flex flex-wrap items-end gap-2"
            >
              {entregado ? (
                <input type="hidden" name="id" value={tx.entrega_id!} />
              ) : (
                <input type="hidden" name="transaction_id" value={tx.id} />
              )}
              <label className="flex flex-col">
                Fecha
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={entregado ? tx.entrega_date ?? today : today}
                  className={input}
                />
              </label>
              <label className="flex flex-col">
                Quién entrega
                <select
                  name="holder"
                  defaultValue={entregado ? tx.entrega_holder ?? holder : holder}
                  className={input}
                >
                  {[...new Set([holder, ...HOLDERS])].map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
              <CurrencyAmount
                inputClass={input}
                label="Monto"
                required
                defaultCurrency={defCurrency}
                defaultUsd={defUsd}
                defaultArs={defArs}
                defaultBlue={defBlue}
              />
              <label className="flex grow flex-col">
                Nota
                <input
                  type="text"
                  name="notes"
                  defaultValue={tx.entrega_notes ?? ""}
                  className={`${input} min-w-40`}
                />
              </label>
              <div className="flex w-full items-center justify-between gap-2 pt-1">
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded bg-amber-700 px-3 py-1 font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                  >
                    {pending ? "Guardando…" : entregado ? "Guardar" : "Registrar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-200"
                  >
                    Cerrar
                  </button>
                </div>
                {entregado && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => cancelEntrega(tx.entrega_id!))}
                    title="Deshacer (soft-delete, reversible): vuelve a quedar 'sin entregar'"
                    className="rounded px-2 py-1 text-red-700 hover:bg-red-100"
                  >
                    Deshacer entrega
                  </button>
                )}
              </div>
              {error && <span className="w-full text-red-700">{error}</span>}
            </form>
          </div>
        </div>
      )}
    </span>
  );
}
