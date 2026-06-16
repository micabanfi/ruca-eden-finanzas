"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidate() {
  revalidatePath("/ingresos-egresos");
  revalidatePath("/pagos-fijos");
  revalidatePath("/resumen");
}

export async function addEgreso(formData: FormData): Promise<ActionResult> {
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const amountArs = Number(formData.get("amount_ars"));
  const blueRate = Number(formData.get("blue_rate"));
  const category = String(formData.get("category") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!date) return { ok: false, error: "Falta la fecha" };
  if (!Number.isFinite(amountArs) || amountArs <= 0)
    return { ok: false, error: "Precio ARS inválido" };
  if (!Number.isFinite(blueRate) || blueRate <= 0)
    return { ok: false, error: "Valor blue inválido" };
  if (!category) return { ok: false, error: "Falta el tipo de pago" };

  const amountUsd = amountArs / blueRate;
  await sql`
    INSERT INTO transactions
      (kind, date, description, amount_ars, amount_usd, blue_rate,
       category_raw, category, payment_method_raw, payment_method, notes, source_sheet)
    VALUES ('egreso', ${date}, ${description || null}, ${amountArs}, ${amountUsd},
            ${blueRate}, ${category}, ${category}, ${paymentMethod || null},
            ${paymentMethod || null}, ${notes || null}, 'app')`;
  revalidate();
  return { ok: true };
}

// --- inline cell editing (egresos) ------------------------------------------

const TX_TEXT_FIELDS = new Set(["description", "payment_method", "category"]);
const TX_NUM_FIELDS = new Set(["amount_ars", "blue_rate"]);
const TX_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Edita una celda de un egreso. El precio blue (amount_usd) se recalcula solo
 *  cuando cambia el precio en ARS o el valor del dólar blue, como en la planilla
 *  (amount_usd = amount_ars / blue_rate). */
export async function updateTransaction(
  id: string,
  field: string,
  value: string,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id" };
  const v = value.trim();

  if (field === "date") {
    if (!TX_DATE_RE.test(v)) return { ok: false, error: "Fecha inválida" };
    await sql`UPDATE transactions SET date = ${v} WHERE id = ${id}`;
    revalidate();
    return { ok: true };
  }

  // texto libre: category y payment_method espejan su columna *_raw
  if (TX_TEXT_FIELDS.has(field)) {
    if (field === "category") {
      await sql`UPDATE transactions
                SET category = ${v || null}, category_raw = ${v || null}
                WHERE id = ${id}`;
    } else if (field === "payment_method") {
      await sql`UPDATE transactions
                SET payment_method = ${v || null}, payment_method_raw = ${v || null}
                WHERE id = ${id}`;
    } else {
      await sql`UPDATE transactions SET description = ${v || null} WHERE id = ${id}`;
    }
    revalidate();
    return { ok: true };
  }

  // numéricos: recalcular el precio blue (USD) a partir de ARS y dólar blue
  if (TX_NUM_FIELDS.has(field)) {
    const num = Number(v);
    if (!Number.isFinite(num) || num <= 0)
      return { ok: false, error: field === "amount_ars" ? "Precio inválido" : "Valor blue inválido" };
    const [t] = await sql<{ amount_ars: string | null; blue_rate: string | null }[]>`
      SELECT amount_ars, blue_rate FROM transactions WHERE id = ${id}`;
    if (!t) return { ok: false, error: "Egreso no encontrado" };
    const ars = field === "amount_ars" ? num : t.amount_ars === null ? null : Number(t.amount_ars);
    const blue = field === "blue_rate" ? num : t.blue_rate === null ? null : Number(t.blue_rate);
    const usd = ars !== null && blue && blue > 0 ? ars / blue : null;
    await sql`
      UPDATE transactions
      SET amount_ars = ${ars}, blue_rate = ${blue}, amount_usd = ${usd}
      WHERE id = ${id}`;
    revalidate();
    return { ok: true };
  }

  return { ok: false, error: `Campo no editable: ${field}` };
}

export async function addIngreso(formData: FormData): Promise<ActionResult> {
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const amountUsd = Number(formData.get("amount_usd"));
  const paymentMethod = String(formData.get("payment_method") ?? "").trim();
  const holder = String(formData.get("holder") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!date) return { ok: false, error: "Falta la fecha" };
  if (!Number.isFinite(amountUsd) || amountUsd <= 0)
    return { ok: false, error: "Precio USD inválido" };

  await sql`
    INSERT INTO transactions
      (kind, date, description, amount_usd, payment_method_raw, payment_method,
       holder, notes, source_sheet)
    VALUES ('ingreso', ${date}, ${description || null}, ${amountUsd},
            ${paymentMethod || null}, ${paymentMethod || null},
            ${holder || null}, ${notes || null}, 'app')`;
  revalidate();
  return { ok: true };
}
