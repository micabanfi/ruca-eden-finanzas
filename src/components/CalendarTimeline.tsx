import type { MonthReservation } from "@/db/calendar";
import { CABINS, PLATFORM_COLORS } from "@/lib/catalog";
import { fmtDate } from "@/lib/format";

const MS_DAY = 86_400_000;
const WD = ["D", "L", "M", "M", "J", "V", "S"];

interface Bar {
  start: number; // columna inicial (1-based)
  endEx: number; // columna final exclusiva (grid line)
  lane: number;
  r: MonthReservation;
}

/** Asigna cada reserva a la primera "lane" (sub-fila) libre → apila solapamientos. */
function layout(rows: MonthReservation[], monthStartMs: number, days: number): { bars: Bar[]; lanes: number } {
  const nextMonthMs = monthStartMs + days * MS_DAY;
  const placed = rows
    .map((r) => {
      const ci = Date.parse(r.checkin);
      const co = Date.parse(r.checkout); // exclusivo
      const visStart = Math.max(ci, monthStartMs);
      const visLastNight = Math.min(co - MS_DAY, nextMonthMs - MS_DAY);
      if (visLastNight < visStart) return null; // no tiene noches en este mes
      const startCol = Math.round((visStart - monthStartMs) / MS_DAY) + 1;
      const lastCol = Math.round((visLastNight - monthStartMs) / MS_DAY) + 1;
      return { start: startCol, endEx: lastCol + 1, lane: 0, r };
    })
    .filter((b): b is Bar => b !== null)
    .sort((a, b) => a.start - b.start || a.endEx - b.endEx);

  const laneEnds: number[] = []; // última columna ocupada por lane
  for (const b of placed) {
    let lane = laneEnds.findIndex((end) => end < b.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = b.endEx - 1;
    b.lane = lane;
  }
  return { bars: placed, lanes: Math.max(1, laneEnds.length) };
}

export default function CalendarTimeline({
  reservations,
  mes,
  todayYMD,
}: {
  reservations: MonthReservation[];
  mes: string; // 'YYYY-MM'
  todayYMD: string;
}) {
  const [y, m] = mes.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const monthStartMs = Date.parse(`${mes}-01`);
  const cabins = CABINS.filter((c) => c !== "TODAS");
  const todayCol =
    todayYMD.slice(0, 7) === mes ? Number(todayYMD.slice(8, 10)) : null;

  const cols = `6.5rem repeat(${days}, minmax(1.4rem, 1fr))`;

  return (
    <div className="overflow-x-auto rounded border border-neutral-300">
      <div className="min-w-[44rem] text-xs">
        {/* header de días */}
        <div className="grid items-stretch bg-neutral-100" style={{ gridTemplateColumns: cols }}>
          <div className="border-b border-neutral-300 px-2 py-1 font-semibold">Cabaña</div>
          {Array.from({ length: days }, (_, i) => {
            const d = i + 1;
            const wd = WD[new Date(Date.parse(`${mes}-${String(d).padStart(2, "0")}`)).getUTCDay()];
            const isToday = d === todayCol;
            return (
              <div
                key={d}
                className={`border-b border-l border-neutral-200 py-1 text-center leading-tight ${
                  isToday ? "bg-amber-200 font-bold text-amber-900" : "text-neutral-500"
                }`}
              >
                <div>{d}</div>
                <div className="text-[9px]">{wd}</div>
              </div>
            );
          })}
        </div>

        {/* una fila por cabaña */}
        {cabins.map((cabin) => {
          const rows = reservations.filter((r) => r.cabin === cabin);
          const { bars, lanes } = layout(rows, monthStartMs, days);
          return (
            <div
              key={cabin}
              className="grid border-b border-neutral-100 hover:bg-amber-50/40"
              style={{ gridTemplateColumns: cols }}
            >
              <div className="flex items-center border-r border-neutral-200 px-2 py-1 font-medium">
                {cabin}
              </div>
              {/* celdas de fondo (líneas de días + hoy) */}
              {Array.from({ length: days }, (_, i) => (
                <div
                  key={`bg${i}`}
                  className={`border-l border-neutral-100 ${
                    i + 1 === todayCol ? "bg-amber-100/50" : ""
                  }`}
                  style={{ gridColumn: i + 2, gridRow: 1 }}
                />
              ))}
              {/* sub-grid de barras con lanes */}
              <div
                className="grid gap-0.5 py-0.5"
                style={{
                  gridColumn: `2 / ${days + 2}`,
                  gridRow: 1,
                  gridTemplateColumns: `repeat(${days}, minmax(1.4rem, 1fr))`,
                  gridTemplateRows: `repeat(${lanes}, 1.25rem)`,
                }}
              >
                {bars.map((b) => (
                  <div
                    key={b.r.id}
                    title={`${b.r.cabin} · ${b.r.platform ?? "?"} · ${b.r.guest_name ?? ""}\n${fmtDate(
                      b.r.checkin,
                    )} → ${fmtDate(b.r.checkout)}`}
                    className={`overflow-hidden truncate rounded px-1 text-[10px] leading-5 ${
                      PLATFORM_COLORS[b.r.platform ?? ""] ?? "bg-neutral-200 text-neutral-700"
                    }`}
                    style={{ gridColumn: `${b.start} / ${b.endEx}`, gridRow: b.lane + 1 }}
                  >
                    {b.r.guest_name ?? "—"}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
