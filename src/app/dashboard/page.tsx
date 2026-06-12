import DashboardCharts from "@/components/DashboardCharts";
import DashboardYearTabs from "@/components/DashboardYearTabs";
import {
  getGastosPorGrupo,
  getGastosVariosDetalle,
  getKPIs,
  getMetodosPago,
  getOcupacionTemporadas,
  getPorCabana,
  getPorPlataforma,
  getSerieAnual,
  getTarifaPorMes,
  getYears,
} from "@/db/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const years = await getYears();
  const esGlobal = params.year === "global";
  const year = esGlobal ? null : Number(params.year) || new Date().getFullYear();

  const [kpis, cabanas, metodos, gastosGrupo, gastosVarios, plataformas] = await Promise.all([
    getKPIs(year),
    getPorCabana(year),
    getMetodosPago(year),
    getGastosPorGrupo(year),
    getGastosVariosDetalle(year),
    getPorPlataforma(year),
  ]);
  const serieAnual = esGlobal ? await getSerieAnual() : null;
  const [tarifaMes, temporadas] =
    year !== null
      ? await Promise.all([getTarifaPorMes(year), getOcupacionTemporadas(year)])
      : [null, null];

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
      />
    </div>
  );
}
