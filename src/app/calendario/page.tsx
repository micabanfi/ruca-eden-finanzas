import CalendarDiff from "@/components/CalendarDiff";
import CalendarMonthNav from "@/components/CalendarMonthNav";
import CalendarSources from "@/components/CalendarSources";
import CalendarTimeline from "@/components/CalendarTimeline";
import { getCalendarSources, getReservationsForMonth } from "@/db/calendar";

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

  const [reservations, sources] = await Promise.all([
    getReservationsForMonth(mes),
    getCalendarSources(),
  ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CalendarMonthNav mes={mes} todayMes={todayMes} />
        <p className="text-xs text-neutral-500">
          filas = cabañas · barras por plataforma · hoy resaltado
        </p>
      </div>

      <CalendarTimeline reservations={reservations} mes={mes} todayYMD={todayYMD} />

      <section className="space-y-1 pt-1">
        <h2 className="text-sm font-semibold text-neutral-700">
          Chequeo: diferencias y overbookings
        </h2>
        <p className="text-xs text-neutral-500">
          Cruza tu Google Calendar y Airbnb contra Alquileres Detalle. Apretá el botón para comparar.
        </p>
        <CalendarDiff />
      </section>

      <CalendarSources sources={sources} />
    </div>
  );
}
