"use client";

import { useState, useTransition } from "react";
import { runCalendarDiff } from "@/actions/calendar";
import type { DiffResult, ExtEvent } from "@/lib/ical";
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
      <span className="ml-1 text-[10px] text-neutral-400">({e.sourceLabel})</span>
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
  const allClear = res && c && c.A + c.B + c.C + c.D + c.E === 0 && res.unparsed.length === 0;

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
              ✓ Todo coincide entre el calendario y Alquileres Detalle.
            </p>
          ) : (
            <>
              {c && c.D > 0 && (
                <div className={`${box} border-red-400 bg-red-50`}>
                  <div className={`${h} text-red-800`}>🔴 OVERBOOK — misma casa, fechas pisadas ({c.D})</div>
                  <ul className="space-y-1">
                    {res.D.map((o, i) => (
                      <li key={i} className="text-red-900">
                        <span className="font-semibold">{o.phys}</span>:{" "}
                        {o.a.label} (<Range start={o.a.start} end={o.a.end} />{o.a.guest ? ` · ${o.a.guest}` : ""}) ⚔{" "}
                        {o.b.label} (<Range start={o.b.start} end={o.b.end} />{o.b.guest ? ` · ${o.b.guest}` : ""})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c && c.A > 0 && (
                <div className={`${box} border-amber-300 bg-amber-50`}>
                  <div className={`${h} text-amber-900`}>🟡 En Google pero NO en Alquileres ({c.A}) — ¿falta cargarla?</div>
                  <ul>{res.A.map((e, i) => <ExtLine key={i} e={e} />)}</ul>
                </div>
              )}

              {c && c.B > 0 && (
                <div className={`${box} border-sky-300 bg-sky-50`}>
                  <div className={`${h} text-sky-900`}>🔵 En Alquileres pero NO en Google ({c.B}) — ¿te olvidaste en el calendario?</div>
                  <ul>
                    {res.B.map((r) => (
                      <li key={r.id} className="py-0.5">
                        <span className="font-medium">{r.cabin}</span>
                        {r.guest_name && <> · {r.guest_name}</>}
                        {r.platform && <> · {r.platform}</>} · <Range start={r.checkin} end={r.checkout} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c && c.C > 0 && (
                <div className={`${box} border-amber-300 bg-amber-50`}>
                  <div className={`${h} text-amber-900`}>🟠 Coincide pero con fechas distintas ({c.C})</div>
                  <ul className="space-y-1">
                    {res.C.map((m, i) => (
                      <li key={i}>
                        <span className="font-medium">{m.app.cabin}</span> · {m.app.guest_name ?? m.event.guest ?? ""}:{" "}
                        Google <Range start={m.event.start} end={m.event.end} /> · App{" "}
                        <Range start={m.app.checkin} end={m.app.checkout} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c && c.E > 0 && (
                <div className={`${box} border-orange-300 bg-orange-50`}>
                  <div className={`${h} text-orange-900`}>
                    🟠 Reservas de Airbnb que faltan ({c.E}) — no están en Alquileres Detalle ni en Google
                  </div>
                  <ul>{res.E.map((e, i) => <ExtLine key={i} e={e} />)}</ul>
                </div>
              )}
            </>
          )}

          {res.unparsed.length > 0 && (
            <div className={`${box} border-neutral-300 bg-neutral-50`}>
              <div className={h}>No pude leer la cabaña de estos eventos de Google (revisá el título):</div>
              <ul className="text-neutral-600">
                {res.unparsed.map((e, i) => (
                  <li key={i} className="py-0.5">
                    “{e.raw}” · <Range start={e.start} end={e.end} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-neutral-400">
            Generado {new Date(res.generatedAt).toLocaleString("es-AR")} · cache 1h
          </p>
        </div>
      )}
    </section>
  );
}
