import { parseICS } from "node-ical";

// Detección de cabaña en títulos de Google, de más específico a menos. Tolera
// variantes: "Ruca chico" pegado al guion, y "Coihue"/"Cohiue" (letras cambiadas).
const CABIN_PATTERNS: [RegExp, string][] = [
  [/ruca\s*chico/i, "Ruca Chico"],
  [/ruqui/i, "Ruqui"],
  [/alerce/i, "Alerce"],
  [/co[ih]{2}ue/i, "Coihue"], // coihue / cohiue → grafía correcta "Coihue"
  [/maiten/i, "Maiten"],
  [/ruca/i, "Ruca"], // al final: "Ruca" es substring de "Ruca Chico"
];

// ───────────────────────────────────────────────────────────────────────────
// Lib pura (sin Next / sin "use server"): baja feeds iCal, parsea los eventos,
// y compara Google Calendar + Airbnb contra las reservas de la app para detectar
// diferencias y overbookings. Pensada para correr en el server (Node).
// ───────────────────────────────────────────────────────────────────────────

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

// ── helpers de fecha / texto ────────────────────────────────────────────────

/** node-ical crea las fechas all-day a medianoche LOCAL → componentes locales
 *  recuperan la fecha original en cualquier zona horaria (no usar toISOString). */
function toLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

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
/** checkout == checkin: uno sale el día que entra el otro → NO es overbook. */
function sameTurnover(aS: string, aE: string, bS: string, bE: string): boolean {
  return aE === bS || bE === aS;
}

function normName(s: string | null): string {
  return stripAccents((s ?? "").toLowerCase())
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Match de nombre tolerante (señal secundaria de desempate, no bloqueante). */
export function fuzzyName(a: string | null, b: string | null): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const tx = new Set(x.split(" ").filter((t) => t.length >= 3));
  return y.split(" ").some((t) => t.length >= 3 && tx.has(t));
}

// ── parseo del título de Google ─────────────────────────────────────────────

// token de plataforma -> valor canónico (tolerante a abreviaturas de Mimi)
const PLATFORM_TOKENS: [RegExp, string][] = [
  [/\bair\s?bnb\b|\bairb\b/i, "AirBnb"],
  [/\bwa\b|\bwsp\b|\bwpp\b|\bwhats?app\b/i, "WA"],
  [/\bbooking\b/i, "Booking"],
  [/\binstagram\b|\binsta\b|\big\b/i, "Instagram"],
  [/\bmeli\b|mercado\s?libre/i, "Meli"],
  [/\bparairnos\b/i, "Parairnos"],
  [/\bterceros?\b/i, "Terceros"],
];

/** Título tipo "Cabaña - Nombre plataforma (notas)". Best-effort: detecta cabaña
 *  (la más larga primero, sin acentos), plataforma por token, y lo que sobra = nombre. */
export function parseGoogleTitle(summary: string): {
  cabin: string | null;
  platform: string | null;
  guest: string | null;
} {
  // sacar notas entre paréntesis y normalizar acentos (Maitén -> Maiten)
  let t = stripAccents((summary ?? "").replace(/\([^)]*\)/g, " "));

  // cabaña: patrones ordenados de más específico a menos. Toleran variantes de
  // Mimi ("Ruca chico-" pegado, "Coihue"/"Cohiue" con letras cambiadas).
  let cabin: string | null = null;
  for (const [re, canon] of CABIN_PATTERNS) {
    if (re.test(t)) {
      cabin = canon;
      t = t.replace(re, " ");
      break;
    }
  }

  // plataforma por token
  let platform: string | null = null;
  for (const [re, canon] of PLATFORM_TOKENS) {
    if (re.test(t)) {
      platform = canon;
      t = t.replace(re, " ");
      break;
    }
  }

  // lo que queda = nombre del huésped
  const guest = t.replace(/[-–—|]/g, " ").replace(/\s+/g, " ").trim() || null;
  return { cabin, platform, guest };
}

// ── normalización de VEVENTs ────────────────────────────────────────────────

/** Parsea el texto de un feed iCal a ExtEvent[]. Para Google lee el título;
 *  para Airbnb la cabaña viene del feed (no hay título útil). */
export function parseFeed(
  text: string,
  source: "google" | "airbnb",
  sourceLabel: string,
  cabinForAirbnb?: string | null,
): ExtEvent[] {
  const data = parseICS(text);
  const out: ExtEvent[] = [];
  for (const key of Object.keys(data)) {
    const comp = data[key];
    if (!comp || comp.type !== "VEVENT") continue;
    if (comp.status === "CANCELLED") continue;
    // OJO: NO filtrar por transparency. Los eventos all-day de Google vienen como
    // "TRANSPARENT" (Disponible) por defecto, y ahí están las reservas de Mimi.
    if (!comp.start || !comp.end) continue;

    const start = toLocalYMD(comp.start as Date);
    const end = toLocalYMD(comp.end as Date);
    const sum = comp.summary as unknown;
    const raw =
      typeof sum === "string" ? sum : String((sum as { val?: string })?.val ?? sum ?? "");
    const desc = comp.description as unknown;
    const descStr =
      typeof desc === "string" ? desc : String((desc as { val?: string })?.val ?? "");

    if (source === "google") {
      const { cabin, platform, guest } = parseGoogleTitle(raw);
      out.push({
        source,
        sourceLabel,
        cabin,
        phys: phys(cabin),
        platform,
        guest,
        start,
        end,
        raw,
        parsed: cabin != null,
        blocked: false,
        note: null,
      });
    } else {
      const cabin = cabinForAirbnb ?? null;
      // Airbnb: "Reserved" = reserva real; "… Not available" = bloqueo manual.
      const blocked = /not\s*available|unavailable|blocked|no\s*disponible/i.test(raw);
      const phone = descStr.match(/Last 4 Digits\)?:?\s*(\d{4})/i)?.[1] ?? null;
      out.push({
        source,
        sourceLabel,
        cabin,
        phys: phys(cabin),
        platform: "AirBnb",
        guest: null,
        start,
        end,
        raw,
        parsed: cabin != null,
        blocked,
        note: phone ? `tel …${phone}` : null,
      });
    }
  }
  return out;
}

// ── fetch + cache (1h, sobre globalThis, como blue.ts) ──────────────────────

const g = globalThis as unknown as {
  icalCache?: Record<string, { text: string; ts: number }>;
};

export async function fetchFeedText(url: string, force = false): Promise<string> {
  g.icalCache ??= {};
  const cached = g.icalCache[url];
  if (!force && cached && Date.now() - cached.ts < 3600_000) return cached.text;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("la URL no devolvió un iCal válido");
  g.icalCache[url] = { text, ts: Date.now() };
  return text;
}

/** Fuente de calendario (forma estructural; evita importar la capa de DB). */
export interface FeedSource {
  kind: "google" | "airbnb";
  label: string | null;
  cabin: string | null;
  ics_url: string;
}

/** Baja y parsea todas las fuentes activas. Un feed caído no rompe los demás
 *  (Promise.allSettled) — se reporta en feedErrors. */
export async function loadFeeds(
  sources: FeedSource[],
  force = false,
): Promise<{ events: ExtEvent[]; feedErrors: { label: string; error: string }[] }> {
  const events: ExtEvent[] = [];
  const feedErrors: { label: string; error: string }[] = [];
  const labelOf = (s: FeedSource) =>
    s.label ?? (s.kind === "google" ? "Google" : `Airbnb ${s.cabin ?? ""}`.trim());
  const settled = await Promise.allSettled(
    sources.map(async (s) => parseFeed(await fetchFeedText(s.ics_url, force), s.kind, labelOf(s), s.cabin)),
  );
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") events.push(...r.value);
    else
      feedErrors.push({
        label: labelOf(sources[i]),
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
  });
  return { events, feedErrors };
}

/** Busca la reserva de la app que corresponde a un evento de Airbnb: primero por
 *  tel (últimos 4 dígitos), si no por cabaña + fechas. */
function findAppMatch(e: ExtEvent, appRes: AppRes[]): AppRes | undefined {
  const last4 = e.note?.match(/(\d{4})/)?.[1] ?? null;
  if (last4) {
    const byPhone = appRes.find((r) => r.phone && r.phone.replace(/\D/g, "").endsWith(last4));
    if (byPhone) return byPhone;
  }
  const cands = appRes.filter(
    (r) => phys(r.cabin) === e.phys && overlaps(r.checkin, r.checkout, e.start, e.end),
  );
  return cands.find((r) => sameRange(r.checkin, r.checkout, e.start, e.end)) ?? cands[0];
}

/** Completa SOLO el nombre del huésped en las reservas de Airbnb (que no lo traen),
 *  cruzando contra las reservas de la app por tel o cabaña + fechas. NO toca
 *  fechas ni ningún otro dato del evento de Airbnb. */
export function applyAirbnbNames(events: ExtEvent[], appRes: AppRes[]): ExtEvent[] {
  return events.map((e) => {
    if (e.source !== "airbnb" || e.guest || e.blocked) return e;
    const match = findAppMatch(e, appRes);
    return match?.guest_name ? { ...e, guest: match.guest_name } : e;
  });
}

/** Items (eventos/reservas) que solapan el mes 'YYYY-MM'. */
export function eventsForMonth<T extends { start: string; end: string }>(
  events: T[],
  mes: string,
): T[] {
  const start = `${mes}-01`;
  const [y, m] = mes.split("-").map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  return events.filter((e) => e.start < next && e.end > start);
}

// ── el "calendario de la app" = Alquileres Detalle (no-Airbnb) + feed Airbnb ──

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

export function buildCalendar(appRes: AppRes[], airbnbEvents: ExtEvent[]): CalItem[] {
  const appItems: CalItem[] = appRes
    .filter((r) => r.cabin && r.cabin !== "TODAS" && (r.platform ?? "") !== "AirBnb")
    .map((r) => ({
      cabin: r.cabin,
      phys: phys(r.cabin),
      platform: r.platform,
      guest: r.guest_name,
      start: r.checkin,
      end: r.checkout,
      origin: "app",
      note: null,
    }));
  const airItems: CalItem[] = airbnbEvents
    .filter((e) => !e.blocked && e.phys)
    .map((e) => ({
      cabin: e.cabin,
      phys: e.phys,
      platform: "AirBnb",
      guest: e.guest,
      start: e.start,
      end: e.end,
      origin: "airbnb",
      note: e.note,
    }));
  return [...appItems, ...airItems];
}

// ── diff / overbook ─────────────────────────────────────────────────────────

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

function sameBooking(
  aS: string,
  aE: string,
  ag: string | null,
  bS: string,
  bE: string,
  bg: string | null,
): boolean {
  if (!overlaps(aS, aE, bS, bE)) return false;
  return sameRange(aS, aE, bS, bE) || fuzzyName(ag, bg);
}

/** Compara el calendario de la app (Alquileres Detalle no-Airbnb + feed Airbnb)
 *  contra Google. Airbnb queda triple-chequeado (Airbnb ↔ app ↔ Google); el resto
 *  es app ↔ Google. */
export function computeDiff(
  appRes: AppRes[],
  googleEvents: ExtEvent[],
  airbnbEvents: ExtEvent[],
  feedErrors: { label: string; error: string }[],
  generatedAt: string,
  today: string, // 'YYYY-MM-DD': el chequeo es de hoy en adelante (lo pasado no importa)
): DiffResult {
  // de hoy en adelante: solo reservas que todavía no terminaron (checkout >= hoy)
  const future = appRes.filter((r) => r.checkout >= today);
  const appAll = future.filter((r) => r.cabin && r.cabin !== "TODAS");
  const airbnb = airbnbEvents.filter((e) => !e.blocked && e.phys && e.end >= today);
  const google = googleEvents.filter((e) => e.phys && e.end >= today);
  const unparsedGoogle = googleEvents.filter((e) => !e.phys && e.end >= today);
  const hasGoogle = google.length > 0;
  const ourCal = buildCalendar(future, airbnb);

  // 🟠 reserva de Airbnb que no está en Alquileres Detalle (por tel o cabaña+fechas)
  const airbnbNotInApp = airbnb.filter((a) => !findAppMatch(a, appAll));

  const overlapsGoogle = (p: string | null, s: string, e: string) =>
    google.some((g) => g.phys === p && overlaps(g.start, g.end, s, e));

  // 🟡 lo nuestro que no aparece en Google (solo si hay Google cargado)
  const notInGoogle = hasGoogle
    ? ourCal.filter((it) => !overlapsGoogle(it.phys, it.start, it.end))
    : [];

  // 🟡 Google que no aparece en nuestros registros (app de cualquier canal + Airbnb)
  const inRecords = (g: ExtEvent) =>
    appAll.some((r) => phys(r.cabin) === g.phys && overlaps(r.checkin, r.checkout, g.start, g.end)) ||
    airbnb.some((a) => a.phys === g.phys && overlaps(a.start, a.end, g.start, g.end));
  const googleNotInRecords = hasGoogle ? google.filter((g) => !inRecords(g)) : [];

  // 🟠 misma reserva en la app y en Google pero con fechas distintas. Convención
  // verificada: el DTEND de Google = checkout de la app + 1 día (Mimi dibuja el día
  // de salida en Google). Se considera "la misma" si comparten check-in o el nombre.
  // El check-out de Google se muestra ya normalizado (−1) para comparar peras con peras.
  const dateMismatch: DateMismatch[] = [];
  if (hasGoogle) {
    for (const g of google) {
      const cands = ourCal.filter((it) => it.phys === g.phys && overlaps(it.start, it.end, g.start, g.end));
      const m = cands.find((it) => it.start === g.start) ?? cands.find((it) => fuzzyName(it.guest, g.guest));
      if (!m) continue; // no la encontramos: ya lo cubren notInGoogle / googleNotInRecords
      if (m.start === g.start && g.end === addDays(m.end, 1)) continue; // coincide (con la convención)
      dateMismatch.push({
        cabin: m.cabin ?? g.cabin,
        guest: m.guest ?? g.guest,
        app: { start: m.start, end: m.end },
        google: { start: g.start, end: addDays(g.end, -1) },
      });
    }
  }

  // 🔴 overbook: misma casa física, fechas pisadas, reservas distintas, entre los
  // items de nuestro calendario (app no-Airbnb + Airbnb). Descarta turnover y la
  // misma reserva vista dos veces.
  const overbook: OverbookPair[] = [];
  const lbl = (it: CalItem) =>
    it.origin === "airbnb" ? `Airbnb · ${it.cabin}` : `App · ${it.cabin} · ${it.platform ?? "?"}`;
  for (let i = 0; i < ourCal.length; i++) {
    for (let j = i + 1; j < ourCal.length; j++) {
      const a = ourCal[i];
      const b = ourCal[j];
      if (!a.phys || a.phys !== b.phys) continue;
      if (!overlaps(a.start, a.end, b.start, b.end)) continue;
      if (sameTurnover(a.start, a.end, b.start, b.end)) continue;
      if (sameBooking(a.start, a.end, a.guest, b.start, b.end, b.guest)) continue;
      overbook.push({
        phys: a.phys,
        a: { label: lbl(a), start: a.start, end: a.end, guest: a.guest },
        b: { label: lbl(b), start: b.start, end: b.end, guest: b.guest },
      });
    }
  }

  return {
    generatedAt,
    feedErrors,
    hasGoogle,
    unparsedGoogle,
    airbnbNotInApp,
    dateMismatch,
    notInGoogle,
    googleNotInRecords,
    overbook,
    counts: {
      airbnbNotInApp: airbnbNotInApp.length,
      dateMismatch: dateMismatch.length,
      notInGoogle: notInGoogle.length,
      googleNotInRecords: googleNotInRecords.length,
      overbook: overbook.length,
    },
  };
}
