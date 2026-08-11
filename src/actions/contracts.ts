"use server";

import { withWriteConn } from "@/lib/db";

function isJotform(url: string): boolean {
  try {
    return /(^|\.)jotform\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

const genCode = () => Math.random().toString(36).slice(2, 9);

/** Guarda la URL larga de JotForm con un código corto y lo devuelve, para armar
 *  el link corto <app>/c/<code> que se le manda al inquilino. */
export async function createContractLink(
  url: string,
  guest: string | null,
): Promise<{ ok: boolean; code?: string; error?: string }> {
  if (!isJotform(url)) return { ok: false, error: "La URL no es de JotForm" };
  try {
    return await withWriteConn(async (db) => {
      for (let i = 0; i < 5; i++) {
        const code = genCode();
        try {
          await db`INSERT INTO contract_links (code, url, guest) VALUES (${code}, ${url}, ${guest || null})`;
          return { ok: true, code };
        } catch {
          // colisión de code (UNIQUE) → reintentar con otro code
        }
      }
      return { ok: false, error: "No se pudo generar el link, probá de nuevo" };
    });
  } catch {
    return { ok: false, error: "No se pudo guardar el link, probá de nuevo" };
  }
}
