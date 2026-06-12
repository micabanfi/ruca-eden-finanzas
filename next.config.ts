import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-ical (y sus deps: rrule/moment/luxon) no se llevan bien con el bundler
  // de los server actions (rompe con "e.BigInt is not a function"). Lo dejamos
  // como paquete externo del servidor: se requiere directo de node_modules.
  serverExternalPackages: ["node-ical"],
};

export default nextConfig;
