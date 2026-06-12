"use client";

import { useState } from "react";
import { PAYMENT_METHODS } from "@/lib/catalog";

/** Select con los métodos de pago típicos + "Otro…" que abre texto libre. */
export default function PaymentMethodField({
  inputClass,
  defaultValue = "",
}: {
  inputClass: string;
  defaultValue?: string;
}) {
  const [other, setOther] = useState(false);
  return (
    <label className="flex flex-col text-xs">
      Método de pago
      {other ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            type="text"
            name="payment_method"
            placeholder="a mano…"
            className={`${inputClass} w-32`}
          />
          <button
            type="button"
            title="Volver a la lista"
            onClick={() => setOther(false)}
            className="rounded px-1 text-neutral-500 hover:bg-neutral-200"
          >
            ↩
          </button>
        </span>
      ) : (
        <select
          name="payment_method"
          defaultValue={defaultValue}
          className={inputClass}
          onChange={(e) => {
            if (e.target.value === "__otro__") setOther(true);
          }}
        >
          <option value="">—</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
          <option value="__otro__">Otro…</option>
        </select>
      )}
    </label>
  );
}
