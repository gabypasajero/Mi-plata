import { Archive, ArchiveRestore } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { setAccountArchived } from "@/app/actions";
import { Card, Money, PageTitle, ProgressBar } from "@/components/ui";
import { getAccounts } from "@/lib/data";
import { ACCOUNT_TYPES, type Account } from "@/lib/types";
import { AccountForm } from "./account-form";

export const metadata: Metadata = { title: "Cuentas" };

export default async function AccountsPage() {
  const accounts = await getAccounts(true);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const net = active.reduce((s, a) => s + a.balance, 0);

  return (
    <>
      <PageTitle>Cuentas</PageTitle>

      <Card className="mb-4">
        <p className="text-sm text-muted">Patrimonio neto (lo que tienes − lo que debes)</p>
        <Money amount={net} className={`text-3xl font-bold ${net < 0 ? "text-danger" : ""}`} />
      </Card>

      <div className="space-y-4">
        {ACCOUNT_TYPES.map((type) => {
          const group = active.filter((a) => a.type === type.value);
          if (group.length === 0) return null;
          return (
            <section key={type.value}>
              <h2 className="mb-1 text-sm font-semibold text-muted">{type.icon} {type.label}</h2>
              <Card className="divide-y divide-border py-1">
                {group.map((a) => <AccountRow key={a.id} account={a} />)}
              </Card>
            </section>
          );
        })}
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-bold">Agregar cuenta</h2>
        <AccountForm />
      </Card>

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted">Cuentas archivadas ({archived.length})</summary>
          <Card className="mt-2 divide-y divide-border py-1">
            {archived.map((a) => <AccountRow key={a.id} account={a} />)}
          </Card>
        </details>
      )}
    </>
  );
}

function AccountRow({ account: a }: { account: Account }) {
  const used = Math.max(0, -a.balance);
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <Link href={`/movimientos?cuenta=${a.id}`} className="min-w-0 flex-1">
          <p className="truncate font-medium">{a.name}</p>
          {a.type === "credito" && (
            <p className="text-xs text-muted">
              {a.billing_day ? `Factura día ${a.billing_day}` : ""}
              {a.billing_day && a.due_day ? " · " : ""}
              {a.due_day ? `Paga día ${a.due_day}` : ""}
            </p>
          )}
          {a.type === "deuda" && a.due_day && <p className="text-xs text-muted">Cuota día {a.due_day}</p>}
        </Link>
        <Money amount={a.balance} className={`font-semibold ${a.balance < 0 ? "text-danger" : ""}`} />
        <form action={setAccountArchived}>
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="archived" value={String(!a.archived)} />
          <button className="rounded-lg p-1.5 text-muted hover:bg-surface-muted" aria-label={a.archived ? "Restaurar cuenta" : "Archivar cuenta"} title={a.archived ? "Restaurar" : "Archivar"}>
            {a.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          </button>
        </form>
      </div>
      {a.type === "credito" && a.credit_limit ? (
        <div className="mt-2">
          <ProgressBar value={used} max={a.credit_limit} color="bg-level-2" />
          <p className="mt-1 text-xs text-muted">
            Cupo usado <Money amount={used} /> de <Money amount={a.credit_limit} /> · disponible{" "}
            <Money amount={Math.max(0, a.credit_limit - used)} />
          </p>
        </div>
      ) : null}
    </div>
  );
}
