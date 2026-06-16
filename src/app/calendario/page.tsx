import AirbnbReservations from "@/components/AirbnbReservations";
import CalendarDiff from "@/components/CalendarDiff";
import CalendarMonthNav from "@/components/CalendarMonthNav";
import CalendarSources from "@/components/CalendarSources";
import CalendarTimeline from "@/components/CalendarTimeline";
import { getCalendarSources } from "@/db/calendar";
import { getReservations } from "@/db/reservations";
import { readWithRetry } from "@/lib/db";
import { applyAirbnbNames, buildCalendar, eventsForMonth, loadFeeds } from "@/lib/ical";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; fresh?: string }>;
}) {
  const params = await searchParams;
  const todayYMD = new Date().toISOString().slice(0, 10);
  const todayMes = todayYMD.slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? (params.mes as string) : todayMes;
  const force = Boolean(params.fresh); // botón "↻ Refrescar": ignora el cache de 1h

  const sources = await readWithRetry(() => getCalendarSources());
  const active = sources.filter((s) => s.active);
  // El calendario se llena con lo que viene de los feeds (Google + Airbnb).
  const [{ events: rawEvents, feedErrors }, reservations] = await Promise.all([
    loadFeeds(active, force),
    readWithRetry(() => getReservations()),
  ]);

  // Reservas de la app (Alquileres Detalle), no canceladas.
  const appRes = reservations
    .filter((r) => !r.cancelled_at)
    .map((r) => ({
      id: r.id,
      checkin: r.checkin,
      checkout: r.checkout,
      cabin: r.cabin,
      platform: r.platform,
      guest_name: r.guest_name,
      phone: r.phone,
    }));

  // El calendario de la app = Alquileres Detalle (no-Airbnb) + reservas del feed de
  // Airbnb (con nombre derivado). Google NO se dibuja: es la contraparte de comparación.
  const airbnbEvents = applyAirbnbNames(rawEvents, appRes).filter((e) => e.source === "airbnb");
  const calItems = buildCalendar(appRes, airbnbEvents);
  const monthItems = eventsForMonth(calItems, mes);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CalendarMonthNav mes={mes} todayMes={todayMes} />
        <p className="text-xs text-neutral-500">
          Alquileres Detalle + Airbnb · barras por plataforma · hoy resaltado · ⇄ = entra y sale el
          mismo día
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

      <CalendarTimeline items={monthItems} mes={mes} todayYMD={todayYMD} />

      <section className="space-y-1 pt-1">
        <h2 className="text-sm font-semibold text-neutral-700">
          Chequeo: diferencias y overbookings
        </h2>
        <p className="text-xs text-neutral-500">
          Cruza los calendarios de arriba contra Alquileres Detalle. Apretá el botón para comparar.
        </p>
        <CalendarDiff />
      </section>

      <AirbnbReservations events={airbnbEvents} />

      <CalendarSources sources={sources} />
    </div>
  );
}
