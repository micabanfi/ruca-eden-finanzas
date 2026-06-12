"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addIngreso } from "@/actions/transactions";
import PaymentMethodField from "@/components/forms/PaymentMethodField";
import { HOLDERS } from "@/lib/catalog";

const input =
  "rounded border border-neutral-300 px-2 py-1 text-sm focus:border-green-700 focus:outline-none";

export default function IncomeForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addIngreso(formData);
      if (!res.ok) {
        setError(res.error ?? "Error");
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="flex flex-wrap items-end gap-2 rounded border border-green-200 bg-green-50/50 p-2"
    >
      <span className="w-full text-xs font-semibold text-green-800">Agregar ingreso</span>
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
        Nombre
        <input type="text" name="description" className={`${input} w-44`} placeholder="inquilino" />
      </label>
      <label className="flex flex-col text-xs">
        Precio (USD)
        <input type="number" name="amount_usd" step="0.01" min="0" required className={`${input} w-28 text-right`} />
      </label>
      <PaymentMethodField inputClass={input} />
      <label className="flex flex-col text-xs">
        Lo tiene
        <select name="holder" defaultValue="" className={input}>
          <option value="">—</option>
          {HOLDERS.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs">
        Nota
        <input type="text" name="notes" className={`${input} w-40`} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Agregar"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </form>
  );
}
