"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchBlueRate } from "@/actions/blue";
import { addEgreso } from "@/actions/transactions";
import PaymentMethodField from "@/components/forms/PaymentMethodField";

const input =
  "rounded border border-neutral-300 px-2 py-1 text-sm focus:border-green-700 focus:outline-none";

export default function ExpenseForm({ categories }: { categories: string[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [blue, setBlue] = useState<{ rate: number; source: string } | null>(null);
  const [ars, setArs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);

  const usd = ars && blue?.rate ? ars / blue.rate : null;

  async function onArsBlur(value: number) {
    setArs(value || null);
    if (!value || blue) return; // fetch once per entry; editable afterwards
    setFetchingRate(true);
    try {
      const r = await fetchBlueRate();
      setBlue({ rate: r.rate, source: r.source });
    } catch {
      setError("No pude obtener el dólar blue — cargalo a mano");
    } finally {
      setFetchingRate(false);
    }
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addEgreso(formData);
      if (!res.ok) {
        setError(res.error ?? "Error");
        return;
      }
      formRef.current?.reset();
      setBlue(null);
      setArs(null);
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="flex flex-wrap items-end gap-2 rounded border border-red-200 bg-red-50/50 p-2"
    >
      <span className="w-full text-xs font-semibold text-red-800">Agregar egreso</span>
      <label className="flex flex-col text-xs">
        Fecha
        <input
          type="date"
          name="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className={input}
        />
      </label>
      <label className="flex flex-col text-xs">
        Descripción
        <input type="text" name="description" className={`${input} w-48`} placeholder="lavadero mayo" />
      </label>
      <label className="flex flex-col text-xs">
        Precio (ARS)
        <input
          type="number"
          name="amount_ars"
          step="0.01"
          min="0"
          required
          className={`${input} w-32 text-right`}
          onBlur={(e) => onArsBlur(Number(e.target.value))}
        />
      </label>
      <label className="flex flex-col text-xs">
        Valor blue {fetchingRate && "⏳"}
        {blue?.source === "fallback" && (
          <span className="text-amber-700">(último conocido)</span>
        )}
        <input
          type="number"
          name="blue_rate"
          step="0.01"
          min="0"
          required
          value={blue?.rate ?? ""}
          onChange={(e) => setBlue({ rate: Number(e.target.value), source: "manual" })}
          className={`${input} w-24 text-right`}
        />
      </label>
      <label className="flex flex-col text-xs">
        Precio blue (USD)
        <input
          type="text"
          readOnly
          tabIndex={-1}
          value={usd ? usd.toFixed(2) : ""}
          className={`${input} w-24 bg-neutral-100 text-right`}
        />
      </label>
      <label className="flex flex-col text-xs">
        Tipo de pago
        <select name="category" required defaultValue="Gastos Varios" className={input}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <PaymentMethodField inputClass={input} />
      <label className="flex flex-col text-xs">
        Nota
        <input type="text" name="notes" className={`${input} w-40`} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Agregar"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </form>
  );
}
