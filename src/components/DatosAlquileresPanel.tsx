"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import CopyBtn from "@/components/CopyBtn";
import { runCalendarDiff } from "@/actions/calendar";
import type { Reservation } from "@/db/reservations";
import { addDays, overlaps, type DiffResult } from "@/lib/ical";
import { buildDatosAlquileres, ddmm } from "@/lib/mensajes";

const input =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-green-700 focus:outline-none";

/** 'YYYY-MM-DD' de hoy (misma convención UTC que el resto de la app). */
const todayYMD = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type Severity = "red" | "amber";
interface Issue {
  severity: Severity;
  start: string;
  end: string;
  text: string;
}

/** Aplana el DiffResult a una lista de avisos con su rango de fechas, para poder
 *  filtrar por el rango que se está listando. */
function issuesFromDiff(d: DiffResult): Issue[] {
  const out: Issue[] = [];
  for (const o of d.overbook) {
    out.push({
      severity: "red",
      start: o.a.start < o.b.start ? o.a.start : o.b.start,
      end: o.a.end > o.b.end ? o.a.end : o.b.end,
      text: `🔴 ${o.phys}: se pisan ${o.a.guest ?? "—"} (${ddmm(o.a.start)}–${ddmm(o.a.end)}) y ${
        o.b.guest ?? "—"
      } (${ddmm(o.b.start)}–${ddmm(o.b.end)})`,
    });
  }
  for (const m of d.dateMismatch) {
    out.push({
      severity: "amber",
      start: m.app.start < m.google.start ? m.app.start : m.google.start,
      end: m.app.end > m.google.end ? m.app.end : m.google.end,
      text: `🟠 ${m.cabin ?? "—"}${m.guest ? ` (${m.guest})` : ""}: fechas distintas — app ${ddmm(
        m.app.start,
      )}–${ddmm(m.app.end)} vs calendario ${ddmm(m.google.start)}–${ddmm(m.google.end)}`,
    });
  }
  for (const a of d.airbnbNotInApp) {
    out.push({
      severity: "amber",
      start: a.start,
      end: a.end,
      text: `🟠 ${a.cabin ?? "—"}: reserva de Airbnb sin cargar en Alquileres Detalle (${
        a.guest ?? "—"
      } ${ddmm(a.start)}–${ddmm(a.end)})`,
    });
  }
  for (const c of d.notInGoogle) {
    out.push({
      severity: "amber",
      start: c.start,
      end: c.end,
      text: `🟡 ${c.cabin ?? "—"}: nuestra reserva no aparece en el calendario de Google (${
        c.guest ?? "—"
      } ${ddmm(c.start)}–${ddmm(c.end)})`,
    });
  }
  return out;
}

export default function DatosAlquileresPanel({
  reservations,
  invitadaIds,
}: {
  reservations: Reservation[];
  invitadaIds: string[];
}) {
  // fechas por defecto (hoy → +45d). El panel solo se monta al elegir la tab
  // (no hay SSR), así que el inicializador lazy no genera mismatch de hidratación.
  const [desde, setDesde] = useState(() => todayYMD());
  const [hasta, setHasta] = useState(() => plusDays(45));

  const [txtEdited, setTxtEdited] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffErr, setDiffErr] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [pending, startTransition] = useTransition();

  function checkCalendar(force = false) {
    startTransition(async () => {
      const r = await runCalendarDiff(force);
      setChecked(true);
      if (r.ok) {
        setDiff(r.result);
        setDiffErr(null);
      } else {
        setDiff(null);
        setDiffErr(r.error);
      }
    });
  }

  // doble-chequeo automático contra el calendario al montar
  useEffect(() => {
    checkCalendar(false);
  }, []);

  const ready = Boolean(desde && hasta);
  const generated = useMemo(
    () => (ready ? buildDatosAlquileres(reservations, { desde, hasta, invitadaIds }) : ""),
    [reservations, invitadaIds, desde, hasta, ready],
  );
  const txt = txtEdited ?? generated;

  // avisos del calendario acotados al rango que se está listando
  const issues = useMemo(() => {
    if (!diff || !ready) return [];
    return issuesFromDiff(diff).filter((i) => overlaps(i.start, i.end, desde, addDays(hasta, 1)));
  }, [diff, desde, hasta, ready]);
  const hasRed = issues.some((i) => i.severity === "red");
  const feedErrors = diff?.feedErrors ?? [];

  const lbl = "flex flex-col gap-0.5 text-xs text-neutral-600";

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded border border-neutral-300 p-3">
        <h2 className="text-sm font-semibold text-neutral-700">Datos de alquileres (para el encargado)</h2>

        <div className="flex flex-wrap items-end gap-3">
          <label className={lbl}>
            Desde (check-in)
            <input
              type="date"
              className={input}
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                setTxtEdited(null);
              }}
            />
          </label>
          <label className={lbl}>
            Hasta (check-in)
            <input
              type="date"
              className={input}
              value={hasta}
              min={desde || undefined}
              onChange={(e) => {
                setHasta(e.target.value);
                setTxtEdited(null);
              }}
            />
          </label>
        </div>

        {/* cartel de doble-chequeo con el calendario */}
        {pending && !checked ? (
          <p className="text-xs text-neutral-400">Chequeando contra el calendario…</p>
        ) : diffErr ? (
          <p className="rounded bg-neutral-100 p-2 text-xs text-neutral-500">
            No se pudo chequear contra el calendario ({diffErr}). El listado igual sale de Alquileres Detalle.
          </p>
        ) : issues.length > 0 ? (
          <div
            className={`space-y-1 rounded border p-2 text-xs ${
              hasRed ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-800"
            }`}
          >
            <p className="font-semibold">
              ⚠ Ojo: hay {issues.length} diferencia{issues.length === 1 ? "" : "s"} entre Alquileres Detalle y el
              calendario en este rango:
            </p>
            <ul className="list-inside list-disc space-y-0.5">
              {issues.map((i, idx) => (
                <li key={idx}>{i.text}</li>
              ))}
            </ul>
          </div>
        ) : checked && !diffErr ? (
          <p className="text-xs text-green-700">✓ El calendario coincide con Alquileres Detalle en este rango.</p>
        ) : null}
        {feedErrors.length > 0 && (
          <p className="text-xs text-neutral-400">
            (algún feed no respondió: {feedErrors.map((f) => f.label).join(", ")})
          </p>
        )}

        {/* salida del listado */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600">Listado (editable)</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => checkCalendar(true)}
                disabled={pending}
                className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200 disabled:opacity-50"
                title="Rebajar los feeds y volver a comparar"
              >
                {pending ? "Chequeando…" : "↻ revalidar calendario"}
              </button>
              {txtEdited !== null && (
                <button
                  type="button"
                  onClick={() => setTxtEdited(null)}
                  className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200"
                >
                  ↻ regenerar
                </button>
              )}
              <CopyBtn text={txt} />
            </div>
          </div>
          <textarea
            value={txt}
            onChange={(e) => setTxtEdited(e.target.value)}
            rows={20}
            className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
          />
        </div>
      </section>
    </div>
  );
}
