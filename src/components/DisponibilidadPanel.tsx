"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import CopyBtn from "@/components/CopyBtn";
import { runCalendarDiff } from "@/actions/calendar";
import type { Reservation } from "@/db/reservations";
// OJO: desde un componente cliente hay que importar de `ical-core` (puro), NO de
// `@/lib/ical`, que arrastra node-ical/node:fs y rompe la página en el browser.
import type { DiffResult } from "@/lib/ical-core";
import {
  buildDisponibilidad,
  mesesDisponibles,
  nombreMes,
} from "@/lib/disponibilidad";

/** 'YYYY-MM-DD' de hoy (misma convención UTC que el resto de la app). */
const todayYMD = () => new Date().toISOString().slice(0, 10);

/** "ene 27" para el chip del mes. */
const chipMes = (mes: string): string => {
  const n = nombreMes(mes); // "enero 2027"
  const [nombre, anio] = n.split(" ");
  return `${nombre.slice(0, 3)} ${anio.slice(2)}`;
};

export default function DisponibilidadPanel({ reservations }: { reservations: Reservation[] }) {
  const hoy = useMemo(() => todayYMD(), []);
  const meses = useMemo(() => mesesDisponibles(hoy, 14), [hoy]);

  // por defecto: el mes en curso y el que viene
  const [sel, setSel] = useState<string[]>(() => meses.slice(0, 2));
  const [conOcupado, setConOcupado] = useState(false);
  const [txtEdited, setTxtEdited] = useState<string | null>(null);

  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffErr, setDiffErr] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [pending, startTransition] = useTransition();

  function checkCalendar(force = false) {
    startTransition(async () => {
      // El try/catch no es decorativo: si el server action falla de verdad, el
      // await rechaza y React propaga al error boundary → caía la pantalla.
      // El chequeo es opcional; nunca debe tumbar la página.
      try {
        const r = await runCalendarDiff(force);
        setChecked(true);
        setTxtEdited(null);
        if (r.ok) {
          setDiff(r.result);
          setDiffErr(null);
        } else {
          setDiff(null);
          setDiffErr(r.error);
        }
      } catch (e) {
        setChecked(true);
        setDiff(null);
        setDiffErr(e instanceof Error ? e.message : "No se pudo chequear el calendario");
      }
    });
  }

  useEffect(() => {
    checkCalendar(false);
  }, []);

  const toggleMes = (mes: string) => {
    setSel((prev) => (prev.includes(mes) ? prev.filter((m) => m !== mes) : [...prev, mes].sort()));
    setTxtEdited(null);
  };

  const generated = useMemo(
    () => buildDisponibilidad(reservations, diff, { meses: sel, hoy, conOcupado }),
    [reservations, diff, sel, hoy, conOcupado],
  );
  const txt = txtEdited ?? generated;

  // tramos ocupados que solo existen en el calendario: hay que cargarlos
  const externos =
    (diff?.counts.googleNotInRecords ?? 0) +
    (diff?.counts.airbnbNotInApp ?? 0) +
    (diff?.counts.dateMismatch ?? 0);

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded border border-neutral-300 p-3">
        <h2 className="text-sm font-semibold text-neutral-700">Disponibilidad por cabaña</h2>

        <div className="space-y-1">
          <span className="text-xs text-neutral-600">Meses</span>
          <div className="flex flex-wrap gap-1.5">
            {meses.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleMes(m)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  sel.includes(m)
                    ? "bg-green-700 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {chipMes(m)}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-neutral-600">
          <input
            type="checkbox"
            checked={conOcupado}
            onChange={(e) => {
              setConOcupado(e.target.checked);
              setTxtEdited(null);
            }}
          />
          mostrar también lo ocupado (para chequear, no para mandar)
        </label>

        {/* estado del cruce con el calendario */}
        {pending && !checked ? (
          <p className="text-xs text-neutral-400">Chequeando contra el calendario…</p>
        ) : diffErr ? (
          <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            ⚠ No se pudo leer el calendario ({diffErr}). La disponibilidad sale SOLO de Alquileres
            Detalle: si hay alguna reserva anotada nada más que en Google, va a figurar como libre.
          </p>
        ) : externos > 0 ? (
          <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            ⚠ Hay {externos} tramo{externos === 1 ? "" : "s"} ocupado{externos === 1 ? "" : "s"} en el
            calendario que no está{externos === 1 ? "" : "n"} cargado{externos === 1 ? "" : "s"} en
            Alquileres Detalle. Ya los conté como ocupados y los listé al final del texto — conviene
            cargarlos.
          </p>
        ) : checked ? (
          <p className="text-xs text-green-700">✓ El calendario coincide con Alquileres Detalle.</p>
        ) : null}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600">Disponibilidad (editable)</span>
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
            rows={24}
            className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
          />
        </div>
      </section>
    </div>
  );
}
