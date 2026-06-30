"use client";

import { useState } from "react";
import { fetchBlueRate } from "@/actions/blue";
import { CURRENCIES } from "@/lib/catalog";

/** Selector de moneda + monto para un ingreso/entrega. En USD es un solo input
 *  (`amount_usd`). En pesos pide `amount_ars` + `blue_rate` (autocompletado con la
 *  cotización del día, editable) y muestra el USD-equiv calculado. Mismo patrón
 *  que ExpenseForm. Los campos se envían con estos `name`, así los lee el action. */
export default function CurrencyAmount({
  inputClass,
  label = "Monto",
  required = false,
  defaultCurrency = "USD",
  defaultUsd,
  defaultArs,
  defaultBlue,
}: {
  inputClass: string;
  label?: string;
  required?: boolean;
  defaultCurrency?: string;
  defaultUsd?: number | null;
  defaultArs?: number | null;
  defaultBlue?: number | null;
}) {
  const [currency, setCurrency] = useState(defaultCurrency === "ARS" ? "ARS" : "USD");
  const [blue, setBlue] = useState<number | null>(defaultBlue ?? null);
  const [ars, setArs] = useState<number | null>(defaultArs ?? null);
  const [fetching, setFetching] = useState(false);

  const usd = ars && blue ? ars / blue : null;

  async function onArsBlur(value: number) {
    setArs(value || null);
    if (!value || blue) return; // una sola búsqueda; después es editable
    setFetching(true);
    try {
      const r = await fetchBlueRate();
      setBlue(r.rate);
    } catch {
      // si falla, lo carga a mano
    } finally {
      setFetching(false);
    }
  }

  return (
    <>
      <input type="hidden" name="currency" value={currency} />
      <label className="flex flex-col text-xs">
        Moneda
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className={inputClass}
        >
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {currency === "USD" ? (
        <label className="flex flex-col text-xs">
          {label} (USD)
          <input
            type="number"
            name="amount_usd"
            step="0.01"
            min="0"
            required={required}
            defaultValue={defaultUsd ?? ""}
            className={`${inputClass} w-28 text-right`}
          />
        </label>
      ) : (
        <>
          <label className="flex flex-col text-xs">
            {label} (pesos)
            <input
              type="number"
              name="amount_ars"
              step="0.01"
              min="0"
              required={required}
              defaultValue={defaultArs ?? ""}
              onBlur={(e) => onArsBlur(Number(e.target.value))}
              className={`${inputClass} w-32 text-right`}
            />
          </label>
          <label className="flex flex-col text-xs">
            Valor blue {fetching && "⏳"}
            <input
              type="number"
              name="blue_rate"
              step="0.01"
              min="0"
              required={required}
              value={blue ?? ""}
              onChange={(e) => setBlue(Number(e.target.value) || null)}
              className={`${inputClass} w-24 text-right`}
            />
          </label>
          <label className="flex flex-col text-xs">
            {label} (USD)
            <input
              type="text"
              readOnly
              tabIndex={-1}
              value={usd ? usd.toFixed(2) : ""}
              className={`${inputClass} w-24 bg-neutral-100 text-right`}
            />
          </label>
        </>
      )}
    </>
  );
}
