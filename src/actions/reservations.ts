"use server";

import { revalidatePath } from "next/cache";
import { readWithRetry, sql, writeAction } from "@/lib/db";
import type { ActionResult } from "@/actions/transactions";

export async function addReservation(formData: FormData): Promise<ActionResult> {
  const checkin = String(formData.get("checkin") ?? "");
  const checkout = String(formData.get("checkout") ?? "");
  const guestName = String(formData.get("guest_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const cabin = String(formData.get("cabin") ?? "").trim();
  const platform = String(formData.get("platform") ?? "").trim();
  const pricePerNightIn = Number(formData.get("price_per_night"));
  const totalIn = Number(formData.get("total_usd"));
  const deposit = Number(formData.get("deposit_amount"));
  const depositCurrency = String(formData.get("deposit_currency") ?? "USD").trim() || "USD";
  const depositAccount = String(formData.get("deposit_account") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "").trim();

  if (!checkin || !checkout) return { ok: false, error: "Faltan fechas" };
  const nights = Math.round(
    (Date.parse(checkout) - Date.parse(checkin)) / 86_400_000,
  );
  if (nights <= 0) return { ok: false, error: "Checkout debe ser posterior al checkin" };
  if (!cabin) return { ok: false, error: "Falta la cabaña" };

  // se puede cargar precio x noche O total: el que falte se deriva
  let pricePerNight =
    Number.isFinite(pricePerNightIn) && pricePerNightIn > 0 ? pricePerNightIn : null;
  let total = Number.isFinite(totalIn) && totalIn > 0 ? totalIn : null;
  if (!pricePerNight && total) pricePerNight = Math.round((total / nights) * 100) / 100;
  if (!total && pricePerNight) total = pricePerNight * nights;
  if (!pricePerNight || !total)
    return { ok: false, error: "Cargá el precio por noche o el total" };

  const depAmount = Number.isFinite(deposit) && deposit > 0 ? deposit : null;
  // Seña en pesos: va a deposit_ars y NO toca el saldo USD (cuentas separadas).
  // Seña en USD: deposit_usd como siempre y descuenta del restante.
  const depUsd = depAmount !== null && depositCurrency !== "ARS" ? depAmount : null;
  const depArs = depAmount !== null && depositCurrency === "ARS" ? depAmount : null;

  const res = await writeAction((db) =>
    db.begin(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO reservations
          (checkin, checkout, guest_name, phone, cabin, platform, nights,
           price_per_night, total_usd, deposit_usd, deposit_ars, deposit_account,
           deposit_currency, balance_usd, payment_method, collected,
           -- notes arranca vacío: es la nota libre de Mimi (el "por qué" de la
           -- reserva), no metadata. La procedencia ya la marca source_row (NULL
           -- = creada en la app, no importada de la planilla).
           notes)
        VALUES (${checkin}, ${checkout}, ${guestName || null}, ${phone || null},
                ${cabin}, ${platform || null}, ${nights}, ${pricePerNight},
                ${total}, ${depUsd}, ${depArs}, ${depositAccount || null},
                ${depositCurrency}, ${depUsd ? total - depUsd : null},
                ${paymentMethod || null}, 0, NULL)
        RETURNING id`;
      if (cabin !== "TODAS") {
        await tx`
          INSERT INTO reservation_nights (reservation_id, night, cabin, rate_usd)
          SELECT ${row.id}, d::date, ${cabin}, ${total / nights}
          FROM generate_series(${checkin}::date, ${checkout}::date - 1, '1 day') AS d`;
      }
    }),
  );
  if (!res.ok) return res;

  revalidatePath("/alquileres");
  revalidatePath("/ingresos-egresos"); // la seña en Santander cambia el saldo de la cuenta
  return { ok: true };
}

/** Cobro registrado al cancelar tarde: seña/penalidad que igual se cobra. */
export interface CancelCharge {
  amount: number;
  holder: string | null;
  payment_method: string | null;
  date: string;
  notes: string | null;
}

/** Cancelar una reserva que se cayó. NO se borra (preservamos historial y
 *  trazabilidad): solo se marca `cancelled_at`, deja de aparecer en el listado
 *  principal y pasa a la sección "Canceladas". Reversible con restoreReservation.
 *  Las noches se borran para que no cuenten en ocupación/alertas; se regeneran
 *  si la reserva se restaura.
 *
 *  Si `charge` viene con monto > 0, el huésped canceló tarde y se le cobró igual
 *  (seña o penalidad): se crea un ingreso vinculado a la reserva y se marca
 *  cobrada. Ese ingreso queda resaltado en rojo en "Ingresos Inquilinos" porque
 *  está ligado a una reserva cancelada (ver getTransactionsByYear). */
export async function cancelReservation(
  id: string,
  charge?: CancelCharge | null,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id" };
  const cobro =
    charge && Number.isFinite(charge.amount) && charge.amount > 0 ? charge : null;
  if (charge && !cobro) return { ok: false, error: "Monto cobrado inválido" };

  const res = await writeAction((db) =>
    db.begin(async (tx) => {
      await tx`UPDATE reservations SET cancelled_at = now() WHERE id = ${id}`;
      await tx`DELETE FROM reservation_nights WHERE reservation_id = ${id}`;

      if (cobro) {
        const [r] = await tx<{ guest_name: string | null; cabin: string | null }[]>`
          SELECT guest_name, cabin FROM reservations WHERE id = ${id}`;
        await tx`
          INSERT INTO transactions
            (kind, date, description, amount_usd, holder, notes, cabin,
             payment_method_raw, payment_method, reservation_id, source_sheet)
          VALUES ('ingreso', ${cobro.date}, ${r?.guest_name ?? null}, ${cobro.amount},
                  ${cobro.holder}, ${cobro.notes}, ${r?.cabin ?? null},
                  ${cobro.payment_method}, ${cobro.payment_method}, ${id}, 'app')`;
        await tx`UPDATE reservations SET collected = 1 WHERE id = ${id}`;
        await tx`INSERT INTO res_cobradas (reservation_id) VALUES (${id})
                 ON CONFLICT DO NOTHING`;
      }
    }),
  );
  if (!res.ok) return res;

  revalidatePath("/alquileres");
  if (cobro) {
    revalidatePath("/ingresos-egresos");
    revalidatePath("/resumen");
  }
  return { ok: true };
}

/** Reactivar una reserva cancelada: limpia `cancelled_at` y regenera las noches. */
export async function restoreReservation(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id" };
  const res = await writeAction((db) =>
    db.begin(async (tx) => {
      const [r] = await tx<
        { checkin: string; checkout: string; cabin: string | null; total_usd: string | null; nights: number | null }[]
      >`
        UPDATE reservations SET cancelled_at = NULL WHERE id = ${id}
        RETURNING to_char(checkin,'YYYY-MM-DD') AS checkin,
                  to_char(checkout,'YYYY-MM-DD') AS checkout, cabin, total_usd, nights`;
      if (r && r.cabin && r.cabin !== "TODAS") {
        const total = r.total_usd === null ? null : Number(r.total_usd);
        await tx`
          INSERT INTO reservation_nights (reservation_id, night, cabin, rate_usd)
          SELECT ${id}, d::date, ${r.cabin},
                 ${total !== null && r.nights ? total / r.nights : null}
          FROM generate_series(${r.checkin}::date, ${r.checkout}::date - 1, '1 day') AS d`;
      }
    }),
  );
  if (!res.ok) return res;
  revalidatePath("/alquileres");
  return { ok: true };
}

// --- inline cell editing -----------------------------------------------------

const TEXT_FIELDS = new Set([
  "guest_name", "phone", "platform", "payment_method",
  "deposit_account", "deposit_currency", "notes",
]);
// numéricos que se guardan tal cual, sin recalcular total/restante (la seña en
// pesos no toca el saldo USD de la reserva — son cuentas separadas).
const SIMPLE_NUM_FIELDS = new Set(["deposit_ars"]);
const RECOMPUTE_FIELDS = new Set([
  "checkin", "checkout", "nights", "cabin",
  "price_per_night", "total_usd", "deposit_usd", "balance_usd",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const diffDays = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const addDays = (d: string, n: number) =>
  new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Edit one cell; derived fields (noches/total/restante) se recalculan como en la planilla. */
export async function updateReservation(
  id: string,
  field: string,
  value: string,
): Promise<ActionResult> {
  const v = value.trim();

  // free-text fields: direct single-column update
  if (TEXT_FIELDS.has(field)) {
    const res = await writeAction(
      (db) => db`UPDATE reservations SET ${db(field)} = ${v || null} WHERE id = ${id}`,
    );
    if (!res.ok) return res;
    revalidatePath("/alquileres");
    revalidatePath("/ingresos-egresos");
    return { ok: true };
  }
  // seña en pesos: se guarda sin recalcular el saldo USD
  if (SIMPLE_NUM_FIELDS.has(field)) {
    const n = v === "" ? null : Number(v);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return { ok: false, error: "Monto inválido" };
    const res = await writeAction(
      (db) => db`UPDATE reservations SET ${db(field)} = ${n} WHERE id = ${id}`,
    );
    if (!res.ok) return res;
    revalidatePath("/alquileres");
    revalidatePath("/ingresos-egresos");
    return { ok: true };
  }
  if (!RECOMPUTE_FIELDS.has(field)) return { ok: false, error: `Campo no editable: ${field}` };

  const [r] = await readWithRetry(
    () => sql<
      {
        checkin: string; checkout: string; cabin: string | null;
        price_per_night: string | null; total_usd: string | null;
        deposit_usd: string | null; balance_usd: string | null;
      }[]
    >`
      SELECT to_char(checkin,'YYYY-MM-DD') AS checkin,
             to_char(checkout,'YYYY-MM-DD') AS checkout,
             cabin, price_per_night, total_usd, deposit_usd, balance_usd
      FROM reservations WHERE id = ${id}`,
  );
  if (!r) return { ok: false, error: "Reserva no encontrada" };

  let checkin = r.checkin;
  let checkout = r.checkout;
  let cabin = r.cabin;
  let ppn = r.price_per_night === null ? null : Number(r.price_per_night);
  let dep = r.deposit_usd === null ? null : Number(r.deposit_usd);
  let total = r.total_usd === null ? null : Number(r.total_usd);
  let bal = r.balance_usd === null ? null : Number(r.balance_usd);
  const num = Number(v);

  switch (field) {
    case "checkin":
      if (!DATE_RE.test(v)) return { ok: false, error: "Fecha inválida" };
      checkin = v;
      break;
    case "checkout":
      if (!DATE_RE.test(v)) return { ok: false, error: "Fecha inválida" };
      checkout = v;
      break;
    case "nights": {
      const n = Math.round(num);
      if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "Noches inválidas" };
      checkout = addDays(checkin, n); // mover checkout, como en la planilla
      break;
    }
    case "cabin":
      cabin = v || null;
      break;
    case "price_per_night":
      if (!Number.isFinite(num) || num < 0) return { ok: false, error: "Precio inválido" };
      ppn = num || null;
      break;
    case "deposit_usd":
      if (v === "") dep = null;
      else if (!Number.isFinite(num) || num < 0) return { ok: false, error: "Seña inválida" };
      else dep = num;
      break;
    // total y restante se manejan abajo, una vez conocidas las noches
  }

  const nights = diffDays(checkin, checkout);
  if (nights <= 0) return { ok: false, error: "Checkout debe ser posterior al checkin" };

  if (field === "total_usd") {
    if (!Number.isFinite(num) || num < 0) return { ok: false, error: "Total inválido" };
    total = num;
    ppn = round2(num / nights); // total manda: ajusta precio x noche
  } else if (ppn !== null) {
    total = round2(ppn * nights);
  }

  if (field === "balance_usd") {
    if (!Number.isFinite(num) || num < 0) return { ok: false, error: "Restante inválido" };
    bal = num;
    if (total !== null) dep = round2(total - num); // restante manda: ajusta seña
  } else if (total !== null) {
    bal = round2(total - (dep ?? 0));
  }

  const res = await writeAction((db) =>
    db.begin(async (tx) => {
      await tx`
        UPDATE reservations
        SET checkin = ${checkin}, checkout = ${checkout}, nights = ${nights},
            cabin = ${cabin}, price_per_night = ${ppn}, total_usd = ${total},
            deposit_usd = ${dep}, balance_usd = ${bal}
        WHERE id = ${id}`;
      // regenerar las noches (alimentan alertas de solapamiento y ocupación)
      await tx`DELETE FROM reservation_nights WHERE reservation_id = ${id}`;
      if (cabin && cabin !== "TODAS") {
        await tx`
          INSERT INTO reservation_nights (reservation_id, night, cabin, rate_usd)
          SELECT ${id}, d::date, ${cabin}, ${total !== null ? round2(total / nights) : null}
          FROM generate_series(${checkin}::date, ${checkout}::date - 1, '1 day') AS d`;
      }
    }),
  );
  if (!res.ok) return res;

  revalidatePath("/alquileres");
  revalidatePath("/ingresos-egresos"); // editar la seña USD impacta el saldo Santander
  return { ok: true };
}
