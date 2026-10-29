import { Search } from "lucide-react";
import type { Metadata } from "next";
import { MonthSwitcher } from "@/components/month-switcher";
import { TransactionRow } from "@/components/transaction-row";
import { Card, EmptyState, inputClass, Money, PageTitle } from "@/components/ui";
import { getAccounts, getCategories, getTransactions } from "@/lib/data";
import { dayLabel, parseMonthParam, todayInChile } from "@/lib/dates";
import type { Transaction } from "@/lib/types";

export const metadata: Metadata = { title: "Movimientos" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function TransactionsPage({ searchParams }: PageProps<"/movimientos">) {
  const params = await searchParams;
  const month = parseMonthParam(params.mes, todayInChile());
  const filters = {
    month,
    accountId: first(params.cuenta),
    categoryId: first(params.categoria),
    q: first(params.q)?.slice(0, 50),
  };

  const [accounts, categories, transactions] = await Promise.all([
    getAccounts(true),
    getCategories(true),
    getTransactions(filters),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const byDay = new Map<string, Transaction[]>();
  for (const tx of transactions) byDay.set(tx.date, [...(byDay.get(tx.date) ?? []), tx]);
  const income = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  return (
    <>
      <PageTitle>Movimientos</PageTitle>
      <MonthSwitcher
        month={month}
        basePath="/movimientos"
        params={{ cuenta: filters.accountId, categoria: filters.categoryId, q: filters.q }}
      />

      <form className="mb-4 space-y-2" action="/movimientos">
        <input type="hidden" name="mes" value={month.slice(0, 7)} />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={filters.q} placeholder="Buscar comercio o nota" className={`${inputClass} pl-9`} />
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <select name="cuenta" defaultValue={filters.accountId ?? ""} className={inputClass} aria-label="Cuenta">
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select name="categoria" defaultValue={filters.categoryId ?? ""} className={inputClass} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <button className="rounded-xl bg-surface-muted px-3 font-medium">Filtrar</button>
        </div>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card>
          <p className="text-sm text-muted">Entradas</p>
          <Money amount={income} signed className="text-lg font-bold" />
        </Card>
        <Card>
          <p className="text-sm text-muted">Salidas</p>
          <Money amount={expenses} className="text-lg font-bold" />
        </Card>
      </div>

      {transactions.length === 0 ? (
        <EmptyState icon="🔍" title="No hay movimientos con estos filtros" />
      ) : (
        <div className="space-y-4">
          {[...byDay].map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-1 text-sm font-semibold text-muted">{dayLabel(day)}</h2>
              <Card className="divide-y divide-border py-1">
                {items.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    category={tx.category_id ? categoryById.get(tx.category_id) : undefined}
                    account={accountById.get(tx.account_id)}
                  />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
