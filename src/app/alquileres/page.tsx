import ReservationsTable from "@/components/ReservationsTable";
import ReservationForm from "@/components/forms/ReservationForm";
import { getBookingAlerts, getInvitadaIds, getReservations } from "@/db/reservations";
import { readWithRetry } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // serverless: cortar a los 30s, no a los 300

export default async function AlquileresPage() {
  const [reservations, alerts, invitadaIds] = await Promise.all([
    readWithRetry(() => getReservations()),
    readWithRetry(() => getBookingAlerts()),
    readWithRetry(() => getInvitadaIds()),
  ]);
  const invitadas = new Set(invitadaIds);
  const activas = reservations.filter((r) => !r.cancelled_at);
  const canceladas = reservations.filter((r) => r.cancelled_at);
  const normales = activas.filter((r) => !invitadas.has(r.id));
  const invitaciones = activas.filter((r) => invitadas.has(r.id));

  return (
    <div className="space-y-2">
      <ReservationForm />
      <p className="text-xs text-neutral-500">
        {normales.length} reservas · filas celestes = futuras · alertas:
        solapamientos y check-in/out el mismo día (Ruca y Ruca Chico = misma casa)
      </p>
      <ReservationsTable reservations={normales} alerts={alerts} scrollToToday />

      {invitaciones.length > 0 && (
        <section className="pt-2">
          <h2 className="mb-1 text-sm font-semibold text-neutral-700">
            🎁 Invitaciones · {invitaciones.length} · no se cobran
          </h2>
          <ReservationsTable reservations={invitaciones} alerts={alerts} />
        </section>
      )}

      {canceladas.length > 0 && (
        <section className="pt-2">
          <h2 className="mb-1 text-sm font-semibold text-neutral-700">
            ✕ Canceladas · {canceladas.length} · se cayeron, no se borran (historial)
          </h2>
          <ReservationsTable reservations={canceladas} alerts={alerts} mode="cancelled" />
        </section>
      )}
    </div>
  );
}
