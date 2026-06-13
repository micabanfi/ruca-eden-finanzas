"use client";

import { useState, useTransition } from "react";
import { createContractLink } from "@/actions/contracts";
import {
  ACLARACIONES,
  buildJotformUrl,
  buildReservaMsg,
  CABIN_PAX,
  fmtMonto,
  nightsBetween,
  type CabinSel,
  type ReservaData,
} from "@/lib/mensajes";

const CABINS = ["Alerce", "Cohiue", "Maiten", "Ruca", "Ruca Chico", "Ruqui"];
const input =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-green-700 focus:outline-none";

function CopyBtn({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="rounded bg-green-700 px-3 py-1 text-sm font-medium text-white hover:bg-green-800"
    >
      {done ? "¡Copiado!" : label}
    </button>
  );
}

export default function MensajesPanel() {
  const [guest, setGuest] = useState("");
  const [cabins, setCabins] = useState<CabinSel[]>([]);
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  // precio: un solo input "primario" (valor x noche o total) y el otro se deriva
  const [priceMode, setPriceMode] = useState<"ppn" | "total">("ppn");
  const [priceInput, setPriceInput] = useState("");
  const [seniaInput, setSeniaInput] = useState<string | null>(null); // null = auto 20%
  const [gastosInput, setGastosInput] = useState<string | null>(null); // null = auto
  const [deposito, setDeposito] = useState("300");
  const [msgEdited, setMsgEdited] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nights = nightsBetween(checkin, checkout);
  const factor = nights * cabins.length;
  const priceNum = Number(priceInput) || 0;
  const ppnNum = priceMode === "ppn" ? priceNum : factor > 0 ? Math.round(priceNum / factor) : 0;
  const totalNum = priceMode === "total" ? priceNum : Math.round(priceNum * factor);
  const seniaNum = seniaInput === null ? Math.round(totalNum * 0.2) : Number(seniaInput) || 0;
  const gastosAuto =
    "Leña según consumo" + (cabins.some((c) => c.name === "Maiten") ? " + garrafa de gas" : "");
  const gastosVal = gastosInput === null ? gastosAuto : gastosInput;
  const depositoNum = Number(deposito) || 0;

  const data: ReservaData = {
    guest,
    cabins,
    checkin,
    checkout,
    ppn: ppnNum,
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
        : [...prev, { name, pax: CABIN_PAX[name] ?? 2 }],
    );
  }
  function setPax(name: string, pax: number) {
    setCabins((prev) => prev.map((c) => (c.name === name ? { ...c, pax } : c)));
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

  const ppnField = priceMode === "ppn" ? priceInput : ppnNum ? String(ppnNum) : "";
  const totalField = priceMode === "total" ? priceInput : totalNum ? String(totalNum) : "";
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
            <input type="date" className={input} value={checkin} onChange={(e) => { setCheckin(e.target.value); setShortCode(null); }} />
          </label>
          <label className={lbl}>
            Check-out
            <input type="date" className={input} value={checkout} onChange={(e) => { setCheckout(e.target.value); setShortCode(null); }} />
          </label>
          <span className="self-end pb-1 text-xs text-neutral-500">{nights} noche{nights === 1 ? "" : "s"}</span>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className={lbl}>
            Valor x noche (USD){cabins.length > 1 ? " · por cabaña" : ""}
            <input
              type="number" className={`${input} w-32 text-right`} value={ppnField}
              onChange={(e) => { setPriceMode("ppn"); setPriceInput(e.target.value); setShortCode(null); }}
            />
          </label>
          <label className={lbl}>
            Total (USD)
            <input
              type="number" className={`${input} w-32 text-right`} value={totalField}
              onChange={(e) => { setPriceMode("total"); setPriceInput(e.target.value); setShortCode(null); }}
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
