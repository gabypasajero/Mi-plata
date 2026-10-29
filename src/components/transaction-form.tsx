"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import { normalizeText, parseQuickEntry, suggestCategoryName } from "@/lib/quick-entry";
import type { Account, Category, FormState, Transaction } from "@/lib/types";
import { FormMessage, SubmitButton } from "./form-bits";
import { inputClass, labelClass } from "./ui";

type Kind = "gasto" | "ingreso";
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function TransactionForm({ accounts, categories, action, today, transaction, defaultKind = "gasto" }: {
  accounts: Account[];
  categories: Category[];
  action: Action;
  today: string;
  transaction?: Transaction;
  defaultKind?: Kind;
}) {
  const editing = Boolean(transaction);
  const [kind, setKind] = useState<Kind>(transaction ? (transaction.amount > 0 ? "ingreso" : "gasto") : defaultKind);
  const [quick, setQuick] = useState("");
  const [amount, setAmount] = useState(transaction ? String(Math.abs(transaction.amount)) : "");
  const [merchant, setMerchant] = useState(transaction?.merchant ?? "");
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? "");
  const [accountId, setAccountId] = useState(transaction?.account_id ?? accounts[0]?.id ?? "");
  const [date, setDate] = useState(transaction?.date ?? today);
  const [note, setNote] = useState(transaction?.note ?? "");
  const [installment, setInstallment] = useState(transaction?.installment ?? "");

  const [state, formAction] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await action(prev, fd);
    if (result?.ok && !editing) {
      // Deja la cuenta y el tipo para registrar varios seguidos
      setQuick("");
      setAmount("");
      setMerchant("");
      setCategoryId("");
      setNote("");
      setInstallment("");
      setDate(today);
    }
    return result;
  }, null);

  const visible = categories.filter((c) => c.kind === kind && (!c.archived || c.id === categoryId));
  const account = accounts.find((a) => a.id === accountId);

  function onQuickChange(text: string) {
    setQuick(text);
    const parsed = parseQuickEntry(text);
    const nextKind: Kind = parsed.isIncome ? "ingreso" : "gasto";
    setKind(nextKind);
    if (parsed.amount) setAmount(String(parsed.amount));
    setMerchant(parsed.description);
    const suggested = suggestCategoryName(parsed.description);
    const match = categories.find(
      (c) =>
        c.kind === nextKind &&
        !c.archived &&
        (normalizeText(c.name) === normalizeText(suggested ?? "") || normalizeText(c.name) === normalizeText(parsed.description)),
    );
    setCategoryId(match?.id ?? "");
  }

  if (accounts.length === 0) {
    return <p className="text-muted">Primero crea una cuenta en la pestaña Cuentas.</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      {transaction && <input type="hidden" name="id" value={transaction.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="category_id" value={categoryId} />

      <div className="grid grid-cols-2 rounded-xl bg-surface-muted p-1 font-semibold">
        {(["gasto", "ingreso"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setCategoryId("");
            }}
            className={`rounded-lg py-2 ${kind === k ? (k === "gasto" ? "bg-surface shadow-sm" : "bg-brand text-on-brand shadow-sm") : "text-muted"}`}
          >
            {k === "gasto" ? "Gasto" : "Ingreso"}
          </button>
        ))}
      </div>

      {!editing && (
        <div>
          <label htmlFor="quick" className={`${labelClass} flex items-center gap-1`}>
            <Sparkles className="size-4 text-brand" /> Escribe rápido
          </label>
          <input
            id="quick"
            value={quick}
            onChange={(e) => onQuickChange(e.target.value)}
            placeholder='Ej: "café 2500", "uber 4.500", "+850000 sueldo"'
            className={inputClass}
            autoComplete="off"
          />
        </div>
      )}

      <div>
        <label htmlFor="amount" className={labelClass}>Monto</label>
        <div className="flex items-center rounded-2xl border border-border bg-surface px-4 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
          <span className={`text-3xl font-bold ${kind === "ingreso" ? "text-brand" : "text-muted"}`}>{kind === "ingreso" ? "+$" : "$"}</span>
          <input
            id="amount"
            name="amount"
            inputMode="numeric"
            required
            value={groupThousands(amount)}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder="0"
            className="w-full bg-transparent px-2 py-3 text-4xl font-bold tabular-nums outline-none"
            autoComplete="off"
          />
        </div>
      </div>

      <fieldset>
        <legend className={labelClass}>Categoría</legend>
        <div className="grid grid-cols-4 gap-2">
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id === categoryId ? "" : c.id)}
              aria-pressed={c.id === categoryId}
              className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center text-[11px] leading-tight transition ${
                c.id === categoryId ? "border-brand bg-brand-soft font-semibold text-brand-strong" : "border-border bg-surface"
              }`}
            >
              <span className="text-2xl">{c.icon}</span>
              <span className="line-clamp-2">{c.name}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="account_id" className={labelClass}>Cuenta</label>
          <select id="account_id" name="account_id" value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="date" className={labelClass}>Fecha</label>
          <input id="date" name="date" type="date" value={date} max="2100-12-31" onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className={account?.type === "credito" ? "col-span-2" : "col-span-3"}>
          <label htmlFor="merchant" className={labelClass}>Comercio o detalle</label>
          <input id="merchant" name="merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={80} className={inputClass} placeholder="Ej: Lider" />
        </div>
        {account?.type === "credito" && (
          <div>
            <label htmlFor="installment" className={labelClass}>Cuotas</label>
            <input id="installment" name="installment" value={installment} onChange={(e) => setInstallment(e.target.value)} placeholder="1/3" className={inputClass} />
          </div>
        )}
      </div>

      <div>
        <label htmlFor="note" className={labelClass}>Nota (opcional)</label>
        <input id="note" name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} className={inputClass} />
      </div>

      <FormMessage state={state} />
      <SubmitButton className="w-full rounded-2xl bg-brand py-3.5 text-lg font-bold text-on-brand shadow-lg shadow-brand/20 disabled:opacity-60">
        {editing ? "Guardar cambios" : kind === "gasto" ? "Guardar gasto" : "Guardar ingreso"}
      </SubmitButton>
    </form>
  );
}
