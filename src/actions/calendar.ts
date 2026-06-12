"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import type { ActionResult } from "@/actions/transactions";
import { getCalendarSources } from "@/db/calendar";
import { getReservations } from "@/db/reservations";
import { CABINS } from "@/lib/catalog";
import { computeDiff, loadFeeds, type AppRes, type DiffResult } from "@/lib/ical";

// ── ABM de fuentes (soft-delete con active, nunca DELETE) ───────────────────

export async function addCalendarSource(formData: FormData): Promise<ActionResult> {
  const kind = String(formData.get("kind") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const cabin = String(formData.get("cabin") ?? "").trim();
  const icsUrl = String(formData.get("ics_url") ?? "").trim();

  if (kind !== "google" && kind !== "airbnb")
    return { ok: false, error: "Tipo inválido (google/airbnb)" };
  if (!/^https:\/\//i.test(icsUrl))
    return { ok: false, error: "La URL iCal debe empezar con https://" };
  if (kind === "airbnb") {
    if (!cabin || cabin === "TODAS" || !CABINS.includes(cabin))
      return { ok: false, error: "Para Airbnb elegí una cabaña" };
  }
  const cabinVal = kind === "airbnb" ? cabin : null;

  await sql`
    INSERT INTO calendar_sources (kind, label, cabin, ics_url)
    VALUES (${kind}, ${label || null}, ${cabinVal}, ${icsUrl})`;
  revalidatePath("/calendario");
  return { ok: true };
}

export async function deactivateCalendarSource(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id" };
  await sql`UPDATE calendar_sources SET active = false WHERE id = ${id}`;
  revalidatePath("/calendario");
  return { ok: true };
}

export async function reactivateCalendarSource(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id" };
  await sql`UPDATE calendar_sources SET active = true WHERE id = ${id}`;
  revalidatePath("/calendario");
  return { ok: true };
}

// ── chequeo de diferencias / overbook ───────────────────────────────────────

export type DiffResponse =
  | { ok: true; result: DiffResult }
  | { ok: false; error: string };

/** Baja los feeds activos (Google + Airbnb), los parsea y los compara contra
 *  las reservas de la app. No escribe nada en la base. */
export async function runCalendarDiff(force = false): Promise<DiffResponse> {
  try {
    const [sources, reservations] = await Promise.all([
      getCalendarSources(),
      getReservations(),
    ]);
    const active = sources.filter((s) => s.active);
    if (active.length === 0)
      return { ok: false, error: "No hay fuentes de calendario cargadas todavía." };

    const { events: ext, feedErrors } = await loadFeeds(active, force);

    const appRes: AppRes[] = reservations
      .filter((r) => !r.cancelled_at)
      .map((r) => ({
        id: r.id,
        checkin: r.checkin,
        checkout: r.checkout,
        cabin: r.cabin,
        platform: r.platform,
        guest_name: r.guest_name,
      }));

    const generatedAt = new Date().toISOString();
    return { ok: true, result: computeDiff(appRes, ext, feedErrors, generatedAt) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
  }
}
