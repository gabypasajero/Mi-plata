import { ArrowRight, CalendarClock } from "lucide-react";
import Link from "next/link";
import { TransactionRow } from "@/components/transaction-row";
import { Card, EmptyState, Money, ProgressBar } from "@/components/ui";
import { getAccounts, getCategories, getContext, getMonthSummary, getRecentTransactions } from "@/lib/data";
import { dayLabel, daysBetween, monthLabel, monthStart, nextDueDate, todayInChile } from "@/lib/dates";
import { formatCLP } from "@/lib/money";

export default async function HomePage() {
  const today = todayInChile();
  const month = monthStart(today);
  const [{ displayName }, summary, accounts, categories, recent] = await Promise.all([
    getContext(),
    getMonthSummary(month),
    getAccounts(),
    getCategories(true),
    getRecentTransactions(5),
  ]);

  const liquid = accounts.filter((a) => a.type === "efectivo" || a.type === "corriente");
  const debts = accounts.filter((a) => a.type === "credito" || a.type === "deuda");
  const cash = liquid.reduce((s, a) => s + a.balance, 0);
  const owed = debts.reduce((s, a) => s + Math.min(0, a.balance), 0);

  const upcoming = debts
    .filter((a) => a.due_day && a.balance < 0)
    .map((a) => ({ account: a, date: nextDueDate(today, a.due_day!) }))
    .filter(({ date }) => daysBetween(today, date) <= 7)
    .sort((a, b) => a.date.localeCompare(b.date));

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const optionalLeft = summary.envelopes.filter((e) => e.level === 3).reduce((s, e) => s + e.available, 0);
  const isNew = recent.length === 0 && summary.assignedTotal === 0;

  return (
    <div className="space-y-4">
      <p className="text-muted">
        Hola{displayName ? `, ${displayName}` : ""} 👋 · {dayLabel(today)}
      </p>

      <Card className="bg-gradient-to-br from-brand to-brand-strong text-on-brand border-0">
        <p className="text-sm font-medium text-on-brand/80">Puedes gastar hoy</p>
        <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums">{formatCLP(summary.canSpendToday)}</p>
        <p className="mt-2 text-sm text-on-brand/80">
          {formatCLP(Math.max(0, optionalLeft))} en sobres opcionales ÷ {summary.daysLeft}{" "}
          {summary.daysLeft === 1 ? "día" : "días"} que quedan
        </p>
      </Card>

      {summary.toAssign > 0 && (
        <Link href="/presupuesto" className="flex items-center justify-between rounded-2xl bg-brand-soft px-4 py-3 text-brand-strong">
          <span>
            <span className="block text-sm">Tienes plata sin trabajo</span>
            <span className="text-lg font-bold">{formatCLP(summary.toAssign)} por asignar</span>
          </span>
          <ArrowRight className="size-5" />
        </Link>
      )}
      {summary.toAssign < 0 && (
        <Link href="/presupuesto" className="block rounded-2xl bg-danger-soft px-4 py-3 text-danger">
          Asignaste {formatCLP(-summary.toAssign)} más de lo que entró este mes. Ajusta tus sobres →
        </Link>
      )}

      {isNew && (
        <Card>
          <p className="font-semibold">Empecemos en 3 pasos</p>
          <ol className="mt-2 space-y-2 text-sm">
            <li>1. <Link className="font-medium text-brand underline" href="/cuentas">Agrega tus cuentas</Link> (cuenta corriente, tarjeta…)</li>
            <li>2. <Link className="font-medium text-brand underline" href="/agregar?tipo=ingreso">Registra tu sueldo</Link> u otro ingreso</li>
            <li>3. <Link className="font-medium text-brand underline" href="/presupuesto">Reparte en sobres</Link>: Esencial → Importante → Opcional</li>
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-sm text-muted">Saldo disponible</p>
          <Money amount={cash} className="text-xl font-bold" />
        </Card>
        <Card>
          <p className="text-sm text-muted">Deudas y tarjetas</p>
          <Money amount={owed} className={`text-xl font-bold ${owed < 0 ? "text-danger" : ""}`} />
        </Card>
      </div>

      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-semibold">{monthLabel(month)}</p>
          <p className="text-sm text-muted">
            <Money amount={summary.spentTotal} /> de <Money amount={summary.assignedTotal} />
          </p>
        </div>
        <ProgressBar value={summary.spentTotal} max={summary.assignedTotal} />
        <p className="mt-2 text-sm text-muted">
          Ingresos del mes: <Money amount={summary.income} className="font-medium text-foreground" />
        </p>
      </Card>

      {upcoming.length > 0 && (
        <Card>
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <CalendarClock className="size-5 text-warning" /> Próximos pagos (7 días)
          </p>
          <ul className="divide-y divide-border">
            {upcoming.map(({ account, date }) => (
              <li key={account.id} className="flex justify-between py-2 text-sm">
                <span>
                  {account.name} · <span className="text-muted">{dayLabel(date)}</span>
                </span>
                <Money amount={-account.balance} className="font-semibold" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-1 flex items-center justify-between">
          <p className="font-semibold">Últimos movimientos</p>
          <Link href="/movimientos" className="text-sm font-medium text-brand">Ver todos</Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState icon="🧾" title="Aún no hay movimientos">Toca el botón + para registrar el primero.</EmptyState>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                category={tx.category_id ? categoryById.get(tx.category_id) : undefined}
                account={accountById.get(tx.account_id)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
