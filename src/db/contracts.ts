import { sql } from "@/lib/db";

export async function getContractUrl(code: string): Promise<string | null> {
  const rows = await sql<{ url: string }[]>`
    SELECT url FROM contract_links WHERE code = ${code} LIMIT 1`;
  return rows[0]?.url ?? null;
}
