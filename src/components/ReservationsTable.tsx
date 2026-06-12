"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cancelReservation, restoreReservation, updateReservation } from "@/actions/reservations";
import type { CancelCharge } from "@/actions/reservations";
import BlockingSpinner from "@/components/BlockingSpinner";
import PaymentMethodField from "@/components/forms/PaymentMethodField";
import type { BookingAlert, Reservation } from "@/db/reservations";
import { CABINS, HOLDERS, PLATFORMS } from "@/lib/catalog";
import { fmtDate, fmtUSD } from "@/lib/format";

const PLATFORM_COLORS: Record<string, string> = {
  AirBnb: "bg-rose-100 text-rose-800",
  WA: "bg-green-100 text-green-800",
  Booking: "bg-blue-100 text-blue-800",
  Instagram: "bg-purple-100 text-purple-800",
  Meli: "bg-yellow-100 text-yellow-800",
  Parairnos: "bg-cyan-100 text-cyan-800",
  Terceros: "bg-neutral-200 text-neutral-700",
};

function EditableCell({
  id,
  field,
  raw,
  type = "text",
  options,
  className,
  children,
}: {
  id: string;
  field: string;
  raw: string;
  type?: "text" | "date" | "number" | "select";
  options?: string[];
  className: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function commit(value: string) {
    setEditing(false);
    if (value === raw) return;
    startTransition(async () => {
      const res = await updateReservation(id, field, value);
      if (!res.ok) window.alert(res.error ?? "Error al guardar");
      router.refresh();
    });
  }

  if (editing) {
    const cls =
      "w-full min-w-20 rounded border border-green-600 bg-white px-1 py-0.5 text-xs focus:outline-none";
    return (
      <td className={className}>
        {type === "select" ? (
          <select
            autoFocus
            defaultValue={raw}
            className={cls}
            onChange={(e) => commit(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          >
            {!raw && <option value="">—</option>}
            {options!.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : (
          <input
            autoFocus
            type={type}
            step={type === "number" ? "0.01" : undefined}
            defaultValue={raw}
            className={cls}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(e.currentTarget.value);
              if (e.key === "Escape") setEditing(false);
            }}
          />
        )}
      </td>
    );
  }
  return (
    <td
      className={`${className} ${pending ? "bg-amber-100 opacity-60" : "cursor-text"}`}
      title={pending ? "Guardando…" : "Doble click para editar"}
      onDoubleClick={() => !pending && setEditing(true)}
    >
      {children}
      <BlockingSpinner show={pending} label="Guardando…" />
    </td>
  );
}

const modalInput =
  "rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs focus:border-green-700 focus:outline-none";

function CancelButton({
  id,
  label,
  deposit,
}: {
  id: string;
  label: string;
  deposit: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [charging, setCharging] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const dep = deposit && Number(deposit) > 0 ? Number(deposit) : null;

  function close() {
    setOpen(false);
    setCharging(false);
    setError(null);
  }

  function submit(formData: FormData) {
    setError(null);
    let charge: CancelCharge | null = null;
    if (charging) {
      const amount = Number(formData.get("amount_usd"));
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Cargá cuánto se le cobró (o destildá la opción)");
        return;
      }
      charge = {
        amount,
        holder: String(formData.get("holder") ?? "").trim() || null,
        payment_method: String(formData.get("payment_method") ?? "").trim() || null,
        date: String(formData.get("date") ?? today) || today,
        notes: String(formData.get("notes") ?? "").trim() || "Canceló tarde — se cobró igual",
      };
    }
    startTransition(async () => {
      const res = await cancelReservation(id, charge);
      if (!res.ok) {
        setError(res.error ?? "Error al cancelar");
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        title="Cancelar reserva (se cayó) — no se borra, queda en Canceladas"
        className="rounded px-1.5 py-0.5 text-neutral-400 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
      >
        ✕
      </button>
      <BlockingSpinner show={pending} label="Cancelando reserva…" />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={close}
        >
          <form
            action={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-lg bg-white p-4 text-left text-sm shadow-xl"
          >
            <h3 className="text-base font-semibold text-neutral-800">
              Cancelar reserva {label && <span className="font-normal">de {label}</span>}
            </h3>
            <p className="text-xs text-neutral-500">
              No se borra: pasa a la sección “Canceladas” y se puede restaurar.
            </p>

            <label className="flex items-start gap-2 rounded border border-neutral-200 bg-neutral-50 p-2">
              <input
                type="checkbox"
                checked={charging}
                onChange={(e) => setCharging(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs">
                <span className="font-medium text-neutral-800">
                  Canceló tarde — se le cobró igual
                </span>
                <br />
                <span className="text-neutral-500">
                  Registra un ingreso (seña/penalidad) marcado en rojo en Ingresos
                  Inquilinos.
                </span>
              </span>
            </label>

            {charging && (
              <div className="flex flex-wrap items-end gap-2 rounded border border-red-200 bg-red-50/60 p-2">
                <label className="flex flex-col text-xs">
                  Monto cobrado (USD)
                  <input
                    type="number"
                    name="amount_usd"
                    step="0.01"
                    min="0"
                    autoFocus
                    defaultValue={dep ?? ""}
                    placeholder={dep ? undefined : "ej: 150"}
                    className={`${modalInput} w-28 text-right`}
                  />
                </label>
                <label className="flex flex-col text-xs">
                  La tiene
                  <select name="holder" defaultValue="Mica" className={modalInput}>
                    <option value="">—</option>
                    {HOLDERS.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </label>
                <PaymentMethodField inputClass={modalInput} />
                <label className="flex flex-col text-xs">
                  Fecha
                  <input type="date" name="date" defaultValue={today} className={modalInput} />
                </label>
                <label className="flex grow flex-col text-xs">
                  Nota
                  <input
                    type="text"
                    name="notes"
                    defaultValue="Canceló tarde — se cobró la seña"
                    className={`${modalInput} min-w-40`}
                  />
                </label>
              </div>
            )}

            {error && <p className="text-xs text-red-700">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="rounded px-3 py-1 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded bg-red-700 px-3 py-1 font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {pending
                  ? "Cancelando…"
                  : charging
                    ? "Cancelar y registrar cobro"
                    : "Cancelar reserva"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function RestoreButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function onClick() {
    if (!window.confirm(`¿Restaurar la reserva de ${label || "esta reserva"}? Vuelve al listado activo.`)) return;
    startTransition(async () => {
      const res = await restoreReservation(id);
      if (!res.ok) window.alert(res.error ?? "Error al restaurar");
      router.refresh();
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title="Restaurar reserva (volver a activa)"
        className="rounded px-1.5 py-0.5 text-neutral-400 hover:bg-green-100 hover:text-green-700 disabled:opacity-50"
      >
        ↩
      </button>
      <BlockingSpinner show={pending} label="Restaurando reserva…" />
    </>
  );
}

export default function ReservationsTable({
  reservations,
  alerts,
  mode = "active",
}: {
  reservations: Reservation[];
  alerts: BookingAlert[];
  mode?: "active" | "cancelled";
}) {
  // res id -> alert labels
  const alertsById = new Map<string, string[]>();
  for (const a of alerts) {
    for (const id of [a.res_id_1, a.res_id_2]) {
      if (!alertsById.has(id)) alertsById.set(id, []);
      alertsById.get(id)!.push(a.alerta);
    }
  }
  const today = new Date().toISOString().slice(0, 10);

  const th = "sticky top-0 z-10 border-b border-neutral-300 bg-neutral-100 px-2 py-1 text-left text-xs font-semibold whitespace-nowrap";
  const td = "border-b border-neutral-100 px-2 py-1 whitespace-nowrap";
  const tdR = `${td} text-right tabular-nums`;

  return (
    <div className="max-h-[80vh] overflow-auto rounded border border-neutral-300 text-xs">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["CheckIn", "CheckOut", "Nombre", "Cel", "Cabaña", "Plataforma", "Noches",
              "Precio x noche", "Total", "Seña", "Restante", "Método pago (seña)", "Alertas", ""].map((h, i) => (
              <th key={h || `del-${i}`} className={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reservations.map((r) => {
            const future = r.checkin >= today;
            const resAlerts = alertsById.get(r.id) ?? [];
            // de acá en adelante: futuras no-AirBnb sin seña ni método cargado
            const faltaSenia =
              future &&
              r.platform !== "AirBnb" &&
              !(Number(r.deposit_usd) > 0) &&
              !r.payment_method &&
              r.collected !== 1;
            return (
              <tr
                key={r.id}
                className={`hover:bg-amber-50 ${
                  faltaSenia ? "bg-amber-100" : future ? "bg-sky-50" : "odd:bg-neutral-50"
                }`}
              >
                <EditableCell id={r.id} field="checkin" type="date" raw={r.checkin} className={td}>
                  {fmtDate(r.checkin)}
                </EditableCell>
                <EditableCell id={r.id} field="checkout" type="date" raw={r.checkout} className={td}>
                  {fmtDate(r.checkout)}
                </EditableCell>
                <EditableCell id={r.id} field="guest_name" raw={r.guest_name ?? ""} className={`${td} max-w-56 truncate font-medium`}>
                  {r.guest_name}
                </EditableCell>
                <EditableCell id={r.id} field="phone" raw={r.phone ?? ""} className={`${td} tabular-nums`}>
                  {r.phone}
                </EditableCell>
                <EditableCell id={r.id} field="cabin" type="select" options={CABINS} raw={r.cabin ?? ""} className={td}>
                  {r.cabin}
                </EditableCell>
                <EditableCell id={r.id} field="platform" type="select" options={PLATFORMS} raw={r.platform ?? ""} className={td}>
                  {r.platform && (
                    <span className={`rounded px-1.5 py-0.5 ${PLATFORM_COLORS[r.platform] ?? "bg-neutral-100"}`}>
                      {r.platform}
                    </span>
                  )}
                </EditableCell>
                <EditableCell id={r.id} field="nights" type="number" raw={String(r.nights ?? "")} className={tdR}>
                  {r.nights}
                </EditableCell>
                <EditableCell id={r.id} field="price_per_night" type="number" raw={r.price_per_night ?? ""} className={tdR}>
                  {fmtUSD(r.price_per_night)}
                </EditableCell>
                <EditableCell id={r.id} field="total_usd" type="number" raw={r.total_usd ?? ""} className={`${tdR} font-medium`}>
                  {fmtUSD(r.total_usd)}
                </EditableCell>
                <EditableCell id={r.id} field="deposit_usd" type="number" raw={r.deposit_usd ?? ""} className={tdR}>
                  {faltaSenia ? (
                    <span
                      className="rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950"
                      title="Reserva futura sin AirBnb, sin seña cargada — ¿falta cobrarla?"
                    >
                      ⚠ falta seña
                    </span>
                  ) : (
                    fmtUSD(r.deposit_usd)
                  )}
                </EditableCell>
                <EditableCell id={r.id} field="balance_usd" type="number" raw={r.balance_usd ?? ""} className={tdR}>
                  {fmtUSD(r.balance_usd)}
                </EditableCell>
                <EditableCell
                  id={r.id}
                  field="payment_method"
                  raw={r.payment_method ?? ""}
                  className={`${td} max-w-40 truncate`}
                >
                  {r.payment_method}
                </EditableCell>
                <td className={td}>
                  {resAlerts.map((a, i) => (
                    <span
                      key={i}
                      className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        a === "OVERLAP"
                          ? "bg-red-200 text-red-900"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {a === "OVERLAP" ? "SOLAPADO" : "in/out mismo día"}
                    </span>
                  ))}
                </td>
                <td className={`${td} text-center`}>
                  {mode === "cancelled" ? (
                    <RestoreButton id={r.id} label={r.guest_name ?? ""} />
                  ) : (
                    <CancelButton id={r.id} label={r.guest_name ?? ""} deposit={r.deposit_usd} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
