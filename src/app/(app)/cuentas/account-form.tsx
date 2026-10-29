"use client";

import { useActionState, useState } from "react";
import { createAccount } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { inputClass, labelClass } from "@/components/ui";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/types";

export function AccountForm() {
  const [type, setType] = useState<AccountType>("corriente");
  const [formKey, setFormKey] = useState(0);
  const [state, action] = useActionState(async (prev: Parameters<typeof createAccount>[0], fd: FormData) => {
    const result = await createAccount(prev, fd);
    if (result?.ok) setFormKey((k) => k + 1);
    return result;
  }, null);
  const isDebt = type === "credito" || type === "deuda";

  return (
    <form key={formKey} action={action} className="space-y-3">
      <div>
        <label htmlFor="type" className={labelClass}>Tipo</label>
        <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as AccountType)} className={inputClass}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="name" className={labelClass}>Nombre</label>
        <input id="name" name="name" required maxLength={60} className={inputClass} placeholder={type === "credito" ? "Ej: Visa Banco Estado" : "Ej: CuentaRUT"} />
      </div>
      <div>
        <label htmlFor="opening_balance" className={labelClass}>
          {isDebt ? "¿Cuánto debes hoy?" : "¿Cuánto tienes hoy?"}
        </label>
        <input id="opening_balance" name="opening_balance" inputMode="numeric" className={inputClass} placeholder="$0" />
      </div>
      {type === "credito" && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor="credit_limit" className={labelClass}>Cupo</label>
            <input id="credit_limit" name="credit_limit" inputMode="numeric" className={inputClass} placeholder="$0" />
          </div>
          <div>
            <label htmlFor="billing_day" className={labelClass}>Día factura</label>
            <input id="billing_day" name="billing_day" type="number" min={1} max={31} className={inputClass} />
          </div>
          <div>
            <label htmlFor="due_day" className={labelClass}>Día pago</label>
            <input id="due_day" name="due_day" type="number" min={1} max={31} className={inputClass} />
          </div>
        </div>
      )}
      {type === "deuda" && (
        <div>
          <label htmlFor="due_day" className={labelClass}>Día de pago de la cuota</label>
          <input id="due_day" name="due_day" type="number" min={1} max={31} className={inputClass} />
        </div>
      )}
      <FormMessage state={state} />
      <SubmitButton className="w-full rounded-xl bg-brand py-2.5 font-semibold text-on-brand disabled:opacity-60">Crear cuenta</SubmitButton>
    </form>
  );
}
