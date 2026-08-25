"use client";

import { useState, useTransition } from "react";
import CopyBtn from "@/components/CopyBtn";
import { createContractLink } from "@/actions/contracts";
import {
  ACLARACIONES,
  buildJotformUrl,
  buildReservaMsg,
  CABIN_PAX,
  dispCabin,
  nightsBetween,
  type CabinSel,
  type ReservaData,
} from "@/lib/mensajes";

const CABINS = ["Alerce", "Coihue", "Maiten", "Ruca", "Ruca Chico", "Ruqui"];
const input =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-green-700 focus:outline-none";

export default function MensajesPanel() {
  const [guest, setGuest] = useState("");
  const [cabins, setCabins] = useState<CabinSel[]>([]);
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  // precio: cada cabaña tiene su valor x noche (pueden diferir). El Total se
  // deriva de esos precios; si en cambio se escribe el Total a mano
  // (`totalInput` ≠ null) manda ese número y los precios x noche se muestran
  // repartidos en partes iguales, listos para retocar a mano.
  const [totalInput, setTotalInput] = useState<string | null>(null);
  const [seniaInput, setSeniaInput] = useState<string | null>(null); // null = auto 20%
  const [gastosInput, setGastosInput] = useState<string | null>(null); // null = auto
  const [deposito, setDeposito] = useState("300");
  const [msgEdited, setMsgEdited] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nights = nightsBetween(checkin, checkout);
  const factor = nights * cabins.length;
  const sumPpn = cabins.reduce((s, c) => s + (c.ppn || 0), 0);
  const totalNum = totalInput === null ? Math.round(sumPpn * nights) : Number(totalInput) || 0;
  // precios efectivos: los cargados, o el total repartido en partes iguales
  const cabinsPriced: CabinSel[] =
    totalInput === null
      ? cabins
      : cabins.map((c) => ({ ...c, ppn: factor > 0 ? Math.round(totalNum / factor) : 0 }));
  const seniaNum = seniaInput === null ? Math.round(totalNum * 0.2) : Number(seniaInput) || 0;
  const gastosAuto =
    "Leña según consumo" + (cabins.some((c) => c.name === "Maiten") ? " + garrafa de gas" : "");
  const gastosVal = gastosInput === null ? gastosAuto : gastosInput;
  const depositoNum = Number(deposito) || 0;

  const data: ReservaData = {
    guest,
    cabins: cabinsPriced,
    checkin,
    checkout,
    total: totalNum,
    senia: seniaNum,
    gastosExtra: gastosVal,
    deposito: depositoNum,
  };
  const msg = msgEdited ?? buildReservaMsg(data);
  const ready = cabins.length > 0 && checkin && checkout && totalNum > 0;

  function toggleCabin(name: string) {
    setShortCode(null);
    setCabins((prev) =>
      prev.some((c) => c.name === name)
        ? prev.filter((c) => c.name !== name)
        : // la cabaña nueva arranca con el precio de la primera ya elegida
          [...prev, { name, pax: CABIN_PAX[name] ?? 2, ppn: cabinsPriced[0]?.ppn ?? 0 }],
    );
  }
  function setPax(name: string, pax: number) {
    setCabins((prev) => prev.map((c) => (c.name === name ? { ...c, pax } : c)));
  }
  /** Tocar un precio x noche vuelve al modo "precio manda": se congelan los
   *  precios que se estaban viendo (por si venían repartidos desde el Total) y
   *  se cambia el de esa cabaña. El Total pasa a derivarse de ellos. */
  function setPpn(name: string, ppn: number) {
    setShortCode(null);
    setCabins(cabinsPriced.map((c) => (c.name === name ? { ...c, ppn } : c)));
    setTotalInput(null);
  }

  function generarLink() {
    setLinkErr(null);
    setShortCode(null);
    startTransition(async () => {
      const r = await createContractLink(buildJotformUrl(data), guest);
      if (!r.ok || !r.code) {
        setLinkErr(r.error ?? "Error");
        return;
      }
      setShortCode(r.code);
    });
  }

  const totalField = totalInput === null ? (totalNum ? String(totalNum) : "") : totalInput;
  const shortUrl =
    shortCode && typeof window !== "undefined" ? `${window.location.origin}/c/${shortCode}` : "";

  const lbl = "flex flex-col gap-0.5 text-xs text-neutral-600";

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded border border-neutral-300 p-3">
        <h2 className="text-sm font-semibold text-neutral-700">Mensaje de reserva</h2>

        <label className={lbl}>
          Nombre del huésped
          <input className={input} value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="ej: Macedo" />
        </label>

        <div className={lbl}>
          Cabaña(s)
          <div className="flex flex-wrap gap-1.5">
            {CABINS.map((name) => {
              const sel = cabins.find((c) => c.name === name);
              return (
                <span
                  key={name}
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-sm ${
                    sel ? "border-green-600 bg-green-50" : "border-neutral-300"
                  }`}
                >
                  <button type="button" onClick={() => toggleCabin(name)} className="font-medium">
                    {sel ? "✓ " : ""}
                    {name}
                  </button>
                  {sel && (
                    <input
                      type="number"
                      min="1"
                      value={sel.pax}
                      onChange={(e) => setPax(name, Number(e.target.value))}
                      className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-right text-xs"
                      title="pax"
                    />
                  )}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className={lbl}>
            Check-in
            <input
              type="date"
              className={input}
              value={checkin}
              onChange={(e) => {
                const v = e.target.value;
                setCheckin(v);
                if (checkout && checkout < v) setCheckout(""); // out no puede ser antes del in
                setShortCode(null);
              }}
            />
          </label>
          <label className={lbl}>
            Check-out
            <input
              type="date"
              className={input}
              value={checkout}
              min={checkin || undefined}
              onChange={(e) => { setCheckout(e.target.value); setShortCode(null); }}
            />
          </label>
          <span className="self-end pb-1 text-xs text-neutral-500">{nights} noche{nights === 1 ? "" : "s"}</span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className={lbl}>
            Valor x noche (USD){cabins.length > 1 ? " · uno por cabaña" : ""}
            <div className="flex flex-wrap items-end gap-2">
              {cabinsPriced.length === 0 && (
                <span className="pb-1 text-neutral-400">elegí una cabaña</span>
              )}
              {cabinsPriced.map((c) => (
                <span key={c.name} className="flex flex-col gap-0.5">
                  {cabins.length > 1 && (
                    <span className="text-[10px] text-neutral-500">{dispCabin(c.name)}</span>
                  )}
                  <input
                    type="number"
                    className={`${input} w-24 text-right`}
                    value={c.ppn ? String(c.ppn) : ""}
                    onChange={(e) => setPpn(c.name, Number(e.target.value))}
                  />
                </span>
              ))}
            </div>
          </div>
          <label className={lbl}>
            Total (USD)
            <input
              type="number" className={`${input} w-32 text-right`} value={totalField}
              onChange={(e) => { setTotalInput(e.target.value); setShortCode(null); }}
            />
          </label>
          <label className={lbl}>
            Seña (USD) · 20%
            <input
              type="number" className={`${input} w-32 text-right`}
              value={seniaInput === null ? (seniaNum ? String(seniaNum) : "") : seniaInput}
              onChange={(e) => { setSeniaInput(e.target.value); setShortCode(null); }}
              placeholder="auto 20%"
            />
          </label>
          <label className={lbl}>
            Depósito daños (USD)
            <input type="number" className={`${input} w-32 text-right`} value={deposito} onChange={(e) => setDeposito(e.target.value)} />
          </label>
        </div>

        <label className={lbl}>
          Gastos extra
          <input
            className={input}
            value={gastosInput === null ? gastosAuto : gastosInput}
            onChange={(e) => setGastosInput(e.target.value)}
          />
        </label>

        {/* salida del mensaje */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600">Mensaje (editable)</span>
            <div className="flex gap-2">
              {msgEdited !== null && (
                <button type="button" onClick={() => setMsgEdited(null)} className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200">
                  ↻ regenerar
                </button>
              )}
              <CopyBtn text={msg} />
            </div>
          </div>
          <textarea
            value={msg}
            onChange={(e) => setMsgEdited(e.target.value)}
            rows={11}
            className="w-full rounded border border-neutral-300 p-2 text-xs"
          />
        </div>

        {/* link de contrato */}
        <div className="space-y-1 border-t border-neutral-200 pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generarLink}
              disabled={!ready || pending}
              className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {pending ? "Generando…" : "Generar link de contrato"}
            </button>
            {!ready && <span className="text-xs text-neutral-400">cargá cabaña, fechas y monto</span>}
          </div>
          {/* Con seña 0 el contrato sale sin el total: JotForm descarta el tag
              {precioTotal} porque coincide con {resto} (ver buildJotformUrl). */}
          {ready && seniaNum <= 0 && (
            <p className="text-xs text-amber-700">
              ⚠ Con seña 0 el contrato sale sin el total en la cláusula TERCERA (limitación de
              JotForm). Cargá una seña.
            </p>
          )}
          {linkErr && <p className="text-xs text-red-700">⚠ {linkErr}</p>}
          {shortUrl && (
            <div className="flex flex-wrap items-center gap-2 rounded bg-sky-50 p-2">
              <a href={shortUrl} target="_blank" rel="noreferrer" className="break-all text-sm text-sky-800 underline">
                {shortUrl}
              </a>
              <CopyBtn text={shortUrl} label="Copiar link" />
            </div>
          )}
        </div>
      </section>

      {/* aclaraciones previas */}
      <section className="space-y-1 rounded border border-neutral-300 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Aclaraciones previas</h2>
          <CopyBtn text={ACLARACIONES} />
        </div>
        <pre className="whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs text-neutral-700">{ACLARACIONES}</pre>
      </section>
    </div>
  );
}
