import { sql } from "@/lib/db";

export interface CalendarSource {
  id: string;
  kind: "google" | "airbnb";
  label: string | null;
  cabin: string | null;
  ics_url: string;
  active: boolean;
  created_at: string;
}

export async function getCalendarSources(): Promise<CalendarSource[]> {
  return sql<CalendarSource[]>`
    SELECT id, kind, label, cabin, ics_url, active,
           to_char(created_at,'YYYY-MM-DD') AS created_at
    FROM calendar_sources
    ORDER BY active DESC, kind, cabin NULLS FIRST, id`;
}

export interface MonthReservation {
  id: string;
  checkin: string;
  checkout: string;
  cabin: string | null;
  platform: string | null;
  guest_name: string | null;
}

/** Reservas activas que solapan el mes `mes` ('YYYY-MM'), para el timeline. */
export async function getReservationsForMonth(mes: string): Promise<MonthReservation[]> {
  const first = `${mes}-01`;
  return sql<MonthReservation[]>`
    SELECT id, to_char(checkin,'YYYY-MM-DD') AS checkin,
           to_char(checkout,'YYYY-MM-DD') AS checkout, cabin, platform, guest_name
    FROM reservations
    WHERE cancelled_at IS NULL AND cabin IS NOT NULL AND cabin <> 'TODAS'
      AND checkout > ${first}::date
      AND checkin < (${first}::date + INTERVAL '1 month')
    ORDER BY checkin, id`;
}
