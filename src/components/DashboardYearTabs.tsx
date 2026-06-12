"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function DashboardYearTabs({
  years,
  current, // "global" o el año como string
}: {
  years: number[];
  current: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (key: string) =>
    startTransition(() => router.push(`/dashboard?year=${key}`));

  const btn = (key: string, label: string) => {
    const active = key === current;
    return (
      <button
        key={key}
        onClick={() => go(key)}
        disabled={pending}
        className={`rounded px-3 py-1 text-sm disabled:opacity-60 ${
          active ? "bg-green-800 font-semibold text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {btn("global", "Global")}
      {years.map((y) => btn(String(y), String(y)))}
      {pending && (
        <span className="ml-2 flex items-center gap-1 text-xs text-neutral-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-green-700" />
          cargando…
        </span>
      )}
    </div>
  );
}
