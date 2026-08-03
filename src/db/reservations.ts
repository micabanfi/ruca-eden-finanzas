import { sql } from "@/lib/db";

export interface Reservation {
  id: string;
  checkin: string;
  checkout: string;
  guest_name: string | null;
  phone: string | null;
  cabin: string | null;
  platform: string | null;
  nights: number | null;
  price_per_night: string | null;
  total_usd: string | null;
  deposit_usd: string | null;
  deposit_ars: string | null;
  deposit_account: string | null;
  deposit_currency: string | null;
  balance_usd: string | null;
  payment_method: string | null;
  collected: number | null;
  who_has_money: string | null;
  notes: string | null;
  cancelled_at: string | null;
}

export interface BookingAlert {
  alerta: string;
  cabana: string;
  res_id_1: string;
  res_id_2: string;
}

export async function getReservations(): Promise<Reservation[]> {
  return sql<Reservation[]>`
    SELECT id, to_char(checkin,'YYYY-MM-DD') AS checkin,
           to_char(checkout,'YYYY-MM-DD') AS checkout,
           guest_name, phone, cabin, platform, nights, price_per_night,
           total_usd, deposit_usd, deposit_ars, deposit_account, deposit_currency,
           balance_usd, payment_method, collected,
           who_has_money, notes, to_char(cancelled_at,'YYYY-MM-DD') AS cancelled_at
    FROM reservations
    ORDER BY checkin, id`;
}

/** Solo las reservas vigentes (checkout de hoy en adelante, no canceladas).
 *
 *  Para el chequeo contra los calendarios no hace falta traer el histórico entero:
 *  `computeDiff` descarta de entrada todo lo que tenga `checkout < hoy`, así que
 *  filtrar en SQL da exactamente el mismo resultado leyendo una fracción de las
 *  filas. `hoy` se calcula en UTC para que coincida con el `today` que usa
 *  computeDiff (`new Date().toISOString().slice(0,10)`). */
export async function getCurrentReservations(): Promise<Reservation[]> {
  return sql<Reservation[]>`
    SELECT id, to_char(checkin,'YYYY-MM-DD') AS checkin,
           to_char(checkout,'YYYY-MM-DD') AS checkout,
           guest_name, phone, cabin, platform, nights, price_per_night,
           total_usd, deposit_usd, deposit_ars, deposit_account, deposit_currency,
           balance_usd, payment_method, collected,
           who_has_money, notes, to_char(cancelled_at,'YYYY-MM-DD') AS cancelled_at
    FROM reservations
    WHERE cancelled_at IS NULL
      AND checkout >= (now() AT TIME ZONE 'UTC')::date
    ORDER BY checkin, id`;
}

export async function getBookingAlerts(): Promise<BookingAlert[]> {
  return sql<BookingAlert[]>`
    SELECT alerta, cabana, res_id_1, res_id_2 FROM v_booking_alerts`;
}

/** ids de reservas que son invitaciones (no se cobran a propósito) */
export async function getInvitadaIds(): Promise<string[]> {
  const rows = await sql<{ reservation_id: string }[]>`
    SELECT reservation_id FROM res_invitaciones`;
  return rows.map((r) => r.reservation_id);
}
