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
  if (!reservationId) return { ok: false, error: "Falta la reserva" };
  if (!date) return { ok: false, error: "Falta la fecha" };

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
      await tx`
        INSERT INTO transactions
          (kind, date, description, amount_usd, holder, notes, cabin,
           payment_method_raw, payment_method, reservation_id, source_sheet)
        VALUES ('ingreso', ${date}, ${r.guest_name}, ${line.amount}, ${line.holder},
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

/** Registrar que un holder entregó plata (baja su contador). */
export async function addEntrega(formData: FormData): Promise<ActionResult> {
  const date = String(formData.get("date") ?? "");
  const holder = String(formData.get("holder") ?? "").trim();
  const amount = Number(formData.get("amount_usd"));
  const notes = String(formData.get("notes") ?? "").trim();

  if (!date) return { ok: false, error: "Falta la fecha" };
  if (!holder) return { ok: false, error: "Falta quién entrega" };
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, error: "Monto inválido" };

  await sql`
    INSERT INTO entregas (date, holder, amount_usd, notes)
    VALUES (${date}, ${holder}, ${amount}, ${notes || null})`;
  revalidate();
  return { ok: true };
}
