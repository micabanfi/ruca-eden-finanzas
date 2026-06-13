import type { ExtEvent } from "@/lib/ical";
import { fmtDate } from "@/lib/format";

/** Lista las reservas REALES de Airbnb (no los bloqueos) traídas de los feeds,
 *  ordenadas por fecha. El nombre viene derivado de Alquileres Detalle (Airbnb
 *  no lo trae); si no se pudo cruzar, queda el tel. */
export default function AirbnbReservations({ events }: { events: ExtEvent[] }) {
  const reservas = events
    .filter((e) => e.source === "airbnb" && !e.blocked)
    .sort((a, b) => a.start.localeCompare(b.start) || (a.cabin ?? "").localeCompare(b.cabin ?? ""));

  const th = "border-b border-neutral-300 bg-neutral-100 px-2 py-1 text-left font-semibold";
  const td = "border-b border-neutral-100 px-2 py-1";

  return (
    <section className="rounded border border-neutral-300 p-2 text-xs">
      <h3 className="mb-1 font-semibold text-neutral-700">
        Reservas traídas de Airbnb · {reservas.length}
      </h3>
      {reservas.length === 0 ? (
        <p className="text-neutral-500">
          No hay reservas de Airbnb (agregá las fuentes Airbnb por cabaña arriba).
        </p>
      ) : (
        <div className="max-h-72 overflow-auto rounded border border-neutral-200">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Entra", "Sale", "Cabaña", "Huésped", "Tel", "Origen"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reservas.map((e, i) => (
                <tr key={i} className="odd:bg-neutral-50">
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDate(e.start)}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDate(e.end)}</td>
                  <td className={td}>{e.cabin}</td>
                  <td className={`${td} font-medium`}>
                    {e.guest ?? <span className="text-neutral-400">— sin cruzar —</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap text-neutral-500`}>
                    {e.note?.replace(/^tel\s*/, "") ?? ""}
                  </td>
                  <td className={`${td} whitespace-nowrap text-neutral-400`}>{e.sourceLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
