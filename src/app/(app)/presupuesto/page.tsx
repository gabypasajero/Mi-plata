import { Wand2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { autoAssign } from "@/app/actions";
import { SubmitButton } from "@/components/form-bits";
import { MonthSwitcher } from "@/components/month-switcher";
import { Card, LEVEL_STYLES, Money, PageTitle, ProgressBar } from "@/components/ui";
import { LEVELS } from "@/lib/budget";
import { getHousehold, getMonthSummary } from "@/lib/data";
import { parseMonthParam, todayInChile } from "@/lib/dates";
import { formatCLP } from "@/lib/money";
import { AssignInput, MoveMoneyForm } from "./budget-forms";

export const metadata: Metadata = { title: "Presupuesto" };

export default async function BudgetPage({ searchParams }: PageProps<"/presupuesto">) {
  const params = await searchParams;
  const month = parseMonthParam(params.mes, todayInChile());
  const [summary, household] = await Promise.all([getMonthSummary(month), getHousehold()]);
  const { envelopes } = summary;

  // "Cubrir" un sobre en rojo: propone moverlo desde el Opcional con más saldo
  const coverId = typeof params.cubrir === "string" ? params.cubrir : undefined;
  const toCover = envelopes.find((e) => e.categoryId === coverId && e.available < 0);
  const bestOptional = envelopes
    .filter((e) => e.level === 3 && e.available > 0 && e.categoryId !== coverId)
    .sort((a, b) => b.available - a.available)[0];
  const moveDefaults = toCover
    ? { to: toCover.categoryId, from: bestOptional?.categoryId, amount: -toCover.available }
    : {};

  const hasHistory = summary.previousAssigned.size > 0;

  return (
    <>
      <PageTitle>Presupuesto</PageTitle>
      <MonthSwitcher month={month} basePath="/presupuesto" />

      <Card className="mb-4">
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <p className="text-muted">Ingresos</p>
            <Money amount={summary.income} className="font-semibold" />
          </div>
          <div>
            <p className="text-muted">Asignado</p>
            <Money amount={summary.assignedTotal} className="font-semibold" />
          </div>
          <div>
            <p className="text-muted">Por asignar</p>
            <Money
              amount={summary.toAssign}
              className={`font-bold ${summary.toAssign > 0 ? "text-brand" : summary.toAssign < 0 ? "text-danger" : ""}`}
            />
          </div>
        </div>

        {summary.toAssign > 0 && (
          <form action={autoAssign} className="mt-4">
            <input type="hidden" name="month" value={month} />
            <SubmitButton
              pendingText="Repartiendo…"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-on-brand disabled:opacity-60"
            >
              <Wand2 className="size-5" /> Repartir {formatCLP(summary.toAssign)} automáticamente
            </SubmitButton>
            <p className="mt-2 text-center text-xs text-muted">
              {hasHistory
                ? "Llena Esencial e Importante hasta lo del mes pasado; Opcional recibe lo que queda."
                : `Primer mes: usa tu plantilla ${household.split_esencial}/${household.split_importante}/${household.split_opcional}.`}
            </p>
          </form>
        )}
        {summary.income === 0 && (
          <p className="mt-3 text-center text-sm text-muted">
            Registra un <Link href="/agregar?tipo=ingreso" className="font-medium text-brand underline">ingreso</Link> para tener plata que repartir.
          </p>
        )}
      </Card>

      <div className="space-y-5">
        {LEVELS.map(({ level, name, hint }) => {
          const group = envelopes.filter((e) => e.level === level);
          if (group.length === 0) return null;
          const assigned = group.reduce((s, e) => s + e.assigned, 0);
          const available = group.reduce((s, e) => s + e.available, 0);
          const style = LEVEL_STYLES[level];
          return (
            <section key={level}>
              <div className="mb-2 flex items-end justify-between">
                <div>
                  <h2 className={`flex items-center gap-2 font-bold ${style.text}`}>
                    <span className={`size-2.5 rounded-full ${style.dot}`} /> {level}. {name}
                  </h2>
                  <p className="text-xs text-muted">{hint}</p>
                </div>
                <p className="text-right text-xs text-muted">
                  Asignado {formatCLP(assigned)}
                  <br />
                  Disponible <span className={available < 0 ? "text-danger" : ""}>{formatCLP(available)}</span>
                </p>
              </div>
              <Card className="divide-y divide-border py-1">
                {group.map((e) => (
                  <div key={e.categoryId} className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{e.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{e.name}</p>
                        <p className={`text-sm ${e.available < 0 ? "font-semibold text-danger" : "text-muted"}`}>
                          {e.available < 0 ? "Pasado por " : "Quedan "}
                          {formatCLP(Math.abs(e.available))}
                        </p>
                      </div>
                      <AssignInput key={`${e.categoryId}-${e.assigned}`} envelope={e} month={month} />
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={e.spent} max={e.assigned} color={style.bar} />
                    </div>
                    {e.available < 0 && (
                      <Link
                        href={`/presupuesto?mes=${month.slice(0, 7)}&cubrir=${e.categoryId}#mover`}
                        className="mt-2 inline-block text-sm font-semibold text-danger underline"
                      >
                        Cubrir desde un sobre Opcional →
                      </Link>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          );
        })}
      </div>

      <Card className="mt-6">
        <h2 className="mb-1 font-bold">Mover plata entre sobres</h2>
        <p className="mb-3 text-sm text-muted">
          {toCover
            ? `Cubre los ${formatCLP(-toCover.available)} que faltan en ${toCover.icon} ${toCover.name}.`
            : "Si un sobre se queda corto, pásale plata de otro."}
        </p>
        <MoveMoneyForm key={coverId ?? "mover"} envelopes={envelopes} month={month} defaults={moveDefaults} />
      </Card>
    </>
  );
}
