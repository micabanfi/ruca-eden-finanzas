// Parte ISOMÓRFICA de la lógica de calendarios: tipos y helpers puros que pueden
// importar TANTO el servidor COMO los componentes cliente ("use client").
//
// ⚠️ REGLA: este archivo NO puede importar `node-ical` ni nada de Node
// (`node:fs`, etc.). Todo eso vive en `ical.ts`, que es solo-servidor.
//
// Por qué existe la separación: `ical.ts` arranca con `import { parseICS } from
// "node-ical"`, que necesita `node:fs`. Si un componente cliente importa de ahí
// un VALOR (no un `import type`, que se borra al compilar), el bundle del browser
// intenta cargar `node:fs`, explota al evaluar el módulo y la página entera no
// hidrata → pantalla "This page couldn't load". El build NO lo detecta: falla
// recién en el navegador. Pasó con `DatosAlquileresPanel` (bug 2026-08-03).
//
// Desde el cliente: importá SIEMPRE de `@/lib/ical-core`.
// Desde el servidor: `@/lib/ical` sirve todo (re-exporta este archivo).

/** Reserva de la app, en el formato mínimo que necesita el matching. */
export interface AppRes {
  id: string;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD (exclusivo)
  cabin: string | null;
  platform: string | null;
  guest_name: string | null;
  phone: string | null;
}

/** Evento traído de un calendario externo, ya normalizado. */
export interface ExtEvent {
  source: "google" | "airbnb";
  sourceLabel: string;
  cabin: string | null; // una de CABINS (sin TODAS) o null si no se pudo leer
  phys: string | null; // casa física (Ruca + Ruca Chico => "Ruca")
  platform: string | null;
  guest: string | null;
  start: string; // YYYY-MM-DD (checkin)
  end: string; // YYYY-MM-DD (checkout, exclusivo)
  raw: string; // título crudo
  parsed: boolean; // se detectó cabaña
  blocked: boolean; // Airbnb "Not available" (bloqueo, no es una reserva real)
  note: string | null; // dato extra (ej: últimos 4 dígitos del tel en Airbnb)
}

/** Fuente de calendario (forma estructural; evita importar la capa de DB). */
export interface FeedSource {
  kind: "google" | "airbnb";
  label: string | null;
  cabin: string | null;
  ics_url: string;
}

/** Item del calendario de la app, unificado para dibujar y comparar. Las reservas
 *  de Airbnb vienen del feed de Airbnb; el resto (WA, Booking…) de Alquileres
 *  Detalle. Google NO entra acá: es la contraparte de comparación. */
export interface CalItem {
  cabin: string | null;
  phys: string | null;
  platform: string | null;
  guest: string | null;
  start: string;
  end: string;
  origin: "app" | "airbnb";
  note: string | null;
}

export interface OverbookPair {
  phys: string;
  a: { label: string; start: string; end: string; guest: string | null };
  b: { label: string; start: string; end: string; guest: string | null };
}

/** Misma reserva en la app y en Google, pero con fechas que no coinciden. */
export interface DateMismatch {
  cabin: string | null;
  guest: string | null;
  app: { start: string; end: string }; // checkin / checkout de la app
  google: { start: string; end: string }; // checkin / checkout que se deduce de Google
}

export interface DiffResult {
  generatedAt: string;
  feedErrors: { label: string; error: string }[];
  hasGoogle: boolean;
  unparsedGoogle: ExtEvent[]; // eventos de Google sin cabaña reconocible
  airbnbNotInApp: ExtEvent[]; // 🟠 reserva de Airbnb que no está en Alquileres Detalle
  dateMismatch: DateMismatch[]; // 🟠 misma reserva pero con fechas distintas (app vs Google)
  notInGoogle: CalItem[]; // 🟡 lo nuestro (app no-Airbnb + Airbnb) que no está en Google
  googleNotInRecords: ExtEvent[]; // 🟡 Google que no está ni en la app ni en Airbnb
  overbook: OverbookPair[]; // 🔴 misma casa, fechas pisadas, reservas distintas
  counts: {
    airbnbNotInApp: number;
    dateMismatch: number;
    notInGoogle: number;
    googleNotInRecords: number;
    overbook: number;
  };
}

// ── helpers de fecha / cabaña (puros) ───────────────────────────────────────

/** Casa física: Ruca y Ruca Chico son la misma casa (igual que v_booking_alerts).
 *  Además normaliza la grafía vieja "Cohiue" → "Coihue" para que ambas matcheen. */
export function phys(cabin: string | null): string | null {
  if (!cabin) return null;
  if (cabin === "Ruca" || cabin === "Ruca Chico") return "Ruca";
  if (cabin === "Cohiue") return "Coihue";
  return cabin;
}

/** Suma n días a 'YYYY-MM-DD' (UTC, sin líos de zona horaria). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Solapamiento de rangos con checkout exclusivo (strings 'YYYY-MM-DD' comparan bien). */
export function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return aS < bE && bS < aE;
}

export function sameRange(aS: string, aE: string, bS: string, bE: string): boolean {
  return aS === bS && aE === bE;
}
