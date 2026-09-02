"use client";

import CopyBtn from "@/components/CopyBtn";
import { SERVICIOS, type Servicio } from "@/lib/servicios";

const th =
  "border-b border-neutral-300 bg-neutral-100 px-2 py-1 text-left text-xs font-semibold whitespace-nowrap";
const td = "border-b border-neutral-100 px-2 py-1 align-top";

/** Los datos son una ficha a mano: los huecos se muestran, no se disimulan. */
const DASH = <span className="text-neutral-300">—</span>;

function DebitoBadge({ valor }: { valor: boolean | null }) {
  if (valor === null)
    return <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">?</span>;
  return valor ? (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
      Débito automático SÍ
    </span>
  ) : (
    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
      Débito automático NO
    </span>
  );
}

function ServicioCard({ s }: { s: Servicio }) {
  return (
    <section className="rounded border border-neutral-300 bg-white">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
        <h3 className="text-sm font-semibold text-green-800">{s.nombre}</h3>
        {s.proveedor && <span className="text-xs text-neutral-500">{s.proveedor}</span>}
        <DebitoBadge valor={s.debitoAutomatico} />
        {s.pagina && (
          <a
            href={s.pagina}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs font-medium text-green-700 underline hover:text-green-900"
          >
            Abrir la página ↗
          </a>
        )}
      </header>

      <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 py-2 text-xs">
        <span>
          <span className="text-neutral-500">Quién paga: </span>
          {s.quienPaga ?? DASH}
        </span>
        <span>
          <span className="text-neutral-500">Se entra con: </span>
          {s.ingreso ?? DASH}
        </span>
      </div>

      {s.pendientes?.length ? (
        <ul className="mx-3 mb-2 space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {s.pendientes.map((p) => (
            <li key={p}>⚠️ {p}</li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Nº de cuenta", "Cuál es", "A nombre de", "Datos"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.cuentas.map((c) => (
              <tr key={`${c.numero}-${c.etiqueta ?? ""}`}>
                <td className={`${td} whitespace-nowrap`}>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs">{c.numero}</span>
                    <CopyBtn text={c.numero} label="Copiar" />
                  </span>
                </td>
                <td className={`${td} text-xs`}>{c.etiqueta ?? DASH}</td>
                <td className={`${td} text-xs`}>{c.titular ?? DASH}</td>
                <td className={`${td} text-xs text-neutral-600`}>
                  {c.datos?.length ? (
                    <ul className="space-y-0.5">
                      {c.datos.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  ) : (
                    DASH
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {s.notas?.length ? (
        <ul className="space-y-0.5 border-t border-neutral-200 px-3 py-2 text-xs text-neutral-600">
          {s.notas.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function ServiciosPanel() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        Ficha de consulta para pagar los servicios e impuestos. Se edita a mano en{" "}
        <code className="rounded bg-neutral-100 px-1">src/lib/servicios.ts</code>.
      </p>
      {SERVICIOS.map((s) => (
        <ServicioCard key={s.nombre} s={s} />
      ))}
    </div>
  );
}
