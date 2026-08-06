"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchBlueRate } from "@/actions/blue";
import { cobrarReserva, marcarCobrada, marcarInvitada, vincularCobro } from "@/actions/cobros";
import BlockingSpinner from "@/components/BlockingSpinner";
import PaymentMethodField from "@/components/forms/PaymentMethodField";
import type { PendingCobro } from "@/db/transactions";
import { CURRENCIES, HOLDERS } from "@/lib/catalog";
import { fmtDate, fmtUSD } from "@/lib/format";

function HolderSelect({
  name,
  defaultValue,
  inputClass,
}: {
  name: string;
  defaultValue: string;
  inputClass: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={inputClass}>
      <option value="">—</option>
      {HOLDERS.map((h) => (
        <option key={h}>{h}</option>
      ))}
    </select>
  );
}

const input =
  "rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs focus:border-green-700 focus:outline-none";

/** Fila gris de reserva con checkin pasado y sin cobrar. "Cobrar" abre el
 * mini-form (seña/resto con quién lo tiene); las acciones secundarias evitan
 * duplicar cobros que ya estaban cargados. */
export default function PendingCobroRow({ p }: { p: PendingCobro }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [blue, setBlue] = useState<number | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);
  const cur = currency === "ARS" ? "pesos" : "USD";

  async function onCurrencyChange(v: string) {
    setCurrency(v);
    if (v === "ARS" && !blue) {
      setFetchingRate(true);
      try {
        const r = await fetchBlueRate();
        setBlue(r.rate);
      } catch {
        // si falla, lo carga a mano
      } finally {
        setFetchingRate(false);
      }
    }
  }

  const dep = p.deposit_usd ? Number(p.deposit_usd) : null;
  const total = p.total_usd ? Number(p.total_usd) : null;
  // AirBnb: el cobro entra por Paypal y queda ahí hasta retirarlo
  const esAirbnb = p.platform === "AirBnb";
  const holderDefaultSenia = esAirbnb ? "Paypal" : "Mica";
  const holderDefaultResto = esAirbnb ? "Paypal" : "Gustavo";
  const resto =
    dep && total
      ? p.balance_usd
        ? Number(p.balance_usd)
        : total - dep
      : total;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? "Error");
        return;
      }
      router.refresh();
    });
  }

  const td = "border-b border-neutral-100 px-2 py-1";
  return (
    <>
      <tr className={`bg-neutral-100/80 text-neutral-500 ${pending ? "animate-pulse" : ""}`}>
        <td className={`${td} whitespace-nowrap`}>{fmtDate(p.checkin)}</td>
        <td className={`${td} max-w-48 truncate italic`}>
          {p.guest_name} {p.cabin && <span className="text-neutral-400">({p.cabin})</span>}
        </td>
        <td className={`${td} text-right tabular-nums`}>{fmtUSD(p.total_usd)}</td>
        <td className={td} />
        <td className={`${td} whitespace-nowrap`}>
          <span className="flex items-center gap-1">
            <button
              onClick={() => setOpen(!open)}
              disabled={pending}
              className="rounded bg-green-700 px-2 py-0.5 font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              Cobrar ✓
            </button>
            {p.match_tx_id ? (
              <button
                onClick={() => run(() => vincularCobro(p.id, p.match_tx_id!))}
                disabled={pending}
                title={`Ya hay un ingreso "${p.match_desc}" de ${fmtUSD(p.match_usd)} el ${fmtDate(p.match_date!)}. Click para vincularlo a esta reserva (no duplica nada).`}
                className="rounded bg-amber-100 px-2 py-0.5 text-amber-900 hover:bg-amber-200 disabled:opacity-50"
              >
                ¿es “{p.match_desc}” {fmtUSD(p.match_usd)}?
              </button>
            ) : (
              <button
                onClick={() => run(() => marcarCobrada(p.id))}
                disabled={pending}
                title="Marcar cobrada sin crear ingreso (ya estaba cargado de otra forma)"
                className="rounded px-2 py-0.5 text-neutral-400 hover:bg-neutral-200"
              >
                ya estaba
              </button>
            )}
            <button
              onClick={() => run(() => marcarInvitada(p.id))}
              disabled={pending}
              title="Invitación: nunca se cobra. Pasa a la sección Invitaciones de Alquileres Detalle."
              className="rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-200"
            >
              🎁
            </button>
          </span>
          {error && <span className="block text-red-700">{error}</span>}
          <BlockingSpinner show={pending} label="Guardando cobro…" />
        </td>
      </tr>
      {open && (
        <tr className="bg-green-50/70">
          <td colSpan={5} className="border-b border-green-200 px-2 py-2">
            <form
              action={(fd) => run(() => cobrarReserva(fd))}
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="reservation_id" value={p.id} />
              <input type="hidden" name="currency" value={currency} />
              <label className="flex flex-col">
                Fecha
                <input type="date" name="date" required defaultValue={p.checkin} className={input} />
              </label>
              <label className="flex flex-col">
                Moneda
                <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)} className={input}>
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
              {currency === "ARS" && (
                <label className="flex flex-col">
                  Valor blue {fetchingRate && "⏳"}
                  <input type="number" name="blue_rate" step="0.01" min="0" required
                    value={blue ?? ""} onChange={(e) => setBlue(Number(e.target.value) || null)}
                    className={`${input} w-24 text-right`} />
                </label>
              )}
              {dep ? (
                <>
                  <label className="flex flex-col">
                    Seña ({cur})
                    <input key={`a1-${currency}`} type="number" name="amount_1" step="0.01" min="0"
                      defaultValue={currency === "ARS" ? "" : dep} className={`${input} w-24 text-right`} />
                  </label>
                  <label className="flex flex-col">
                    La tiene
                    <HolderSelect name="holder_1" defaultValue={holderDefaultSenia} inputClass={input} />
                  </label>
                  <label className="flex flex-col">
                    Resto ({cur})
                    <input key={`a2-${currency}`} type="number" name="amount_2" step="0.01" min="0"
                      defaultValue={currency === "ARS" ? "" : resto ?? ""} className={`${input} w-24 text-right`} />
                  </label>
                  <label className="flex flex-col">
                    Lo tiene
                    <HolderSelect name="holder_2" defaultValue={holderDefaultResto} inputClass={input} />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex flex-col">
                    Monto ({cur})
                    <input key={`a1-${currency}`} type="number" name="amount_1" step="0.01" min="0"
                      defaultValue={currency === "ARS" ? "" : total ?? ""} className={`${input} w-24 text-right`} />
                  </label>
                  <label className="flex flex-col">
                    Lo tiene
                    <HolderSelect name="holder_1" defaultValue={holderDefaultSenia} inputClass={input} />
                  </label>
                </>
              )}
              <PaymentMethodField inputClass={input} defaultValue={esAirbnb ? "Paypal" : ""} required />
              <label className="flex grow flex-col">
                Nota
                <input type="text" name="notes" placeholder="ej: me dió $300mil, resto transferido…"
                  className={`${input} min-w-40`} />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded bg-green-700 px-3 py-1 font-medium text-white hover:bg-green-800 disabled:opacity-50"
              >
                {pending ? "Guardando…" : "Confirmar"}
              </button>
              <button type="button" onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-200">
                Cancelar
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
