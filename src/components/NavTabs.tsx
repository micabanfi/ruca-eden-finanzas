"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "📊 Dashboard" },
  { href: "/pagos-fijos", label: "Pagos Fijos" },
  { href: "/alquileres", label: "Alquileres Detalle" },
  { href: "/ingresos-egresos", label: "Ingresos/Egresos" },
  { href: "/resumen", label: "Resumen" },
  { href: "/asistente", label: "✨ Asistente" },
];

export default function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-neutral-300 bg-neutral-100 px-4 pt-2">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              active
                ? "border border-b-0 border-neutral-300 bg-white text-green-800"
                : "text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
