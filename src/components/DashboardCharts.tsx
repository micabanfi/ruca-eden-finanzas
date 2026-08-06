"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  CabinRow,
  KPIs,
  MesSerie,
  MesTarifa,
  NamedAmount,
  PlatformRow,
  Proyeccion,
  Temporada,
  VarioRow,
  YearSerie,
} from "@/db/dashboard";
import { fmtUSD } from "@/lib/format";

const PALETTE = [
  "#15803d", "#0e7490", "#b45309", "#9333ea", "#dc2626",
  "#0891b2", "#65a30d", "#c026d3", "#ea580c", "#475569",
];

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-neutral-300 bg-white p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-neutral-900">{value}</div>
      {sub && <div className="text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-neutral-300 bg-white p-3">
      <h2 className="text-sm font-semibold text-green-800">{title}</h2>
      {hint && <p className="mb-2 text-xs text-neutral-400">{hint}</p>}
      {children}
    </section>
  );
}

const usd0 = (n: number) => `USD$${Math.round(n).toLocaleString("es-AR")}`;

/** Torta de Gastos Varios con desglose: al clickear una porción (o su leyenda)
 *  se abre la lista de movimientos que la componen. Los totales de la torta se
 *  agregan acá desde las MISMAS filas que muestra la tabla, así el desglose
 *  siempre suma exactamente la porción. */
function GastosVariosDrill({ rows }: { rows: VarioRow[] }) {
  const [sel, setSel] = useState<string | null>(null);

  const agg = useMemo(() => {
    const m = new Map<string, { usd: number; n: number }>();
    for (const r of rows) {
      const a = m.get(r.grupo) ?? { usd: 0, n: 0 };
      a.usd += r.usd;
      a.n += 1;
      m.set(r.grupo, a);
    }
    return [...m.entries()]
      .map(([nombre, a]) => ({ nombre, usd: Math.round(a.usd * 100) / 100, n: a.n }))
      .sort((x, y) => y.usd - x.usd);
  }, [rows]);

  // color estable por grupo: el mismo índice que usa la torta
  const colorDe = (nombre: string) =>
    PALETTE[Math.max(0, agg.findIndex((a) => a.nombre === nombre)) % PALETTE.length];

  const detalle = useMemo(
    () => (sel ? rows.filter((r) => r.grupo === sel).sort((a, b) => b.usd - a.usd) : []),
    [rows, sel]
  );
  const totalSel = detalle.reduce((s, r) => s + r.usd, 0);
  const toggle = (nombre: string | null) => setSel((prev) => (prev === nombre ? null : nombre));

  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={agg}
            dataKey="usd"
            nameKey="nombre"
            cx="50%"
            cy="45%"
            outerRadius={80}
            onClick={(_, index) => toggle(agg[index]?.nombre ?? null)}
            className="cursor-pointer"
          >
            {agg.map((a, i) => (
              <Cell
                key={a.nombre}
                fill={PALETTE[i % PALETTE.length]}
                // la porción elegida se destaca; el resto se apaga
                opacity={sel === null || sel === a.nombre ? 1 : 0.3}
                stroke={sel === a.nombre ? "#111" : undefined}
                strokeWidth={sel === a.nombre ? 2 : undefined}
              />
            ))}
          </Pie>
          <Tooltip formatter={(v) => fmtUSD(Number(v))} />
          <Legend
            wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
            onClick={(payload) => toggle(payload.value ?? null)}
          />
        </PieChart>
      </ResponsiveContainer>

      {sel === null ? (
        <p className="text-center text-xs text-neutral-400">
          Clickeá una porción para ver los movimientos que la componen.
        </p>
      ) : (
        <div className="mt-1 rounded border border-neutral-200 bg-neutral-50 p-2">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: colorDe(sel) }}
              />
              <span className="text-xs font-semibold text-neutral-800">{sel}</span>
              <span className="text-[10px] text-neutral-500">
                {detalle.length} movimiento{detalle.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold tabular-nums text-neutral-900">
                {fmtUSD(totalSel)}
              </span>
              <button
                type="button"
                onClick={() => setSel(null)}
                className="rounded border border-neutral-300 px-1.5 text-[10px] text-neutral-500 hover:bg-white"
              >
                cerrar
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-neutral-50">
                <tr className="border-b border-neutral-300 text-left text-neutral-500">
                  <th className="py-1 font-normal">Fecha</th>
                  <th className="py-1 font-normal">Descripción</th>
                  <th className="py-1 text-right font-normal">Monto</th>
                </tr>
              </thead>
              <tbody>
                {detalle.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 align-top">
                    <td className="py-1 whitespace-nowrap tabular-nums text-neutral-500">
                      {r.fecha}
                    </td>
                    <td className="py-1 pr-2 text-neutral-800">{r.descripcion}</td>
                    <td className="py-1 text-right tabular-nums">{fmtUSD(r.usd)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-neutral-300 font-semibold">
                  <td className="py-1" />
                  <td className="py-1 text-right text-neutral-500">Total</td>
                  <td className="py-1 text-right tabular-nums">{fmtUSD(totalSel)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-1 text-[10px] text-neutral-400">
            Ordenado por monto. La clasificación es automática por palabras de la descripción:
            si algo cayó en el grupo equivocado, se arregla ajustando la descripción en
            Ingresos/Egresos.
          </p>
        </div>
      )}
    </>
  );
}

export default function DashboardCharts({
  kpis,
  cabanas,
  metodos,
  gastosGrupo,
  gastosVariosRows,
  plataformas,
  alcance,
  serieAnual,
  serieMensual,
  tarifaMes,
  temporadas,
  proyeccion,
}: {
  kpis: KPIs;
  cabanas: CabinRow[];
  metodos: NamedAmount[];
  gastosGrupo: NamedAmount[];
  gastosVariosRows: VarioRow[];
  plataformas: PlatformRow[];
  alcance: string;
  serieAnual: YearSerie[] | null; // solo en global
  serieMensual: MesSerie[] | null; // solo por año
  tarifaMes: MesTarifa[] | null; // solo por año
  temporadas: Temporada[] | null; // solo por año
  proyeccion: Proyeccion | null; // solo año en curso / futuro
}) {
  const pie = (data: NamedAmount[]) => (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="usd" nameKey="nombre" cx="50%" cy="45%" outerRadius={80}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => fmtUSD(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );

  /** Barras horizontales ordenadas, con el monto al lado. Para series donde una
   *  categoría aplasta al resto (Gastos Varios es ~78% del total) y una torta
   *  dejaría las chicas invisibles. */
  const barrasH = (data: NamedAmount[]) => (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 30 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 74, top: 4, bottom: 4 }}>
        <XAxis
          type="number"
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
        />
        <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={96} />
        <Tooltip formatter={(v) => fmtUSD(Number(v))} />
        <Bar dataKey="usd" name="Gastos" fill="#b45309" radius={[0, 3, 3, 0]}>
          <LabelList
            dataKey="usd"
            position="right"
            formatter={(v) => usd0(Number(v))}
            style={{ fontSize: 10, fill: "#525252" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  /** Mes a mes divergente: los egresos se dibujan hacia abajo invirtiéndoles el
   *  signo SOLO para el gráfico (en la base y en los KPIs siguen positivos).
   *  La ganancia queda al final y va sola para arriba o para abajo según el mes. */
  const mensualDiv = useMemo(
    () => (serieMensual ?? []).map((m) => ({ ...m, egresos: -m.egresos })),
    [serieMensual]
  );

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Card label={`Ingresos ${alcance}`} value={usd0(kpis.ingresos)} />
        <Card label={`Egresos ${alcance}`} value={usd0(kpis.egresos)} />
        <Card
          label="Balance"
          value={usd0(kpis.balance)}
          sub={kpis.balance < 0 ? "negativo" : "positivo"}
        />
        <Card
          label="Noches vendidas"
          value={String(kpis.noches)}
          sub={kpis.noches_disponibles ? `de ${kpis.noches_disponibles} disponibles` : undefined}
        />
        <Card
          label="Ocupación"
          value={kpis.ocupacion_pct === null ? "—" : `${kpis.ocupacion_pct}%`}
          sub={kpis.ocupacion_pct === null ? "elegí un año" : "sobre ventana real (sin sept.)"}
        />
        <Card label="Tarifa prom / noche" value={usd0(kpis.tarifa_prom)} sub={`${kpis.reservas} reservas`} />
      </div>

      {/* Proyección fin de año (solo año en curso / futuro) */}
      {proyeccion && (
        <div className="rounded border border-green-300 bg-green-50 p-3">
          <div className="text-xs font-medium text-green-700">
            Proyección fin de año {alcance}
          </div>
          <div className="text-2xl font-bold tabular-nums text-green-900">
            {usd0(proyeccion.proyeccion)}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {usd0(proyeccion.cobrado)} ya cobrado{" "}
            <span className="text-neutral-400">+</span>{" "}
            {usd0(proyeccion.por_cobrar)} por cobrar de {proyeccion.reservas_futuras} reserva
            {proyeccion.reservas_futuras === 1 ? "" : "s"} futura
            {proyeccion.reservas_futuras === 1 ? "" : "s"} confirmada
            {proyeccion.reservas_futuras === 1 ? "" : "s"}
          </div>
        </div>
      )}

      {/* POR AÑO: barras mes a mes (ingresos/egresos/ganancia). A todo lo ancho y
          primero de los gráficos: es la lectura principal del año. Equivale al
          "Por año" del Global, pero con el detalle mensual. */}
      {serieMensual && (
        <Section
          title={`Mes a mes ${alcance} — ingresos, egresos y ganancia`}
          hint="Ingresos en verde hacia arriba, egresos en rojo hacia abajo, y la ganancia del mes al final: arriba si ganaste, abajo si perdiste. Ingresos imputados al mes de check-in; egresos al mes al que corresponden (mes vencido). Los 12 meses suman los totales de arriba."
        >
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={mensualDiv} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                // valor absoluto: abajo del cero el rojo ya dice que son egresos
                tickFormatter={(v) => `${Math.round(Math.abs(Number(v)) / 1000)}k`}
              />
              <Tooltip
                formatter={(v, name) => [
                  fmtUSD(name === "Egresos" ? Math.abs(Number(v)) : Number(v)),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#9ca3af" />
              <Bar dataKey="ingresos" name="Ingresos" fill="#15803d" />
              <Bar dataKey="egresos" name="Egresos" fill="#dc2626" />
              <Bar dataKey="ganancia" name="Ganancia" fill="#0e7490" />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* GLOBAL: barras por año (ingresos/egresos/ganancia) + tarifa por año */}
      {serieAnual && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Por año — ingresos, egresos y ganancia">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={serieAnual} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="anio" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmtUSD(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#15803d" />
                <Bar dataKey="egresos" name="Egresos" fill="#dc2626" />
                <Bar dataKey="ganancia" name="Ganancia" fill="#0e7490" />
              </BarChart>
            </ResponsiveContainer>
          </Section>
          <Section title="Tarifa promedio por año" hint="USD por noche, promedio de todas las cabañas.">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={serieAnual} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="anio" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => fmtUSD(Number(v))} />
                <Line dataKey="tarifa_prom" name="Tarifa prom." stroke="#b45309" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        </div>
      )}

      {/* POR AÑO: tarifa por mes + ocupación por temporada */}
      {tarifaMes && temporadas && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Tarifa promedio por mes" hint="Cómo varía el precio por noche a lo largo del año.">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={tarifaMes} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => fmtUSD(Number(v))} />
                <Line dataKey="tarifa" name="Tarifa prom." stroke="#b45309" strokeWidth={2} connectNulls dot />
              </LineChart>
            </ResponsiveContainer>
          </Section>
          <Section
            title="Ocupación por temporada"
            hint="El cupo de cada temporada cuenta solo las casas realmente disponibles: Maitén se alquila solo en verano (15/12–15/03) y Coihue también lo hacía hasta el 16/03/2026, desde ahí va todo el año. Ruca y Ruca Chico son la misma casa (cuentan una: o se alquila una o la otra). Septiembre es de uso familiar pero sigue contando como cupo disponible."
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={temporadas} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="temporada" tick={{ fontSize: 9 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => `${Number(v)}%`} />
                <Bar dataKey="ocupacion_pct" name="Ocupación %" fill="#15803d" />
              </BarChart>
            </ResponsiveContainer>
            <table className="mt-2 w-full border-collapse text-xs">
              <tbody>
                {temporadas.map((t) => (
                  <tr key={t.temporada} className="border-b border-neutral-100 align-top">
                    <td className="py-1">
                      <div className="font-medium">{t.temporada}</div>
                      <div className="text-[10px] text-neutral-500">
                        {t.rango}
                        {t.nota && ` · ${t.nota}`}
                      </div>
                    </td>
                    <td className="py-1 text-right">
                      <div
                        className="tabular-nums text-neutral-600"
                        title={t.casas.map((c) => (c === "Maiten" ? "Maitén" : c)).join(", ")}
                      >
                        {t.casas.length} casas
                      </div>
                      <div className="text-[10px] text-neutral-400 tabular-nums">
                        cupo {t.dias_cap}
                      </div>
                    </td>
                    <td className="py-1 text-right tabular-nums">{t.noches} noches</td>
                    <td className="py-1 text-right tabular-nums">{t.ocupacion_pct}%</td>
                    <td className="py-1 text-right tabular-nums">{fmtUSD(t.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Por cabaña: ganancia estimada vs ingresos */}
        <Section
          title="Por cabaña — ingresos vs ganancia estimada"
          hint="Ganancia estimada = ingresos − gastos compartidos prorrateados por noches (estimación). Noches = vendidas / disponibles en el año: año completo menos septiembre (uso familiar); Maiten solo verano (60); Ruca Chico no tiene cupo propio (misma casa que Ruca, sus noches cuentan en Ruca)."
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cabanas} margin={{ left: 10, right: 10 }}>
              <XAxis dataKey="cabin" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmtUSD(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ingresos" name="Ingresos" fill="#15803d" />
              <Bar dataKey="ganancia_est" name="Ganancia est." fill="#0e7490" />
            </BarChart>
          </ResponsiveContainer>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500">
                <th className="py-1">Cabaña</th>
                <th className="py-1 text-right">Noches</th>
                <th className="py-1 text-right">Ocup.</th>
                <th className="py-1 text-right">Tarifa</th>
                <th className="py-1 text-right">Ingresos</th>
                <th className="py-1 text-right">Gan. est.</th>
              </tr>
            </thead>
            <tbody>
              {cabanas.map((c) => (
                <tr key={c.cabin} className="border-b border-neutral-100">
                  <td className="py-1 font-medium">{c.cabin}</td>
                  <td className="py-1 text-right tabular-nums">
                    {c.noches}
                    {c.disponibles !== null && (
                      <span className="text-neutral-400"> / {c.disponibles}</span>
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {c.ocupacion_pct === null ? "—" : `${c.ocupacion_pct}%`}
                  </td>
                  <td className="py-1 text-right tabular-nums">{fmtUSD(c.tarifa_prom)}</td>
                  <td className="py-1 text-right tabular-nums">{fmtUSD(c.ingresos)}</td>
                  <td
                    className={`py-1 text-right font-medium tabular-nums ${
                      c.ganancia_est < 0 ? "text-red-700" : "text-green-800"
                    }`}
                  >
                    {fmtUSD(c.ganancia_est)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* Plataforma */}
        <Section title="Por plataforma" hint="Reservas e ingresos comprometidos por canal.">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={plataformas} layout="vertical" margin={{ left: 20, right: 10 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis type="category" dataKey="platform" tick={{ fontSize: 11 }} width={70} />
              <Tooltip formatter={(v) => fmtUSD(Number(v))} />
              <Bar dataKey="revenue" name="Ingresos" fill="#b45309" />
            </BarChart>
          </ResponsiveContainer>
          <table className="mt-2 w-full border-collapse text-xs">
            <tbody>
              {plataformas.map((p) => (
                <tr key={p.platform} className="border-b border-neutral-100">
                  <td className="py-1 font-medium">{p.platform}</td>
                  <td className="py-1 text-right tabular-nums">{p.reservas} reservas</td>
                  <td className="py-1 text-right tabular-nums">{p.noches} noches</td>
                  <td className="py-1 text-right tabular-nums">{fmtUSD(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* Gastos por grupo */}
        <Section
          title="Gastos por grupo"
          hint="Todas las categorías de Ingresos/Egresos, con las variantes de un mismo servicio sumadas: Luz = CEB + Ruca; Gas = Gas + Ruca + Ruqui + Casero; Agua = Agua + Casero; Sueldos = Casero + Natalia; Limpieza = Casera + Juana + Costo IN/OUT. Lavandería va como grupo propio aunque en la base esté dentro de Gastos Varios, así que acá la barra Gastos Varios la excluye: Gastos Varios + Lavandería = el total de la torta de desglose."
        >
          {barrasH(gastosGrupo)}
        </Section>

        {/* Gastos Varios desglosado — con desglose al clickear */}
        <Section
          title="Gastos Varios — desglose"
          hint="Clasificado automáticamente por la descripción (aproximado). Clickeá una porción para ver fecha, descripción y total de los movimientos que la componen."
        >
          <GastosVariosDrill rows={gastosVariosRows} />
        </Section>

        {/* Métodos de pago */}
        <Section
          title="Ingresos por método de pago"
          hint="Sale de transactions.payment_method, que es texto libre escrito a mano (35 variantes), así que la separación es aproximada. Efectivo / USD incluye los movimientos que solo dicen un nombre (Carlos, aline, Mica, nati)."
        >
          {pie(metodos)}
        </Section>
      </div>
    </div>
  );
}
