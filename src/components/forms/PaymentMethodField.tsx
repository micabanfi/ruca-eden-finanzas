"use client";

import { useState } from "react";
import { PAYMENT_METHODS } from "@/lib/catalog";

/** Select con los métodos de pago típicos + "Otro…" que abre texto libre.
 *
 *  `required` obliga a elegir uno (el "—" no valida). Se usa en los caminos de
 *  INGRESO: al cobrar sin elegir método, el ingreso quedaba con payment_method
 *  NULL y caía en el bucket "Sin dato" del dashboard — 6 de los 9 casos de
 *  2026 salieron de ahí (Mimi, 2026-08-05: "no pueden quedar así"). En egresos
 *  y reservas sigue siendo opcional. */
export default function PaymentMethodField({
  inputClass,
  defaultValue = "",
  required = false,
}: {
  inputClass: string;
  defaultValue?: string;
  required?: boolean;
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
            required={required}
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
          required={required}
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
