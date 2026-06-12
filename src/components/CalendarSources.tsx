"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCalendarSource,
  deactivateCalendarSource,
  reactivateCalendarSource,
} from "@/actions/calendar";
import type { CalendarSource } from "@/db/calendar";
import { CABINS } from "@/lib/catalog";

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}/…${url.slice(-6)}`;
  } catch {
    return `…${url.slice(-6)}`;
  }
}

const input =
  "rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs focus:border-green-700 focus:outline-none";

export default function CalendarSources({ sources }: { sources: CalendarSource[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"google" | "airbnb">("google");
  const [open, setOpen] = useState(false);

  const activas = sources.filter((s) => s.active);
  const inactivas = sources.filter((s) => !s.active);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "Error");
        return;
      }
      router.refresh();
    });
  }

  function submit(fd: FormData) {
    run(() => addCalendarSource(fd));
    setOpen(false);
  }

  const row = (s: CalendarSource, inactive = false) => (
    <li key={s.id} className="flex items-center gap-2 py-0.5">
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
          s.kind === "airbnb" ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"
        }`}
      >
        {s.kind}
      </span>
      <span className="font-medium">{s.label || (s.cabin ?? "Google")}</span>
      {s.cabin && <span className="text-neutral-500">({s.cabin})</span>}
      <span className="text-[10px] text-neutral-400">{maskUrl(s.ics_url)}</span>
      <button
        onClick={() =>
          run(() => (inactive ? reactivateCalendarSource(s.id) : deactivateCalendarSource(s.id)))
        }
        disabled={pending}
        className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-200 disabled:opacity-60"
      >
        {inactive ? "↩ reactivar" : "desactivar"}
      </button>
    </li>
  );

  return (
    <section className="rounded border border-neutral-300 p-2 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-semibold text-neutral-700">Fuentes de calendario</h3>
        <button
          onClick={() => setOpen(!open)}
          className="rounded bg-neutral-100 px-2 py-0.5 hover:bg-neutral-200"
        >
          {open ? "Cerrar" : "+ Agregar"}
        </button>
      </div>

      {activas.length === 0 && !open && (
        <p className="text-neutral-500">
          Todavía no cargaste ninguna. Agregá la URL secreta iCal de Google y/o las de Airbnb.
        </p>
      )}
      <ul>{activas.map((s) => row(s))}</ul>

      {inactivas.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-neutral-500">Inactivas ({inactivas.length})</summary>
          <ul className="opacity-70">{inactivas.map((s) => row(s, true))}</ul>
        </details>
      )}

      {open && (
        <form action={submit} className="mt-2 flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-2">
          <label className="flex flex-col">
            Tipo
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as "google" | "airbnb")}
              className={input}
            >
              <option value="google">Google (todas)</option>
              <option value="airbnb">Airbnb (por cabaña)</option>
            </select>
          </label>
          {kind === "airbnb" && (
            <label className="flex flex-col">
              Cabaña
              <select name="cabin" className={input} defaultValue="">
                <option value="">—</option>
                {CABINS.filter((c) => c !== "TODAS").map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col">
            Nombre (opcional)
            <input type="text" name="label" placeholder="ej: Airbnb Alerce" className={input} />
          </label>
          <label className="flex grow flex-col">
            URL iCal (https://…)
            <input type="url" name="ics_url" required placeholder="https://…/basic.ics" className={`${input} min-w-60`} />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-green-700 px-3 py-1 font-medium text-white hover:bg-green-800 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Agregar"}
          </button>
        </form>
      )}

      {error && <p className="mt-1 text-red-700">⚠ {error}</p>}
    </section>
  );
}
