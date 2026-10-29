import { ArrowLeft, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTransaction, updateTransaction } from "@/app/actions";
import { ConfirmSubmit } from "@/components/form-bits";
import { TransactionForm } from "@/components/transaction-form";
import { PageTitle } from "@/components/ui";
import { getAccounts, getCategories, getTransaction } from "@/lib/data";
import { todayInChile } from "@/lib/dates";

export const metadata: Metadata = { title: "Editar movimiento" };

export default async function EditTransactionPage({ params }: PageProps<"/movimientos/[id]">) {
  const { id } = await params;
  const [transaction, accounts, categories] = await Promise.all([
    /^[0-9a-f-]{36}$/i.test(id) ? getTransaction(id) : null,
    getAccounts(true),
    getCategories(true),
  ]);
  if (!transaction) notFound();

  // Muestra la cuenta aunque esté archivada, pero no ofrece otras archivadas
  const selectable = accounts.filter((a) => !a.archived || a.id === transaction.account_id);

  return (
    <>
      <Link href="/movimientos" className="mb-2 inline-flex items-center gap-1 text-sm text-muted">
        <ArrowLeft className="size-4" /> Movimientos
      </Link>
      <PageTitle>Editar movimiento</PageTitle>
      <TransactionForm
        accounts={selectable}
        categories={categories}
        action={updateTransaction}
        today={todayInChile()}
        transaction={transaction}
      />
      <form action={deleteTransaction} className="mt-4">
        <input type="hidden" name="id" value={transaction.id} />
        <ConfirmSubmit
          message="¿Borrar este movimiento? No se puede deshacer."
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-danger/40 py-3 font-semibold text-danger"
        >
          <Trash2 className="size-4" /> Borrar movimiento
        </ConfirmSubmit>
      </form>
    </>
  );
}
