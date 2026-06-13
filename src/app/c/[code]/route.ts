import { getContractUrl } from "@/db/contracts";

export const dynamic = "force-dynamic";

// Redirige el link corto al contrato de JotForm prellenado. Ruta PÚBLICA (el
// inquilino la abre sin contraseña; ver proxy.ts). Solo redirige a jotform.com.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = await getContractUrl(code);
  if (!url) return new Response("Link no encontrado", { status: 404 });
  try {
    if (!/(^|\.)jotform\.com$/.test(new URL(url).hostname)) {
      return new Response("Destino no permitido", { status: 400 });
    }
  } catch {
    return new Response("Link inválido", { status: 400 });
  }
  return Response.redirect(url, 302);
}
