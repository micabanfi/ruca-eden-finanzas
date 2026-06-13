"use client";

import { useState, useTransition } from "react";
import { runCalendarDiff } from "@/actions/calendar";
import type { CalItem, DiffResult, ExtEvent } from "@/lib/ical";
import { fmtDate } from "@/lib/format";

function Range({ start, end }: { start: string; end: string }) {
  return (
    <span className="tabular-nums">
      {fmtDate(start)} → {fmtDate(end)}
    </span>
  );
}

function ExtLine({ e }: { e: ExtEvent }) {
  return (
    <li className="py-0.5">
      <span className="font-medium">{e.cabin ?? "?"}</span>
      {e.guest && <> · {e.guest}</>}
      {e.platform && <> · {e.platform}</>} · <Range start={e.start} end={e.end} />
      {e.note && <span className="ml-1 text-[10px] text-neutral-400">({e.note})</span>}
    </li>
  );
}

function ItemLine({ it }: { it: CalItem }) {
  return (
    <li className="py-0.5">
      <span className="font-medium">{it.cabin}</span>
      {it.guest && <> · {it.guest}</>}
      {it.platform && <> · {it.platform}</>} · <Range start={it.start} end={it.end} />
      <span className="ml-1 text-[10px] text-neutral-400">
        ({it.origin === "airbnb" ? "Airbnb" : "Alquileres Detalle"})
      </span>
    </li>
  );
}

const box = "rounded border p-2";
const h = "mb-1 text-xs font-semibold";

export default function CalendarDiff() {
  const [pending, startTransition] = useTransition();
  const [res, setRes] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(force: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await runCalendarDiff(force);
      if (!r.ok) {
        setError(r.error);
        setRes(null);
        return;
      }
      setRes(r.result);
    });
  }

  const c = res?.counts;
  const allClear =
    res && c && c.airbnbNotInApp + c.notInGoogle + c.googleNotInRecords + c.overbook === 0 &&
    res.unparsedGoogle.length === 0;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => run(false)}
          disabled={pending}
          className="rounded bg-green-700 px-3 py-1 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60"
        >
          {pending ? "Comparando…" : "Comparar con Google / Airbnb"}
        </button>
        {res && !pending && (
          <button
            onClick={() => run(true)}
            disabled={pending}
            className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-200"
            title="Ignora el cache y vuelve a bajar los calendarios"
          >
            ↻ forzar refresco
          </button>
        )}
        {pending && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-green-700" />
        )}
      </div>

      {error && <p className="text-sm text-red-700">⚠ {error}</p>}

      {res && (
        <div className="space-y-2 text-xs">
          {res.feedErrors.length > 0 && (
            <div className={`${box} border-red-300 bg-red-50`}>
              <div className={h}>No pude bajar estas fuentes (el resto se comparó igual):</div>
              <ul className="text-red-800">
                {res.feedErrors.map((f, i) => (
                  <li key={i}>• {f.label}: {f.error}</li>
                ))}
              </ul>
            </div>
          )}

          {allClear ? (
            <p className="rounded border border-green-300 bg-green-50 p-2 text-green-800">
              ✓ Todo coincide.
            </p>
          ) : (
            <>
              {c && c.overbook > 0 && (
                <div className={`${box} border-red-400 bg-red-50`}>
                  <div className={`${h} text-red-800`}>🔴 OVERBOOK — misma casa, fechas pisadas ({c.overbook})</div>
                  <ul className="space-y-1">
                    {res.overbook.map((o, i) => (
                      <li key={i} className="text-red-900">
                        <span className="font-semibold">{o.phys}</span>:{" "}
                        {o.a.label} (<Range start={o.a.start} end={o.a.end} />{o.a.guest ? ` · ${o.a.guest}` : ""}) ⚔{" "}
                        {o.b.label} (<Range start={o.b.start} end={o.b.end} />{o.b.guest ? ` · ${o.b.guest}` : ""})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c && c.airbnbNotInApp > 0 && (
                <div className={`${box} border-orange-300 bg-orange-50`}>
                  <div className={`${h} text-orange-900`}>
                    🟠 Reservas de Airbnb que NO están en Alquileres Detalle ({c.airbnbNotInApp})
                  </div>
                  <ul>{res.airbnbNotInApp.map((e, i) => <ExtLine key={i} e={e} />)}</ul>
                </div>
              )}

              {c && c.googleNotInRecords > 0 && (
                <div className={`${box} border-amber-300 bg-amber-50`}>
                  <div className={`${h} text-amber-900`}>
                    🟡 En Google pero NO en la app ni en Airbnb ({c.googleNotInRecords})
                  </div>
                  <ul>{res.googleNotInRecords.map((e, i) => <ExtLine key={i} e={e} />)}</ul>
                </div>
              )}

              {c && c.notInGoogle > 0 && (
                <div className={`${box} border-sky-300 bg-sky-50`}>
                  <div className={`${h} text-sky-900`}>
                    🟡 En la app / Airbnb pero NO en Google ({c.notInGoogle})
                  </div>
                  <ul>{res.notInGoogle.map((it, i) => <ItemLine key={i} it={it} />)}</ul>
                </div>
              )}

              {res.unparsedGoogle.length > 0 && (
                <div className={`${box} border-neutral-300 bg-neutral-50`}>
                  <div className={h}>No pude leer la cabaña de estos eventos de Google (revisá el título):</div>
                  <ul className="text-neutral-600">
                    {res.unparsedGoogle.map((e, i) => (
                      <li key={i} className="py-0.5">“{e.raw}” · <Range start={e.start} end={e.end} /></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {!res.hasGoogle && (
            <p className="text-[11px] text-neutral-500">
              ℹ Cargá un calendario Google para activar los chequeos contra Google (por ahora solo
              comparo Airbnb ↔ Alquileres Detalle).
            </p>
          )}
          <p className="text-[10px] text-neutral-400">
            Generado {new Date(res.generatedAt).toLocaleString("es-AR")} · cache 1h
          </p>
        </div>
      )}
    </section>
  );
}
