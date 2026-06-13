import type { ExtEvent } from "@/lib/ical";
import { CABINS, PLATFORM_COLORS } from "@/lib/catalog";
import { fmtDate } from "@/lib/format";

const MS_DAY = 86_400_000;
const WD = ["D", "L", "M", "M", "J", "V", "S"];

interface Bar {
  start: number; // columna inicial (1-based)
  endEx: number; // columna final exclusiva (grid line)
  lane: number;
  e: ExtEvent;
}

/** Asigna cada evento a la primera "lane" (sub-fila) libre → apila solapamientos. */
function layout(events: ExtEvent[], monthStartMs: number, days: number): { bars: Bar[]; lanes: number } {
  const nextMonthMs = monthStartMs + days * MS_DAY;
  const placed = events
    .map((e) => {
      const ci = Date.parse(e.start);
      const co = Date.parse(e.end); // exclusivo
      const visStart = Math.max(ci, monthStartMs);
      // mostramos hasta el DÍA de checkout inclusive (así las salidas/entradas del
      // mismo día se ven tocándose y el out coincide con lo que figura en Airbnb)
      const visLast = Math.min(co, nextMonthMs - MS_DAY);
      if (visLast < visStart) return null;
      const startCol = Math.round((visStart - monthStartMs) / MS_DAY) + 1;
      const lastCol = Math.round((visLast - monthStartMs) / MS_DAY) + 1;
      return { start: startCol, endEx: lastCol + 1, lane: 0, e };
    })
    .filter((b): b is Bar => b !== null)
    .sort((a, b) => a.start - b.start || a.endEx - b.endEx);

  const laneEnds: number[] = [];
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
  events,
  mes,
  todayYMD,
}: {
  events: ExtEvent[]; // eventos que vienen de los calendarios (Google + Airbnb)
  mes: string; // 'YYYY-MM'
  todayYMD: string;
}) {
  const [y, m] = mes.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const monthStartMs = Date.parse(`${mes}-01`);
  const cabins = CABINS.filter((c) => c !== "TODAS");
  const todayCol = todayYMD.slice(0, 7) === mes ? Number(todayYMD.slice(8, 10)) : null;

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
          const evs = events.filter((e) => e.cabin === cabin);
          const { bars, lanes } = layout(evs, monthStartMs, days);
          return (
            <div
              key={cabin}
              className="grid border-b border-neutral-100 hover:bg-amber-50/40"
              style={{ gridTemplateColumns: cols }}
            >
              <div className="flex items-center border-r border-neutral-200 px-2 py-1 font-medium">
                {cabin}
              </div>
              {/* celdas de fondo (líneas + hoy) */}
              {Array.from({ length: days }, (_, i) => (
                <div
                  key={`bg${i}`}
                  className={`border-l border-neutral-100 ${i + 1 === todayCol ? "bg-amber-100/50" : ""}`}
                  style={{ gridColumn: i + 2, gridRow: 1 }}
                />
              ))}
              {/* barras con lanes */}
              <div
                className="grid gap-0.5 py-0.5"
                style={{
                  gridColumn: `2 / ${days + 2}`,
                  gridRow: 1,
                  gridTemplateColumns: `repeat(${days}, minmax(1.4rem, 1fr))`,
                  gridTemplateRows: `repeat(${lanes}, 1.25rem)`,
                }}
              >
                {bars.map((b, idx) => {
                  const e = b.e;
                  const isBlocked = e.source === "airbnb" && e.blocked;
                  const lbl = e.guest ?? e.note ?? (isBlocked ? "bloqueado" : "");
                  const cls = isBlocked
                    ? "bg-neutral-200 italic text-neutral-500"
                    : PLATFORM_COLORS[e.platform ?? ""] ?? "bg-neutral-200 text-neutral-700";
                  const tipPlat = isBlocked ? "Airbnb (bloqueado)" : e.platform ?? "?";
                  const tipWho = e.guest ? ` · ${e.guest}` : e.note ? ` · ${e.note}` : "";
                  return (
                    <div
                      key={idx}
                      title={`${e.cabin} · ${tipPlat}${tipWho}\nEntra ${fmtDate(e.start)} · Sale ${fmtDate(
                        e.end,
                      )}\n(${e.sourceLabel})`}
                      className={`overflow-hidden truncate rounded px-1 text-[10px] leading-5 ${cls}`}
                      style={{ gridColumn: `${b.start} / ${b.endEx}`, gridRow: b.lane + 1 }}
                    >
                      {lbl}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
