import Link from "next/link";
import type { Account, Category, Transaction } from "@/lib/types";
import { Money } from "./ui";

export function TransactionRow({ tx, category, account }: {
  tx: Transaction;
  category?: Category;
  account?: Account;
}) {
  const title = tx.merchant || category?.name || (tx.amount > 0 ? "Ingreso" : "Gasto");
  const details = [category && tx.merchant ? category.name : null, account?.name, tx.installment ? `cuota ${tx.installment}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/movimientos/${tx.id}`} className="flex items-center gap-3 py-2.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-xl">
        {category?.icon ?? (tx.amount > 0 ? "💰" : "❔")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-sm text-muted">{details || tx.note || "Sin categoría"}</span>
      </span>
      <Money amount={tx.amount} signed className="font-semibold" />
    </Link>
  );
}
