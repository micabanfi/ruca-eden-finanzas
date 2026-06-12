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
