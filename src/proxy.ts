import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Puerta de contraseña (HTTP Basic Auth) para toda la app.
// El navegador muestra un cartel pidiendo usuario y contraseña; sin las
// credenciales correctas no se entra a ninguna página NI se ejecutan los
// server actions (cobrar/cancelar son POST a las mismas rutas, así que también
// quedan protegidos).
//
// Las credenciales se leen de variables de entorno (se cargan en Vercel y, para
// desarrollo, en .env.local — nunca se commitean). Si no están definidas, la
// app queda abierta: práctico en local, pero en Vercel SIEMPRE definí las dos.
const USER = process.env.BASIC_AUTH_USER;
const PASS = process.env.BASIC_AUTH_PASSWORD;

export function proxy(request: NextRequest) {
  // Sin credenciales configuradas → no bloquea (ej. desarrollo local).
  if (!USER || !PASS) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const sep = decoded.indexOf(":");
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      if (user === USER && pass === PASS) return NextResponse.next();
    } catch {
      // header mal formado → cae al 401 de abajo
    }
  }

  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Ruca Edén", charset="UTF-8"' },
  });
}

export const config = {
  // Corre en todas las rutas menos los estáticos (si no, bloquearía CSS/JS/imágenes).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
