"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addEntrega } from "@/actions/cobros";
import CurrencyAmount from "@/components/forms/CurrencyAmount";
import type { Entrega, HolderBalance } from "@/db/transactions";
import { HOLDERS } from "@/lib/catalog";
import { fmtARS, fmtDate, fmtUSD } from "@/lib/format";

const input =
  "rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs focus:border-green-700 focus:outline-none";

/** "Gus tiene USD$764" calculado solo + registro de entregas con historial. */
export default function HoldersBox({
  balances,
  entregas,
}: {
  balances: HolderBalance[];
  entregas: Entrega[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (balances.length === 0 && entregas.length === 0) return null;

  function onSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addEntrega(fd);
      if (!res.ok) {
        setError(res.error ?? "Error");
        return;
      }
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded border border-amber-200 bg-amber-50/60 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-amber-900">💰 Plata en manos de:</span>
        {balances.length === 0 && <span className="text-neutral-500">nadie — todo entregado</span>}
        {balances.map((b) => {
          const u = Number(b.balance_usd);
          const a = Number(b.balance_ars);
          return (
            <span key={b.holder} className="rounded bg-amber-200/70 px-2 py-0.5 font-semibold text-amber-950 tabular-nums">
              {b.holder}
              {Math.abs(u) > 0.01 && <> · {fmtUSD(b.balance_usd)}</>}
              {Math.abs(a) > 0.01 && <> · {fmtARS(b.balance_ars, 0)}</>}
            </span>
          );
        })}
        <button
          onClick={() => setOpen(!open)}
          className="rounded bg-amber-700 px-2 py-0.5 font-medium text-white hover:bg-amber-800"
        >
          Registrar entrega
        </button>
      </div>
      {open && (
        <form ref={formRef} action={onSubmit} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col">
            Fecha
            <input type="date" name="date" required
              defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
          </label>
          <label className="flex flex-col">
            Quién entrega
            <select name="holder" defaultValue={balances[0]?.holder ?? "Gustavo"} className={input}>
              {[...new Set([...balances.map((b) => b.holder), ...HOLDERS])].map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </label>
          <CurrencyAmount inputClass={input} label="Monto" required />
          <label className="flex grow flex-col">
            Nota
            <input type="text" name="notes" className={`${input} min-w-40`} />
          </label>
          <button type="submit" disabled={pending}
            className="rounded bg-amber-700 px-3 py-1 font-medium text-white hover:bg-amber-800 disabled:opacity-50">
            {pending ? "Guardando…" : "Registrar"}
          </button>
          {error && <span className="text-red-700">{error}</span>}
        </form>
      )}
      {entregas.length > 0 && (
        <details className="mt-1 text-neutral-500">
          <summary className="cursor-pointer">historial de entregas</summary>
          <ul className="mt-1 space-y-0.5">
            {entregas.map((e) => (
              <li key={e.id} className="tabular-nums">
                {fmtDate(e.date)} · {e.holder} entregó{" "}
                {e.currency === "ARS" ? fmtARS(e.amount_ars, 0) : fmtUSD(e.amount_usd)}
                {e.notes && <span className="italic"> — {e.notes}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
