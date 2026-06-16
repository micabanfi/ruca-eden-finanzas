import DashboardCharts from "@/components/DashboardCharts";
import DashboardYearTabs from "@/components/DashboardYearTabs";
import { readWithRetry } from "@/lib/db";
import {
  getGastosPorGrupo,
  getGastosVariosDetalle,
  getKPIs,
  getMetodosPago,
  getOcupacionTemporadas,
  getPorCabana,
  getPorPlataforma,
  getProyeccionAnual,
  getSerieAnual,
  getTarifaPorMes,
  getYears,
} from "@/db/dashboard";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // serverless: cortar a los 30s, no a los 300

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const years = await readWithRetry(() => getYears());
  const esGlobal = params.year === "global";
  const year = esGlobal ? null : Number(params.year) || new Date().getFullYear();

  const [kpis, cabanas, metodos, gastosGrupo, gastosVarios, plataformas] = await Promise.all([
    readWithRetry(() => getKPIs(year)),
    readWithRetry(() => getPorCabana(year)),
    readWithRetry(() => getMetodosPago(year)),
    readWithRetry(() => getGastosPorGrupo(year)),
    readWithRetry(() => getGastosVariosDetalle(year)),
    readWithRetry(() => getPorPlataforma(year)),
  ]);
  const serieAnual = esGlobal ? await readWithRetry(() => getSerieAnual()) : null;
  const [tarifaMes, temporadas] =
    year !== null
      ? await Promise.all([
          readWithRetry(() => getTarifaPorMes(year)),
          readWithRetry(() => getOcupacionTemporadas(year)),
        ])
      : [null, null];
  // Proyección fin de año: solo tiene sentido para el año en curso (o futuro).
  const currentYear = new Date().getFullYear();
  const proyeccion =
    year !== null && year >= currentYear
      ? await readWithRetry(() => getProyeccionAnual(year))
      : null;

  return (
    <div className="space-y-3">
      <DashboardYearTabs years={years} current={esGlobal ? "global" : String(year)} />
      <DashboardCharts
        kpis={kpis}
        cabanas={cabanas}
        metodos={metodos}
        gastosGrupo={gastosGrupo}
        gastosVarios={gastosVarios}
        plataformas={plataformas}
        alcance={esGlobal ? "(global)" : String(year)}
        serieAnual={serieAnual}
        tarifaMes={tarifaMes}
        temporadas={temporadas}
        proyeccion={proyeccion}
      />
    </div>
  );
}
