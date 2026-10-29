"use client";

import { Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { acceptInvite, createCategory, createInvite, updateCategory, updateHousehold } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { inputClass, labelClass } from "@/components/ui";
import type { Household } from "@/lib/types";

const smallButton = "rounded-xl bg-brand px-4 py-2.5 font-semibold text-on-brand disabled:opacity-60";

export function HouseholdForm({ household }: { household: Household }) {
  const [state, action] = useActionState(updateHousehold, null);
  const [split, setSplit] = useState([household.split_esencial, household.split_importante, household.split_opcional]);
  const total = split.reduce((a, b) => a + b, 0);
  const names = [
    ["split_esencial", "Esencial"],
    ["split_importante", "Importante"],
    ["split_opcional", "Opcional"],
  ] as const;

  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="household-name" className={labelClass}>Nombre del hogar</label>
        <input id="household-name" name="name" defaultValue={household.name} maxLength={60} required className={inputClass} />
      </div>
      <fieldset>
        <legend className={labelClass}>Plantilla de reparto del primer mes</legend>
        <div className="grid grid-cols-3 gap-2">
          {names.map(([field, label], i) => (
            <label key={field} className="text-xs text-muted">
              {label}
              <div className="flex items-center gap-1">
                <input
                  name={field}
                  type="number"
                  min={0}
                  max={100}
                  value={split[i]}
                  onChange={(e) => setSplit(split.map((v, j) => (j === i ? Number(e.target.value) : v)))}
                  className={inputClass}
                />
                %
              </div>
            </label>
          ))}
        </div>
        <p className={`mt-1 text-xs ${total === 100 ? "text-muted" : "text-danger"}`}>Suma: {total}% (debe ser 100%)</p>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton className={smallButton}>Guardar</SubmitButton>
    </form>
  );
}

export function InviteBox() {
  const [invite, createAction] = useActionState(createInvite, null);
  const [joinState, joinAction] = useActionState(acceptInvite, null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <form action={createAction} className="space-y-2">
        <p className="text-sm text-muted">Comparte cuentas y sobres con tu familia. El código sirve 7 días y una sola vez.</p>
        {invite?.ok ? (
          <div className="flex items-center justify-between rounded-xl bg-brand-soft px-4 py-3">
            <span className="font-mono text-2xl font-bold tracking-widest text-brand-strong">{invite.message}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(invite.message).then(() => setCopied(true))}
              className="flex items-center gap-1 text-sm font-medium text-brand-strong"
            >
              <Copy className="size-4" /> {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        ) : (
          <>
            <FormMessage state={invite} />
            <SubmitButton className={smallButton} pendingText="Creando…">Crear código de invitación</SubmitButton>
          </>
        )}
      </form>

      <form action={joinAction} className="space-y-2 border-t border-border pt-4">
        <label htmlFor="code" className={labelClass}>¿Te invitaron? Escribe el código</label>
        <div className="flex gap-2">
          <input id="code" name="code" maxLength={8} required className={`${inputClass} font-mono uppercase tracking-widest`} placeholder="ABCD1234" />
          <SubmitButton className={smallButton} pendingText="…">Unirme</SubmitButton>
        </div>
        <FormMessage state={joinState} />
      </form>
    </div>
  );
}

export function CategoryForm() {
  const [kind, setKind] = useState<"gasto" | "ingreso">("gasto");
  const [formKey, setFormKey] = useState(0);
  const [state, action] = useActionState(async (prev: Parameters<typeof createCategory>[0], fd: FormData) => {
    const result = await createCategory(prev, fd);
    if (result?.ok) setFormKey((k) => k + 1);
    return result;
  }, null);

  return (
    <form key={formKey} action={action} className="space-y-3">
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        <div>
          <label htmlFor="icon" className={labelClass}>Ícono</label>
          <input id="icon" name="icon" defaultValue="🏷️" maxLength={8} className={`${inputClass} text-center text-xl`} />
        </div>
        <div>
          <label htmlFor="category-name" className={labelClass}>Nombre</label>
          <input id="category-name" name="name" required maxLength={40} className={inputClass} placeholder="Ej: Mascotas" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="kind" className={labelClass}>Tipo</label>
          <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "gasto" | "ingreso")} className={inputClass}>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>
        </div>
        {kind === "gasto" && (
          <div>
            <label htmlFor="priority_level" className={labelClass}>Prioridad</label>
            <select id="priority_level" name="priority_level" defaultValue="3" className={inputClass}>
              <option value="1">1. Esencial</option>
              <option value="2">2. Importante</option>
              <option value="3">3. Opcional</option>
            </select>
          </div>
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton className={smallButton}>Agregar categoría</SubmitButton>
    </form>
  );
}

/** Cambia la prioridad de una categoría apenas eliges otra opción. */
export function PrioritySelect({ id, level }: { id: string; level: number }) {
  return (
    <form action={updateCategory}>
      <input type="hidden" name="id" value={id} />
      <select
        name="priority_level"
        defaultValue={String(level)}
        aria-label="Prioridad"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-border bg-surface px-2 py-1 text-sm"
      >
        <option value="1">Esencial</option>
        <option value="2">Importante</option>
        <option value="3">Opcional</option>
      </select>
    </form>
  );
}
