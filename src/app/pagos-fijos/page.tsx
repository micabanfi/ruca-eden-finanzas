import Link from "next/link";
import PagosFijosMatrix from "@/components/PagosFijosMatrix";
import { getMonthlySummary, getPagosFijosSheet } from "@/db/pagosFijos";
import { readWithRetry } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // serverless: cortar a los 30s, no a los 300

export default async function PagosFijosPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const [cells, monthly] = await Promise.all([
    readWithRetry(() => getPagosFijosSheet()),
    readWithRetry(() => getMonthlySummary()),
  ]);

  const years = [
    ...new Set([...cells, ...monthly].map((r) => Number(r.mes.slice(0, 4)))),
  ].sort();
  const current = new Date().getFullYear();
  const year = Number(params.year) || (years.includes(current) ? current : years.at(-1)!);

  // los Ajustes (ej. Pago Ruben) viven en el Resumen, no en la matriz mensual
  const yearCells = cells.filter(
    (c) => c.mes.startsWith(`${year}-`) && c.category !== "Ajuste",
  );
  const yearMonthly = monthly.filter((m) => m.mes.startsWith(`${year}-`));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {years.map((y) => (
          <Link
            key={y}
            href={`/pagos-fijos?year=${y}`}
            className={`rounded px-3 py-1 text-sm ${
              y === year
                ? "bg-green-800 font-semibold text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {y}
          </Link>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        Convención de la planilla: servicios y sueldos atribuidos al mes anterior
        (&quot;mes vencido&quot;), excepto Internet y Gastos Varios. Alquileres cobrados
        vinculados a reserva van al mes del checkin. Mes actual resaltado.
      </p>
      <PagosFijosMatrix cells={yearCells} monthly={yearMonthly} />
    </div>
  );
}
