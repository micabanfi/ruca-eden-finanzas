"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import type { ActionResult } from "@/actions/transactions";

function revalidate() {
  revalidatePath("/ingresos-egresos");
  revalidatePath("/pagos-fijos");
  revalidatePath("/resumen");
}

/** Cobrar una reserva: crea 1-2 ingresos (seña/resto, cada uno con su holder)
 * vinculados a la reserva y la marca cobrada. */
export async function cobrarReserva(formData: FormData): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "").trim();
  // Una sola moneda por cobro (las líneas seña/resto la comparten).
  const currency = String(formData.get("currency") ?? "USD").trim() === "ARS" ? "ARS" : "USD";
  const blueRate = Number(formData.get("blue_rate"));
  if (!reservationId) return { ok: false, error: "Falta la reserva" };
  if (!date) return { ok: false, error: "Falta la fecha" };
  if (currency === "ARS" && (!Number.isFinite(blueRate) || blueRate <= 0))
    return { ok: false, error: "Falta el valor del dólar blue" };

  const lines: { amount: number; holder: string | null }[] = [];
  for (const i of [1, 2]) {
    const amount = Number(formData.get(`amount_${i}`));
    const holder = String(formData.get(`holder_${i}`) ?? "").trim();
    if (Number.isFinite(amount) && amount > 0) lines.push({ amount, holder: holder || null });
  }
  if (lines.length === 0) return { ok: false, error: "Falta el monto" };

  const [r] = await sql<{ guest_name: string | null; cabin: string | null }[]>`
    SELECT guest_name, cabin FROM reservations WHERE id = ${reservationId}`;
  if (!r) return { ok: false, error: "Reserva no encontrada" };

  await sql.begin(async (tx) => {
    for (const [idx, line] of lines.entries()) {
      // En pesos: el monto cargado es ARS y el USD-equiv se calcula con el blue.
      const amountUsd = currency === "ARS" ? line.amount / blueRate : line.amount;
      const amountArs = currency === "ARS" ? line.amount : null;
      await tx`
        INSERT INTO transactions
          (kind, date, description, amount_usd, amount_ars, blue_rate, currency,
           holder, notes, cabin, payment_method_raw, payment_method,
           reservation_id, source_sheet)
        VALUES ('ingreso', ${date}, ${r.guest_name}, ${amountUsd}, ${amountArs},
                ${currency === "ARS" ? blueRate : null}, ${currency}, ${line.holder},
                ${idx === 0 && notes ? notes : null}, ${r.cabin},
                ${paymentMethod || null}, ${paymentMethod || null},
                ${reservationId}, 'app')`;
    }
    await tx`UPDATE reservations SET collected = 1 WHERE id = ${reservationId}`;
    await tx`INSERT INTO res_cobradas (reservation_id) VALUES (${reservationId})
             ON CONFLICT DO NOTHING`;
  });
  revalidate();
  return { ok: true };
}

/** Vincular una reserva con un ingreso ya cargado (evita duplicar el cobro). */
export async function vincularCobro(
  reservationId: string,
  txId: string,
): Promise<ActionResult> {
  await sql.begin(async (tx) => {
    const [t] = await tx<{ source_sheet: string; source_row: number | null }[]>`
      UPDATE transactions SET reservation_id = ${reservationId}
      WHERE id = ${txId} RETURNING source_sheet, source_row`;
    if (!t) throw new Error("Ingreso no encontrado");
    // los ingresos de la planilla se recargan en cada push: persistir el vínculo
    if (t.source_sheet !== "app" && t.source_row !== null) {
      await tx`
        INSERT INTO tx_links (reservation_id, source_sheet, source_row)
        VALUES (${reservationId}, ${t.source_sheet}, ${t.source_row})
        ON CONFLICT (source_sheet, source_row)
        DO UPDATE SET reservation_id = EXCLUDED.reservation_id`;
    }
    await tx`UPDATE reservations SET collected = 1 WHERE id = ${reservationId}`;
    await tx`INSERT INTO res_cobradas (reservation_id) VALUES (${reservationId})
             ON CONFLICT DO NOTHING`;
  });
  revalidate();
  return { ok: true };
}

/** Marcar cobrada sin crear ingreso (cuando ya estaba cargado de otra forma). */
export async function marcarCobrada(reservationId: string): Promise<ActionResult> {
  await sql.begin(async (tx) => {
    await tx`UPDATE reservations SET collected = 1 WHERE id = ${reservationId}`;
    await tx`INSERT INTO res_cobradas (reservation_id) VALUES (${reservationId})
             ON CONFLICT DO NOTHING`;
  });
  revalidate();
  return { ok: true };
}

/** Marcar una reserva como invitación: nunca se cobra, sale de pendientes. */
export async function marcarInvitada(reservationId: string): Promise<ActionResult> {
  await sql`INSERT INTO res_invitaciones (reservation_id) VALUES (${reservationId})
            ON CONFLICT DO NOTHING`;
  revalidatePath("/alquileres");
  revalidate();
  return { ok: true };
}

/** Parsea moneda + monto de una entrega. En pesos usa amount_ars (+ blue
 *  opcional para el USD-equiv); en USD usa amount_usd. */
function parseEntregaAmounts(formData: FormData):
  | { ok: true; currency: string; amountUsd: number | null; amountArs: number | null }
  | { ok: false; error: string } {
  const currency = String(formData.get("currency") ?? "USD").trim() === "ARS" ? "ARS" : "USD";
  if (currency === "ARS") {
    const amountArs = Number(formData.get("amount_ars"));
    if (!Number.isFinite(amountArs) || amountArs <= 0)
      return { ok: false, error: "Monto inválido" };
    const blue = Number(formData.get("blue_rate"));
    const amountUsd = Number.isFinite(blue) && blue > 0 ? amountArs / blue : null;
    return { ok: true, currency, amountUsd, amountArs };
  }
  const amountUsd = Number(formData.get("amount_usd"));
  if (!Number.isFinite(amountUsd) || amountUsd <= 0)
    return { ok: false, error: "Monto inválido" };
  return { ok: true, currency, amountUsd, amountArs: null };
}

/** Registrar que un holder entregó plata (baja su contador). Puede ir atada a un
 *  cobro puntual (transaction_id) o ser una entrega suelta. Moneda USD o pesos. */
export async function addEntrega(formData: FormData): Promise<ActionResult> {
  const date = String(formData.get("date") ?? "");
  const holder = String(formData.get("holder") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const transactionId = String(formData.get("transaction_id") ?? "").trim();

  if (!date) return { ok: false, error: "Falta la fecha" };
  if (!holder) return { ok: false, error: "Falta quién entrega" };
  const m = parseEntregaAmounts(formData);
  if (!m.ok) return m;

  await sql`
    INSERT INTO entregas (date, holder, amount_usd, amount_ars, currency, transaction_id, notes)
    VALUES (${date}, ${holder}, ${m.amountUsd}, ${m.amountArs}, ${m.currency},
            ${transactionId || null}, ${notes || null})`;
  revalidate();
  return { ok: true };
}

/** Editar una entrega ya registrada (desde el popup del "+"). */
export async function updateEntrega(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const holder = String(formData.get("holder") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!id) return { ok: false, error: "Falta el id" };
  if (!date) return { ok: false, error: "Falta la fecha" };
  if (!holder) return { ok: false, error: "Falta quién entrega" };
  const m = parseEntregaAmounts(formData);
  if (!m.ok) return m;

  await sql`
    UPDATE entregas
    SET date = ${date}, holder = ${holder}, amount_usd = ${m.amountUsd},
        amount_ars = ${m.amountArs}, currency = ${m.currency}, notes = ${notes || null}
    WHERE id = ${id}`;
  revalidate();
  return { ok: true };
}

/** Deshacer una entrega (soft-delete; nunca se borra la fila). Reversible. */
export async function cancelEntrega(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id" };
  await sql`UPDATE entregas SET cancelled_at = now() WHERE id = ${id}`;
  revalidate();
  return { ok: true };
}

/** Restaurar una entrega previamente deshecha. */
export async function restoreEntrega(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id" };
  await sql`UPDATE entregas SET cancelled_at = NULL WHERE id = ${id}`;
  revalidate();
  return { ok: true };
}
