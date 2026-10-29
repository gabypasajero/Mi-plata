import type { Metadata } from "next";
import { createTransaction } from "@/app/actions";
import { TransactionForm } from "@/components/transaction-form";
import { PageTitle } from "@/components/ui";
import { getAccounts, getCategories } from "@/lib/data";
import { todayInChile } from "@/lib/dates";

export const metadata: Metadata = { title: "Agregar" };

export default async function AddPage({ searchParams }: PageProps<"/agregar">) {
  const [{ tipo }, accounts, categories] = await Promise.all([searchParams, getAccounts(), getCategories()]);

  return (
    <>
      <PageTitle>Agregar movimiento</PageTitle>
      <TransactionForm
        accounts={accounts}
        categories={categories}
        action={createTransaction}
        today={todayInChile()}
        defaultKind={tipo === "ingreso" ? "ingreso" : "gasto"}
      />
      <p className="mt-6 text-center text-sm text-muted">
        📷 Foto de boleta y 📄 cartolas llegan en la Fase 2 y 3.
      </p>
    </>
  );
}
