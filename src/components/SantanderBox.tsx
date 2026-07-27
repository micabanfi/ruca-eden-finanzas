"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addMovimiento,
  cancelarMovimiento,
  registrarFx,
  restaurarMovimiento,
  setSaldoInicial,
} from "@/actions/cuenta";
import type { CuentaMov, CuentaSaldo, SaldoInicial } from "@/db/cuenta";
import { fmtARS, fmtDate, fmtUSD } from "@/lib/format";

// Cuántos movimientos mostrar de entrada en el popup (el resto con "ver más").
const PAGE = 50;

const input =
  "rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs focus:border-green-700 focus:outline-none";

const today = () => new Date().toISOString().slice(0, 10);

type Panel = "fx" | "manual" | "apertura" | null;

/** Cuenta Banco Santander DÉBITO (bi-moneda). Saldo en pesos y USD + popup de
 *  movimientos ordenados por fecha. Se alimenta de señas con cuenta Santander,
 *  egresos con método "Alquileres", compra-venta de USD (libre) y un saldo
 *  inicial editable. Los gastos con la tarjeta de crédito ("Santander TC") NO
 *  entran: se descuentan al pagar el resumen, como "Mov. manual". */
export default function SantanderBox({
  saldo,
  movimientos,
  saldoInicial,
}: {
  saldo: CuentaSaldo;
  movimientos: CuentaMov[];
  saldoInicial: SaldoInicial;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [showMovs, setShowMovs] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const activos = movimientos.filter((m) => !m.cancelled);
  const canceladas = movimientos.filter((m) => m.cancelled);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? "Error");
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  function onSubmit(fd: FormData, action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>) {
    run(() => action(fd), () => {
      formRef.current?.reset();
      setPanel(null);
    });
  }

  return (
    <div className="rounded border border-sky-200 bg-sky-50/60 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-sky-900">🏦 Banco Santander:</span>
        <button
          onClick={() => setShowMovs(true)}
          className="rounded bg-sky-200/70 px-2 py-0.5 font-semibold text-sky-950 tabular-nums hover:bg-sky-300/70"
          title="Ver movimientos de la cuenta"
        >
          {fmtARS(saldo.saldo_ars, 2)}
        </button>
        <button
          onClick={() => setShowMovs(true)}
          className="rounded bg-sky-200/70 px-2 py-0.5 font-semibold text-sky-950 tabular-nums hover:bg-sky-300/70"
          title="Ver movimientos de la cuenta"
        >
          {fmtUSD(saldo.saldo_usd)}
        </button>
        <span className="grow" />
        <button onClick={() => setPanel(panel === "fx" ? null : "fx")}
          className="rounded bg-sky-700 px-2 py-0.5 font-medium text-white hover:bg-sky-800">
          Compra/venta USD
        </button>
        <button onClick={() => setPanel(panel === "manual" ? null : "manual")}
          className="rounded bg-sky-700 px-2 py-0.5 font-medium text-white hover:bg-sky-800">
          Mov. manual
        </button>
        <button onClick={() => setPanel(panel === "apertura" ? null : "apertura")}
          className="rounded bg-neutral-200 px-2 py-0.5 font-medium text-neutral-700 hover:bg-neutral-300">
          Saldo inicial
        </button>
      </div>

      {/* Compra/venta USD (libre, sin dólar blue) */}
      {panel === "fx" && (
        <form ref={formRef} action={(fd) => onSubmit(fd, registrarFx)}
          className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col">
            Operación
            <select name="direction" defaultValue="venta" className={input}>
              <option value="venta">Vendí USD</option>
              <option value="compra">Compré USD</option>
            </select>
          </label>
          <label className="flex flex-col">
            USD
            <input type="number" name="usd" step="0.01" min="0" required className={`${input} w-24 text-right`} />
          </label>
          <label className="flex flex-col">
            Pesos
            <input type="number" name="ars" step="0.01" min="0" required className={`${input} w-28 text-right`} />
          </label>
          <label className="flex flex-col">
            Fecha
            <input type="date" name="date" required defaultValue={today()} className={input} />
          </label>
          <button type="submit" disabled={pending}
            className="rounded bg-sky-700 px-3 py-1 font-medium text-white hover:bg-sky-800 disabled:opacity-50">
            {pending ? "Guardando…" : "Registrar"}
          </button>
          {error && <span className="text-red-700">{error}</span>}
        </form>
      )}

      {/* Ingreso/egreso manual de la cuenta */}
      {panel === "manual" && (
        <form ref={formRef} action={(fd) => onSubmit(fd, addMovimiento)}
          className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col">
            Tipo
            <select name="kind" defaultValue="ingreso" className={input}>
              <option value="ingreso">Ingreso (+)</option>
              <option value="egreso">Egreso (−)</option>
            </select>
          </label>
          <label className="flex flex-col">
            Pesos
            <input type="number" name="amount_ars" step="0.01" min="0" className={`${input} w-28 text-right`} />
          </label>
          <label className="flex flex-col">
            USD
            <input type="number" name="amount_usd" step="0.01" min="0" className={`${input} w-24 text-right`} />
          </label>
          <label className="flex grow flex-col">
            Concepto
            <input type="text" name="description" className={`${input} min-w-40`} />
          </label>
          <label className="flex flex-col">
            Fecha
            <input type="date" name="date" required defaultValue={today()} className={input} />
          </label>
          <button type="submit" disabled={pending}
            className="rounded bg-sky-700 px-3 py-1 font-medium text-white hover:bg-sky-800 disabled:opacity-50">
            {pending ? "Guardando…" : "Registrar"}
          </button>
          {error && <span className="text-red-700">{error}</span>}
        </form>
      )}

      {/* Saldo inicial (apertura) */}
      {panel === "apertura" && (
        <form ref={formRef} action={(fd) => onSubmit(fd, setSaldoInicial)}
          className="mt-2 flex flex-wrap items-end gap-2">
          <span className="w-full text-neutral-500">
            La plata REAL que tenés en la cuenta a esta fecha. Solo se le suman/restan
            los movimientos <b>posteriores</b> a esta fecha (los gastos anteriores no
            la tocan). Editar acá pisa el saldo inicial anterior.
          </span>
          <label className="flex flex-col">
            Pesos
            <input type="number" name="delta_ars" step="0.01"
              defaultValue={saldoInicial.delta_ars ?? "0"} className={`${input} w-32 text-right`} />
          </label>
          <label className="flex flex-col">
            USD
            <input type="number" name="delta_usd" step="0.01"
              defaultValue={saldoInicial.delta_usd ?? "0"} className={`${input} w-28 text-right`} />
          </label>
          <label className="flex flex-col">
            Fecha
            <input type="date" name="date" required
              defaultValue={saldoInicial.date ?? today()} className={input} />
          </label>
          <button type="submit" disabled={pending}
            className="rounded bg-neutral-700 px-3 py-1 font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {pending ? "Guardando…" : "Guardar saldo inicial"}
          </button>
          {error && <span className="text-red-700">{error}</span>}
        </form>
      )}

      {/* Popup de movimientos */}
      {showMovs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setShowMovs(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-sky-900">
                🏦 Movimientos Santander · {fmtARS(saldo.saldo_ars, 2)} · {fmtUSD(saldo.saldo_usd)}
              </h3>
              <button onClick={() => setShowMovs(false)}
                className="rounded px-2 py-0.5 text-neutral-500 hover:bg-neutral-100">✕</button>
            </div>
            <div className="overflow-auto rounded border border-neutral-200">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {["Fecha", "Concepto", "Pesos", "USD", ""].map((h, i) => (
                      <th key={h || `x${i}`}
                        className="sticky top-0 border-b border-neutral-300 bg-neutral-100 px-2 py-1 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activos.length === 0 && (
                    <tr><td colSpan={5} className="px-2 py-3 text-center text-neutral-400">Sin movimientos todavía</td></tr>
                  )}
                  {activos.slice(0, visible).map((m, i) => (
                    <MovRow key={m.id ? `c${m.id}` : `d${m.source}${i}`} m={m}
                      onCancel={(id) => run(() => cancelarMovimiento(id))} pending={pending} />
                  ))}
                  {activos.length > visible && (
                    <tr>
                      <td colSpan={5} className="px-2 py-2 text-center">
                        <button onClick={() => setVisible((v) => v + PAGE)}
                          className="rounded bg-sky-100 px-3 py-1 font-medium text-sky-800 hover:bg-sky-200">
                          Ver más ({activos.length - visible} restantes)
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {canceladas.length > 0 && (
              <details className="mt-2 text-neutral-500">
                <summary className="cursor-pointer">Canceladas ({canceladas.length})</summary>
                <table className="mt-1 w-full border-collapse text-xs">
                  <tbody>
                    {canceladas.map((m) => (
                      <tr key={`x${m.id}`} className="text-neutral-400 line-through">
                        <td className="px-2 py-1 whitespace-nowrap">{fmtDate(m.date)}</td>
                        <td className="px-2 py-1">{m.concepto}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{signedArs(m.delta_ars)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{signedUsd(m.delta_usd)}</td>
                        <td className="px-2 py-1 text-center no-underline">
                          <button onClick={() => run(() => restaurarMovimiento(m.id!))} disabled={pending}
                            title="Restaurar" className="rounded px-1.5 text-neutral-400 hover:bg-green-100 hover:text-green-700 disabled:opacity-50">↩</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function signedArs(v: string) {
  const n = Number(v);
  if (!n) return "";
  return `${n > 0 ? "+" : "−"}${fmtARS(Math.abs(n), 2)}`;
}
function signedUsd(v: string) {
  const n = Number(v);
  if (!n) return "";
  return `${n > 0 ? "+" : "−"}${fmtUSD(Math.abs(n))}`;
}

function MovRow({
  m,
  onCancel,
  pending,
}: {
  m: CuentaMov;
  onCancel: (id: string) => void;
  pending: boolean;
}) {
  const ars = Number(m.delta_ars);
  const usd = Number(m.delta_usd);
  return (
    <tr className="border-b border-neutral-100 odd:bg-neutral-50">
      <td className="px-2 py-1 whitespace-nowrap">{fmtDate(m.date)}</td>
      <td className="px-2 py-1">{m.concepto}</td>
      <td className={`px-2 py-1 text-right tabular-nums ${ars < 0 ? "text-red-700" : ars > 0 ? "text-green-700" : ""}`}>
        {signedArs(m.delta_ars)}
      </td>
      <td className={`px-2 py-1 text-right tabular-nums ${usd < 0 ? "text-red-700" : usd > 0 ? "text-green-700" : ""}`}>
        {signedUsd(m.delta_usd)}
      </td>
      <td className="px-2 py-1 text-center">
        {m.id ? (
          <button onClick={() => onCancel(m.id!)} disabled={pending}
            title="Cancelar este movimiento (reversible)"
            className="rounded px-1.5 text-neutral-300 hover:bg-red-100 hover:text-red-700 disabled:opacity-50">✕</button>
        ) : (
          <span className="text-neutral-300" title="Se edita en su propia pantalla (reserva / egreso)">·</span>
        )}
      </td>
    </tr>
  );
}
