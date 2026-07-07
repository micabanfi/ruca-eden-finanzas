import Link from "next/link";
import HoldersBox from "@/components/HoldersBox";
import SantanderBox from "@/components/SantanderBox";
import TransactionsTables from "@/components/TransactionsTables";
import ExpenseForm from "@/components/forms/ExpenseForm";
import IncomeForm from "@/components/forms/IncomeForm";
import { getCuentaMovimientos, getCuentaSaldo, getSaldoInicial } from "@/db/cuenta";
import {
  getCategories,
  getEntregas,
  getHolderBalances,
  getPendingCobros,
  getTransactionsByYear,
  getYears,
} from "@/db/transactions";
import { readWithRetry } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // serverless: cortar a los 30s, no a los 300

export default async function IngresosEgresosPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const [years, categories, balances, entregas, cuentaSaldo, cuentaMovs, saldoInicial] =
    await Promise.all([
      readWithRetry(() => getYears()),
      readWithRetry(() => getCategories()),
      readWithRetry(() => getHolderBalances()),
      readWithRetry(() => getEntregas()),
      readWithRetry(() => getCuentaSaldo()),
      readWithRetry(() => getCuentaMovimientos()),
      readWithRetry(() => getSaldoInicial()),
    ]);
  const current = new Date().getFullYear();
  const year = Number(params.year) || (years.includes(current) ? current : years.at(-1)!);
  const [txs, pendientes] = await Promise.all([
    readWithRetry(() => getTransactionsByYear(year)),
    readWithRetry(() => getPendingCobros(year)),
  ]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {years.map((y) => (
          <Link
            key={y}
            href={`/ingresos-egresos?year=${y}`}
            className={`rounded px-3 py-1 text-sm ${
              y === year
                ? "bg-green-800 font-semibold text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {y}
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2">
        <HoldersBox balances={balances} entregas={entregas} />
        <SantanderBox saldo={cuentaSaldo} movimientos={cuentaMovs} saldoInicial={saldoInicial} />
      </div>
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <IncomeForm />
        <ExpenseForm categories={categories} />
      </div>
      <TransactionsTables txs={txs} pendientes={pendientes} categories={categories} />
    </div>
  );
}
