import DashboardCharts from "@/components/DashboardCharts";
import DashboardYearTabs from "@/components/DashboardYearTabs";
import { readWithRetry } from "@/lib/db";
import {
  getGastosPorGrupo,
  getGastosVariosRows,
  getKPIs,
  getMetodosPago,
  getOcupacionSerie,
  getOcupacionTemporadas,
  getPorCabana,
  getPorPlataforma,
  getProyeccionAnual,
  getSerieAnual,
  getSerieMensual,
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

  // OJO: `max` del pool (db.ts) debe ser >= la cantidad de queries de este batch.
  const [kpis, cabanas, metodos, gastosGrupo, gastosVariosRows, plataformas, serieOcupacion] =
    await Promise.all([
      readWithRetry(() => getKPIs(year)),
      readWithRetry(() => getPorCabana(year)),
      readWithRetry(() => getMetodosPago(year)),
      readWithRetry(() => getGastosPorGrupo(year)),
      readWithRetry(() => getGastosVariosRows(year)),
      readWithRetry(() => getPorPlataforma(year)),
      readWithRetry(() => getOcupacionSerie(year)),
    ]);
  const serieAnual = esGlobal ? await readWithRetry(() => getSerieAnual()) : null;
  const [tarifaMes, temporadas, serieMensual] =
    year !== null
      ? await Promise.all([
          readWithRetry(() => getTarifaPorMes(year)),
          readWithRetry(() => getOcupacionTemporadas(year)),
          readWithRetry(() => getSerieMensual(year)),
        ])
      : [null, null, null];
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
        gastosVariosRows={gastosVariosRows}
        plataformas={plataformas}
        alcance={esGlobal ? "(global)" : String(year)}
        serieAnual={serieAnual}
        serieMensual={serieMensual}
        serieOcupacion={serieOcupacion}
        tarifaMes={tarifaMes}
        temporadas={temporadas}
        proyeccion={proyeccion}
      />
    </div>
  );
}
