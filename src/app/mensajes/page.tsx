import MensajesTabs from "@/components/MensajesTabs";
import { readWithRetry } from "@/lib/db";
import { getInvitadaIds, getReservations } from "@/db/reservations";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function MensajesPage() {
  const [reservations, invitadaIds] = await Promise.all([
    readWithRetry(() => getReservations()),
    readWithRetry(() => getInvitadaIds()),
  ]);
  return <MensajesTabs reservations={reservations} invitadaIds={invitadaIds} />;
}
