import { parseICS } from "node-ical";
import { CABINS } from "@/lib/catalog";

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

/** Casa física: Ruca y Ruca Chico son la misma casa (igual que v_booking_alerts). */
export function phys(cabin: string | null): string | null {
  if (!cabin) return null;
  return cabin === "Ruca" || cabin === "Ruca Chico" ? "Ruca" : cabin;
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

  // cabaña: del nombre más largo al más corto ("Ruca Chico" antes que "Ruca")
  const cabins = CABINS.filter((c) => c !== "TODAS").sort((a, b) => b.length - a.length);
  let cabin: string | null = null;
  for (const c of cabins) {
    const re = new RegExp(stripAccents(c).replace(/\s+/g, "\\s+"), "i");
    if (re.test(t)) {
      cabin = c;
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
    if (comp.transparency === "TRANSPARENT") continue;
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

/** Completa SOLO el nombre del huésped en las reservas de Airbnb (que no lo traen),
 *  cruzando contra las reservas de la app por tel (últimos 4 dígitos) o, si no,
 *  por cabaña + fechas. NO toca fechas ni ningún otro dato del evento de Airbnb. */
export function applyAirbnbNames(events: ExtEvent[], appRes: AppRes[]): ExtEvent[] {
  return events.map((e) => {
    if (e.source !== "airbnb" || e.guest || e.blocked) return e;
    const last4 = e.note?.match(/(\d{4})/)?.[1] ?? null;
    let match: AppRes | undefined;
    if (last4) match = appRes.find((r) => r.phone && r.phone.replace(/\D/g, "").endsWith(last4));
    if (!match) {
      const cands = appRes.filter(
        (r) => phys(r.cabin) === e.phys && overlaps(r.checkin, r.checkout, e.start, e.end),
      );
      match = cands.find((r) => sameRange(r.checkin, r.checkout, e.start, e.end)) ?? cands[0];
    }
    return match?.guest_name ? { ...e, guest: match.guest_name } : e;
  });
}

/** Eventos que solapan el mes 'YYYY-MM'. */
export function eventsForMonth(events: ExtEvent[], mes: string): ExtEvent[] {
  const start = `${mes}-01`;
  const [y, m] = mes.split("-").map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  return events.filter((e) => e.start < next && e.end > start);
}

// ── diff / overbook ─────────────────────────────────────────────────────────

export interface DateMismatch {
  event: ExtEvent;
  app: AppRes;
}
export interface OverbookPair {
  phys: string;
  a: { label: string; start: string; end: string; guest: string | null };
  b: { label: string; start: string; end: string; guest: string | null };
}
export interface DiffResult {
  generatedAt: string;
  feedErrors: { label: string; error: string }[];
  unparsed: ExtEvent[]; // eventos de Google donde no se pudo leer la cabaña
  A: ExtEvent[]; // en Google pero no en la app
  B: AppRes[]; // en la app pero no en Google
  C: DateMismatch[]; // coincide pero fechas distintas
  D: OverbookPair[]; // overbook (misma casa, fechas pisadas)
  E: ExtEvent[]; // Airbnb bloqueado sin reserva AirBnb en la app
  counts: { A: number; B: number; C: number; D: number; E: number };
}

function sameBooking(
  aS: string,
  aE: string,
  ag: string | null,
  bS: string,
  bE: string,
  bg: string | null,
): boolean {
  // misma reserva vista en dos fuentes: solapan y (mismas fechas o mismo nombre)
  if (!overlaps(aS, aE, bS, bE)) return false;
  return sameRange(aS, aE, bS, bE) || fuzzyName(ag, bg);
}

/** Compara reservas de la app contra eventos externos y arma las categorías A–E. */
export function computeDiff(
  appRes: AppRes[],
  ext: ExtEvent[],
  feedErrors: { label: string; error: string }[],
  generatedAt: string,
): DiffResult {
  const res = appRes.filter((r) => r.cabin && r.cabin !== "TODAS");
  const parsedExt = ext.filter((e) => e.phys);
  const unparsed = ext.filter((e) => !e.phys); // google sin cabaña detectable

  const google = parsedExt.filter((e) => e.source === "google");
  const airbnb = parsedExt.filter((e) => e.source === "airbnb");

  const A: ExtEvent[] = [];
  const C: DateMismatch[] = [];
  const coveredByGoogle = new Set<string>(); // app res id cubierta por algún evento de Google

  for (const e of google) {
    const cands = res.filter(
      (r) => phys(r.cabin) === e.phys && overlaps(r.checkin, r.checkout, e.start, e.end),
    );
    // misma reserva, fechas exactas → cubierta, sin discrepancia
    const exact = cands.find((c) => sameRange(c.checkin, c.checkout, e.start, e.end));
    if (exact) {
      coveredByGoogle.add(exact.id);
      continue;
    }
    // misma reserva (mismo nombre) pero fechas distintas → C
    const named = cands.find((c) => fuzzyName(c.guest_name, e.guest));
    if (named) {
      coveredByGoogle.add(named.id);
      C.push({ event: e, app: named });
      continue;
    }
    // no es la misma reserva (sin candidata o solapa a OTRO huésped) → falta en la
    // app (A); si solapaba a otra reserva, el overbook lo detecta la sección D.
    A.push(e);
  }

  // B: reservas de la app sin ningún evento de Google que solape su casa
  const B = res.filter((r) => !coveredByGoogle.has(r.id));

  // E: Airbnb marca ocupado (reserva o bloqueo) y la app NO tiene NINGUNA reserva
  // que solape esas fechas en esa casa (sea del canal que sea). Así no marcamos
  // como error las reservas de WA que ya están cargadas (Airbnb las bloquea igual).
  const E: ExtEvent[] = [];
  for (const e of airbnb) {
    const hasApp = res.some(
      (r) => phys(r.cabin) === e.phys && overlaps(r.checkin, r.checkout, e.start, e.end),
    );
    if (!hasApp) E.push(e);
  }

  // D: overbook entre reservas distintas. Solo cruzamos app + Google (que SÍ tiene
  // nombres). Airbnb queda fuera de D: sin nombre no se puede distinguir una
  // reserva de su propio bloqueo y daría falsos positivos; su chequeo es la cat. E.
  type B0 = { label: string; phys: string | null; start: string; end: string; guest: string | null };
  const bookings: B0[] = [
    ...res.map((r) => ({
      label: `App · ${r.cabin} · ${r.platform ?? "?"}`,
      phys: phys(r.cabin),
      start: r.checkin,
      end: r.checkout,
      guest: r.guest_name,
    })),
    ...A.map((e) => ({ label: `${e.sourceLabel} (Google)`, phys: e.phys, start: e.start, end: e.end, guest: e.guest })),
  ];
  const D: OverbookPair[] = [];
  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const a = bookings[i];
      const b = bookings[j];
      if (!a.phys || a.phys !== b.phys) continue;
      if (!overlaps(a.start, a.end, b.start, b.end)) continue;
      if (sameTurnover(a.start, a.end, b.start, b.end)) continue;
      if (sameBooking(a.start, a.end, a.guest, b.start, b.end, b.guest)) continue;
      D.push({
        phys: a.phys,
        a: { label: a.label, start: a.start, end: a.end, guest: a.guest },
        b: { label: b.label, start: b.start, end: b.end, guest: b.guest },
      });
    }
  }

  return {
    generatedAt,
    feedErrors,
    unparsed,
    A,
    B,
    C,
    D,
    E,
    counts: { A: A.length, B: B.length, C: C.length, D: D.length, E: E.length },
  };
}
