"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import type { ActionResult } from "@/actions/transactions";

function revalidate() {
  revalidatePath("/ingresos-egresos");
}

/** Saldo inicial de la cuenta (fila kind='apertura'). Mimi arranca de un número
 *  fijo en pesos y USD y cuenta desde ahí. Upsert: si ya existe, lo actualiza. */
export async function setSaldoInicial(formData: FormData): Promise<ActionResult> {
  const date = String(formData.get("date") ?? "");
  const ars = Number(formData.get("delta_ars") ?? 0);
  const usd = Number(formData.get("delta_usd") ?? 0);
  if (!date) return { ok: false, error: "Falta la fecha" };
  if (!Number.isFinite(ars) || !Number.isFinite(usd))
    return { ok: false, error: "Montos inválidos" };

  await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      SELECT id FROM cuenta_movimientos
      WHERE account = 'Santander' AND kind = 'apertura' AND cancelled_at IS NULL
      ORDER BY id LIMIT 1`;
    if (row) {
      await tx`
        UPDATE cuenta_movimientos
        SET date = ${date}, delta_ars = ${ars}, delta_usd = ${usd}
        WHERE id = ${row.id}`;
    } else {
      await tx`
        INSERT INTO cuenta_movimientos (date, account, kind, delta_ars, delta_usd, description)
        VALUES (${date}, 'Santander', 'apertura', ${ars}, ${usd}, 'Saldo inicial')`;
    }
  });
  revalidate();
  return { ok: true };
}

/** Ingreso o egreso manual de la cuenta (lo que no es seña/egreso del negocio). */
export async function addMovimiento(formData: FormData): Promise<ActionResult> {
  const date = String(formData.get("date") ?? "");
  const kind = String(formData.get("kind") ?? "").trim(); // 'ingreso' | 'egreso'
  const ars = Number(formData.get("amount_ars") ?? 0) || 0;
  const usd = Number(formData.get("amount_usd") ?? 0) || 0;
  const description = String(formData.get("description") ?? "").trim();

  if (!date) return { ok: false, error: "Falta la fecha" };
  if (kind !== "ingreso" && kind !== "egreso")
    return { ok: false, error: "Tipo inválido" };
  if (ars <= 0 && usd <= 0) return { ok: false, error: "Cargá un monto en pesos o USD" };

  const sign = kind === "egreso" ? -1 : 1;
  await sql`
    INSERT INTO cuenta_movimientos (date, account, kind, delta_ars, delta_usd, description)
    VALUES (${date}, 'Santander', ${kind}, ${sign * ars}, ${sign * usd},
            ${description || null})`;
  revalidate();
  return { ok: true };
}

/** Compra/venta de USD, libre (sin dólar blue). "Vendí X USD y me dieron Y pesos"
 *  → USD baja, pesos sube. "Compré X USD pagando Y pesos" → al revés. */
export async function registrarFx(formData: FormData): Promise<ActionResult> {
  const date = String(formData.get("date") ?? "");
  const dir = String(formData.get("direction") ?? "").trim(); // 'venta' (vendo USD) | 'compra'
  const usd = Number(formData.get("usd") ?? 0);
  const ars = Number(formData.get("ars") ?? 0);

  if (!date) return { ok: false, error: "Falta la fecha" };
  if (dir !== "venta" && dir !== "compra") return { ok: false, error: "Elegí compra o venta" };
  if (!Number.isFinite(usd) || usd <= 0) return { ok: false, error: "USD inválido" };
  if (!Number.isFinite(ars) || ars <= 0) return { ok: false, error: "Pesos inválidos" };

  // venta de USD: USD sale (-), pesos entran (+). compra: al revés.
  const deltaUsd = dir === "venta" ? -usd : usd;
  const deltaArs = dir === "venta" ? ars : -ars;
  const desc =
    dir === "venta"
      ? `Vendí USD$${usd} → $${ars}`
      : `Compré USD$${usd} pagando $${ars}`;
  await sql`
    INSERT INTO cuenta_movimientos (date, account, kind, delta_ars, delta_usd, description)
    VALUES (${date}, 'Santander', 'fx', ${deltaArs}, ${deltaUsd}, ${desc})`;
  revalidate();
  return { ok: true };
}

/** Soft-delete de un movimiento de la cuenta (nunca DELETE). Reversible. */
export async function cancelarMovimiento(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id" };
  await sql`UPDATE cuenta_movimientos SET cancelled_at = now() WHERE id = ${id}`;
  revalidate();
  return { ok: true };
}

export async function restaurarMovimiento(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id" };
  await sql`UPDATE cuenta_movimientos SET cancelled_at = NULL WHERE id = ${id}`;
  revalidate();
  return { ok: true };
}
