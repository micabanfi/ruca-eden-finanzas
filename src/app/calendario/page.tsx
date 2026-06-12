import CalendarDiff from "@/components/CalendarDiff";
import CalendarMonthNav from "@/components/CalendarMonthNav";
import CalendarSources from "@/components/CalendarSources";
import CalendarTimeline from "@/components/CalendarTimeline";
import { getCalendarSources } from "@/db/calendar";
import { eventsForMonth, loadFeeds } from "@/lib/ical";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const params = await searchParams;
  const todayYMD = new Date().toISOString().slice(0, 10);
  const todayMes = todayYMD.slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? (params.mes as string) : todayMes;

  const sources = await getCalendarSources();
  const active = sources.filter((s) => s.active);
  // El calendario se llena con lo que viene de los feeds (Google + Airbnb).
  const { events, feedErrors } = await loadFeeds(active);
  const monthEvents = eventsForMonth(events, mes);
  const unplaceable = monthEvents.filter((e) => !e.cabin).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CalendarMonthNav mes={mes} todayMes={todayMes} />
        <p className="text-xs text-neutral-500">
          datos de Google Calendar + Airbnb · barras por plataforma · hoy resaltado
        </p>
      </div>

      {active.length === 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Todavía no cargaste ninguna fuente. Agregá abajo la URL secreta iCal de Google y/o las de
          Airbnb para ver acá tu calendario.
        </p>
      )}

      {feedErrors.length > 0 && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
          No pude leer: {feedErrors.map((f) => `${f.label} (${f.error})`).join(" · ")}
        </p>
      )}

      <CalendarTimeline events={monthEvents} mes={mes} todayYMD={todayYMD} />

      {unplaceable > 0 && (
        <p className="text-xs text-neutral-500">
          ⚠ {unplaceable} evento(s) de este mes sin cabaña reconocible en el título (no se muestran
          en la grilla). Revisalos en el chequeo de abajo.
        </p>
      )}

      <section className="space-y-1 pt-1">
        <h2 className="text-sm font-semibold text-neutral-700">
          Chequeo: diferencias y overbookings
        </h2>
        <p className="text-xs text-neutral-500">
          Cruza los calendarios de arriba contra Alquileres Detalle. Apretá el botón para comparar.
        </p>
        <CalendarDiff />
      </section>

      <CalendarSources sources={sources} />
    </div>
  );
}
