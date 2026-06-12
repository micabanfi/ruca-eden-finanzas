import { sql } from "@/lib/db";

// Replicates valorDolarBlue.gs getBlueValue(): blue.value_avg from bluelytics.
// 1h in-memory cache; falls back to the last rate stored in the DB.

export interface BlueRate {
  rate: number;
  source: "live" | "cache" | "fallback";
}

const globalForBlue = globalThis as unknown as {
  blueCache?: { rate: number; ts: number };
};

export async function getBlueRate(): Promise<BlueRate> {
  const cached = globalForBlue.blueCache;
  if (cached && Date.now() - cached.ts < 3600_000) {
    return { rate: cached.rate, source: "cache" };
  }
  try {
    const res = await fetch("https://api.bluelytics.com.ar/v2/latest", {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`bluelytics ${res.status}`);
    const json = await res.json();
    const rate = Number(json.blue.value_avg);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("bad rate");
    globalForBlue.blueCache = { rate, ts: Date.now() };
    return { rate, source: "live" };
  } catch {
    const rows = await sql<{ blue_rate: string }[]>`
      SELECT blue_rate FROM transactions
      WHERE blue_rate IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1`;
    if (rows.length > 0) {
      return { rate: Number(rows[0].blue_rate), source: "fallback" };
    }
    throw new Error("No blue rate available (API down, no fallback in DB)");
  }
}
