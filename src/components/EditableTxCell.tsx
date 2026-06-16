"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updateTransaction } from "@/actions/transactions";
import BlockingSpinner from "@/components/BlockingSpinner";

/** Celda de egreso editable por doble-click. Espeja el patrón de EditableCell
 *  de ReservationsTable, pero escribe vía updateTransaction (que recalcula el
 *  precio blue cuando cambia el precio en ARS o el dólar blue). */
export default function EditableTxCell({
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
      const res = await updateTransaction(id, field, value);
      if (!res.ok) window.alert(res.error ?? "Error al guardar");
      router.refresh();
    });
  }

  if (editing) {
    const cls =
      "w-full min-w-20 rounded border border-green-600 bg-white px-1 py-0.5 text-xs focus:outline-none";
    // incluir el valor actual en la lista si no es una de las opciones típicas
    const opts =
      type === "select" && raw && !options?.includes(raw) ? [raw, ...(options ?? [])] : options;
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
            {opts!.map((o) => (
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
