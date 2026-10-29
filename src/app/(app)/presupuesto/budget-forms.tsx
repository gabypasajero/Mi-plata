"use client";

import { useActionState, useRef, useState } from "react";
import { assignBudget, moveMoney } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { inputClass, labelClass } from "@/components/ui";
import type { Envelope } from "@/lib/budget";

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Campo "Asignado" de un sobre: se guarda solo al salir del campo o con Enter. */
export function AssignInput({ envelope, month }: { envelope: Envelope; month: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(String(envelope.assigned));
  const [saved, setSaved] = useState(String(envelope.assigned));
  const [state, action, pending] = useActionState(assignBudget, null);

  return (
    <form
      ref={formRef}
      action={(fd) => {
        setSaved(value);
        action(fd);
      }}
      className="flex items-center gap-1"
    >
      <input type="hidden" name="category_id" value={envelope.categoryId} />
      <input type="hidden" name="month" value={month} />
      <span className="text-sm text-muted">$</span>
      <input
        name="assigned"
        inputMode="numeric"
        aria-label={`Asignado a ${envelope.name}`}
        value={groupThousands(value)}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 12) || "0")}
        onBlur={() => value !== saved && formRef.current?.requestSubmit()}
        className={`w-28 rounded-lg border bg-surface px-2 py-1 text-right font-semibold tabular-nums outline-none focus:border-brand ${
          state && !state.ok ? "border-danger" : "border-border"
        } ${pending ? "opacity-60" : ""}`}
      />
    </form>
  );
}

export function MoveMoneyForm({ envelopes, month, defaults }: {
  envelopes: Envelope[];
  month: string;
  defaults: { from?: string; to?: string; amount?: number };
}) {
  const [state, action] = useActionState(moveMoney, null);
  return (
    <form action={action} className="space-y-3" id="mover">
      <input type="hidden" name="month" value={month} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="from" className={labelClass}>Desde</label>
          <select id="from" name="from" defaultValue={defaults.from ?? ""} className={inputClass} required>
            <option value="" disabled>Elige…</option>
            {envelopes.map((e) => (
              <option key={e.categoryId} value={e.categoryId}>{e.icon} {e.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="to" className={labelClass}>Hacia</label>
          <select id="to" name="to" defaultValue={defaults.to ?? ""} className={inputClass} required>
            <option value="" disabled>Elige…</option>
            {envelopes.map((e) => (
              <option key={e.categoryId} value={e.categoryId}>{e.icon} {e.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="move-amount" className={labelClass}>Monto</label>
        <input
          id="move-amount"
          name="amount"
          inputMode="numeric"
          required
          defaultValue={defaults.amount ? groupThousands(String(defaults.amount)) : ""}
          className={inputClass}
          placeholder="$0"
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full rounded-xl bg-surface-muted py-2.5 font-semibold">Mover plata</SubmitButton>
    </form>
  );
}
