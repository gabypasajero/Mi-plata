import { FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
      <Link
        href="/subir"
        className="mb-5 flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 text-brand-strong"
      >
        <FileUp className="size-6 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Subir boleta, cartola o Excel</span>
          <span className="block text-sm">La IA lee el documento y propone los movimientos</span>
        </span>
        <span aria-hidden>→</span>
      </Link>
      <TransactionForm
        accounts={accounts}
        categories={categories}
        action={createTransaction}
        today={todayInChile()}
        defaultKind={tipo === "ingreso" ? "ingreso" : "gasto"}
      />
    </>
  );
}
