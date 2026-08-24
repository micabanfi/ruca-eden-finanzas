"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateReservation } from "@/actions/reservations";
import { updateTransaction } from "@/actions/transactions";

/** Sentinel viejo que `addReservation` escribía en `notes`: no es una nota real,
 *  así que no cuenta como tal ni se muestra. */
const NOT_A_NOTE = "creada en app";

/** Devuelve la nota real de una fila (o null si está vacía / es el sentinel). */
function realNote(notes: string | null | undefined): string | null {
  const n = notes?.trim();
  return !n || n === NOT_A_NOTE ? null : n;
}

/** 📝 al lado del nombre/descripción: nota libre para acordarse del "por qué" de
 *  una fila rara (ej. un cobro de USD 0,01 porque se devolvió la estadía por un
 *  robo). Se guarda en la columna `notes` de reservations/transactions.
 *  - con nota: el 📝 va en color y el texto se ve en el tooltip.
 *  - sin nota: 📝 gris tenue, aparece al pasar el mouse por la fila.
 *  Click abre el popup para escribir/editar/borrar. */
export default function NotePopup({
  kind,
  id,
  notes,
  label,
}: {
  kind: "res" | "tx";
  id: string;
  notes: string | null;
  /** nombre de la fila, para el título del popup */
  label?: string | null;
}) {
  const router = useRouter();
  const note = realNote(notes);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(formData: FormData) {
    const value = String(formData.get("notes") ?? "").trim();
    setError(null);
    startTransition(async () => {
      const res =
        kind === "res"
          ? await updateReservation(id, "notes", value)
          : await updateTransaction(id, "notes", value);
      if (!res.ok) {
        setError(res.error ?? "Error al guardar la nota");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center" onDoubleClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={note ? note : "Agregar una nota"}
        className={`ml-1 rounded px-0.5 ${
          note
            ? "opacity-100"
            : "opacity-0 transition-opacity group-hover:opacity-40 hover:!opacity-100"
        } hover:bg-amber-100`}
      >
        📝
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[min(92vw,30rem)] rounded-lg border border-amber-200 bg-white p-4 text-xs shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 font-semibold text-amber-900">
              Nota
              {label && <span className="font-normal text-neutral-500"> · {label}</span>}
            </div>
            <form action={save}>
              <textarea
                name="notes"
                autoFocus
                rows={3}
                defaultValue={note ?? ""}
                placeholder="ej: devolví 1455 por el robo, cobré 0,01 para dejar la reserva cerrada"
                className="w-full rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs focus:border-green-700 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                }}
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Queda guardada en la fila y se ve como 📝 (el texto, al pasar el mouse).
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded bg-amber-700 px-3 py-1 font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                >
                  {pending ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-200"
                >
                  Cerrar
                </button>
                {error && <span className="text-red-700">{error}</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </span>
  );
}
