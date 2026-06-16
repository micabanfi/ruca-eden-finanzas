"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  CabinRow,
  KPIs,
  MesTarifa,
  NamedAmount,
  PlatformRow,
  Proyeccion,
  Temporada,
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

export default function DashboardCharts({
  kpis,
  cabanas,
  metodos,
  gastosGrupo,
  gastosVarios,
  plataformas,
  alcance,
  serieAnual,
  tarifaMes,
  temporadas,
  proyeccion,
}: {
  kpis: KPIs;
  cabanas: CabinRow[];
  metodos: NamedAmount[];
  gastosGrupo: NamedAmount[];
  gastosVarios: NamedAmount[];
  plataformas: PlatformRow[];
  alcance: string;
  serieAnual: YearSerie[] | null; // solo en global
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
            hint="Verano alta (15/12–15/03) · Otoño baja (16/03–jun) · Invierno alta (jul–ago) · Primavera baja (sep–14/12). Sobre 5 casas."
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
                  <tr key={t.temporada} className="border-b border-neutral-100">
                    <td className="py-1 font-medium">{t.temporada}</td>
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
        <Section title="Gastos por grupo" hint="Servicios e impuestos · Sueldos y limpieza · Arreglos/Gastos Varios.">
          {pie(gastosGrupo)}
        </Section>

        {/* Gastos Varios desglosado */}
        <Section
          title="Gastos Varios — desglose"
          hint="Clasificado automáticamente por la descripción (aproximado)."
        >
          {pie(gastosVarios)}
        </Section>

        {/* Métodos de pago */}
        <Section title="Ingresos por método de pago" hint="Dónde entró la plata de los alquileres.">
          {pie(metodos)}
        </Section>
      </div>
    </div>
  );
}
