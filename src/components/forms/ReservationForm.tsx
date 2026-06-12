"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addReservation } from "@/actions/reservations";
import PaymentMethodField from "@/components/forms/PaymentMethodField";
import { CABINS, PLATFORMS } from "@/lib/catalog";

const input =
  "rounded border border-neutral-300 px-2 py-1 text-sm focus:border-green-700 focus:outline-none";

const addDays = (d: string, n: number) =>
  new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const nightsBetween = (ci: string, co: string) =>
  ci && co ? Math.round((Date.parse(co) - Date.parse(ci)) / 86_400_000) : null;
const round2 = (n: number) => Math.round(n * 100) / 100;

export default function ReservationForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");

  const nights = nightsBetween(checkin, checkout);

  // precio x noche <-> total: editás uno, el otro se calcula solo
  function syncFromPrice(p: string, ci = checkin, co = checkout) {
    setPrice(p);
    const n = nightsBetween(ci, co);
    const v = Number(p);
    if (n && n > 0 && v > 0) setTotal(String(round2(v * n)));
    else if (!p) setTotal("");
  }
  function syncFromTotal(t: string) {
    setTotal(t);
    const v = Number(t);
    if (nights && nights > 0 && v > 0) setPrice(String(round2(v / nights)));
    else if (!t) setPrice("");
  }
  function onCheckin(v: string) {
    setCheckin(v);
    let co = checkout;
    if (v && checkout && checkout <= v) {
      co = addDays(v, 1); // el checkout nunca puede quedar antes del checkin
      setCheckout(co);
    }
    if (price) syncFromPrice(price, v, co);
  }
  function onCheckout(v: string) {
    setCheckout(v);
    if (price) syncFromPrice(price, checkin, v);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addReservation(formData);
      if (!res.ok) {
        setError(res.error ?? "Error");
        return;
      }
      formRef.current?.reset();
      setCheckin("");
      setCheckout("");
      setPrice("");
      setTotal("");
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="flex flex-wrap items-end gap-2 rounded border border-sky-200 bg-sky-50/50 p-2"
    >
      <span className="w-full text-xs font-semibold text-sky-800">Agregar reserva</span>
      <label className="flex flex-col text-xs">
        CheckIn
        <input type="date" name="checkin" required className={input}
          value={checkin} onChange={(e) => onCheckin(e.target.value)} />
      </label>
      <label className="flex flex-col text-xs">
        CheckOut
        <input type="date" name="checkout" required className={input}
          min={checkin ? addDays(checkin, 1) : undefined}
          value={checkout} onChange={(e) => onCheckout(e.target.value)} />
      </label>
      <label className="flex flex-col text-xs">
        Nombre
        <input type="text" name="guest_name" className={`${input} w-40`} />
      </label>
      <label className="flex flex-col text-xs">
        Cel
        <input type="text" name="phone" className={`${input} w-32`} />
      </label>
      <label className="flex flex-col text-xs">
        Cabaña
        <select name="cabin" required className={input} defaultValue="">
          <option value="" disabled>
            elegir…
          </option>
          {CABINS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs">
        Plataforma
        <select name="platform" className={input} defaultValue="AirBnb">
          {PLATFORMS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs">
        Precio x noche (USD)
        <input type="number" name="price_per_night" step="0.01" min="0"
          className={`${input} w-28 text-right`}
          value={price} onChange={(e) => syncFromPrice(e.target.value)} />
      </label>
      <label className="flex flex-col text-xs">
        Total (USD)
        <input type="number" name="total_usd" step="0.01" min="0"
          className={`${input} w-28 text-right`}
          value={total} onChange={(e) => syncFromTotal(e.target.value)} />
      </label>
      <label className="flex flex-col text-xs">
        Seña (USD)
        <input type="number" name="deposit_usd" step="0.01" min="0"
          className={`${input} w-24 text-right`} />
      </label>
      <PaymentMethodField inputClass={input} />
      <div className="flex flex-col text-xs">
        <span>
          Noches: <b>{nights && nights > 0 ? nights : "—"}</b>
        </span>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Agregar"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </form>
  );
}
