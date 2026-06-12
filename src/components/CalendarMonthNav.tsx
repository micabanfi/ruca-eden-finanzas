"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function shift(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CalendarMonthNav({
  mes,
  todayMes,
}: {
  mes: string;
  todayMes: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (m: string) => startTransition(() => router.push(`/calendario?mes=${m}`));

  const [y, m] = mes.split("-").map(Number);
  const label = `${MESES[m - 1]} ${y}`;
  const btn = "rounded px-2 py-1 text-sm hover:bg-neutral-200 disabled:opacity-60";

  return (
    <div className="flex items-center gap-1">
      <button className={btn} disabled={pending} onClick={() => go(shift(mes, -1))} title="Mes anterior">
        ‹
      </button>
      <span className="min-w-40 text-center text-sm font-semibold capitalize">{label}</span>
      <button className={btn} disabled={pending} onClick={() => go(shift(mes, 1))} title="Mes siguiente">
        ›
      </button>
      {mes !== todayMes && (
        <button
          className="ml-1 rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-200 disabled:opacity-60"
          disabled={pending}
          onClick={() => go(todayMes)}
        >
          Hoy
        </button>
      )}
      {pending && (
        <span className="ml-1 h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-green-700" />
      )}
    </div>
  );
}
