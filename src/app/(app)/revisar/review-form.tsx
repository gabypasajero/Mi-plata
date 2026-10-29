"use client";

import { ExternalLink } from "lucide-react";
import { useActionState, useState } from "react";
import { acceptImportItems } from "@/app/document-actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Money } from "@/components/ui";
import type { ImportDoc, ImportItem } from "@/lib/data";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/documents/extraction";
import { formatCLP } from "@/lib/money";
import type { Account, Category, Transaction } from "@/lib/types";

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const small = "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand";

export function ReviewForm({ doc, items, accounts, categories, duplicates }: {
  doc: ImportDoc;
  items: ImportItem[];
  accounts: Account[];
  categories: Category[];
  duplicates: Record<string, Transaction>;
}) {
  const [state, action] = useActionState(acceptImportItems, null);
  const [included, setIncluded] = useState(() => new Set(items.filter((i) => !i.duplicate_of).map((i) => i.id)));
  const [amounts, setAmounts] = useState(() => Object.fromEntries(items.map((i) => [i.id, String(Math.abs(i.amount))])));
  const suggestedAccount = items.find((i) => i.account_id)?.account_id ?? accounts[0]?.id ?? "";

  const total = items
    .filter((i) => included.has(i.id))
    .reduce((s, i) => s + Math.sign(i.amount) * Number(amounts[i.id] || 0), 0);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="import_id" value={doc.id} />

      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          {DOC_TYPE_LABELS[(doc.doc_type ?? "otro") as DocType] ?? "Documento"}
          {doc.issuer ? ` · ${doc.issuer}` : ""}
        </p>
        <a href={`/api/documentos/${doc.id}/archivo`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline">
          {doc.file_name} <ExternalLink className="size-3.5 text-muted" />
        </a>
        {doc.summary && <p className="mt-1 text-sm text-muted">{doc.summary}</p>}
        {doc.raw_json?.monto_a_pagar ? (
          <p className="mt-1 text-sm">
            A pagar: <strong>{formatCLP(doc.raw_json.monto_a_pagar)}</strong>
            {doc.raw_json.fecha_vencimiento ? ` · vence ${doc.raw_json.fecha_vencimiento}` : ""}
          </p>
        ) : null}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-muted">¿De qué cuenta son estos movimientos?</span>
        <select name="account_id" defaultValue={suggestedAccount} required className={`${small} w-full py-2`}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>

      <ul className="space-y-2">
        {items.map((item) => {
          const duplicate = item.duplicate_of ? duplicates[item.duplicate_of] : undefined;
          const kind = item.amount > 0 ? "ingreso" : "gasto";
          const checked = included.has(item.id);
          return (
            <li key={item.id} className={`rounded-xl border p-3 ${checked ? "border-border bg-surface" : "border-dashed border-border opacity-60"}`}>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="include"
                  value={item.id}
                  checked={checked}
                  aria-label={`Incluir ${item.merchant ?? "movimiento"}`}
                  onChange={(e) => {
                    const next = new Set(included);
                    if (e.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    setIncluded(next);
                  }}
                  className="mt-2 size-5 accent-[var(--brand)]"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input name={`merchant_${item.id}`} defaultValue={item.merchant ?? ""} maxLength={80} aria-label="Comercio" className={`${small} min-w-0 flex-1 font-medium`} />
                    <div className={`flex items-center rounded-lg border border-border px-2 ${kind === "ingreso" ? "text-brand" : ""}`}>
                      <span className="text-sm">{kind === "ingreso" ? "+$" : "-$"}</span>
                      <input
                        name={`amount_${item.id}`}
                        inputMode="numeric"
                        aria-label="Monto"
                        value={groupThousands(amounts[item.id] ?? "")}
                        onChange={(e) => setAmounts({ ...amounts, [item.id]: e.target.value.replace(/\D/g, "").slice(0, 12) })}
                        className="w-24 bg-transparent py-1.5 text-right text-sm font-semibold tabular-nums outline-none"
                      />
                    </div>
                  </div>
                  <select name={`category_${item.id}`} defaultValue={item.category_id ?? ""} aria-label="Categoría" className={`${small} w-full`}>
                    <option value="">Sin categoría</option>
                    {categories.filter((c) => c.kind === kind).map((c) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                  <input type="date" name={`date_${item.id}`} defaultValue={item.date} aria-label="Fecha" className={small} />
                  {(item.installment || item.description) && (
                    <p className="text-xs text-muted">
                      {item.installment ? `Cuota ${item.installment}` : ""}
                      {item.installment && item.description ? " · " : ""}
                      {item.description}
                    </p>
                  )}
                  {duplicate && (
                    <p className="rounded-lg bg-warning/10 px-2 py-1 text-xs text-warning">
                      Posible duplicado: ya registraste {duplicate.merchant ?? "un movimiento"} por{" "}
                      {formatCLP(Math.abs(duplicate.amount))} el {duplicate.date.split("-").reverse().join("-")}. Márcalo solo si es otro.
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <FormMessage state={state} />
      <SubmitButton className="w-full rounded-2xl bg-brand py-3 font-bold text-on-brand disabled:opacity-60" pendingText="Guardando…">
        Agregar {included.size} {included.size === 1 ? "movimiento" : "movimientos"} · <Money amount={total} />
      </SubmitButton>
    </form>
  );
}
