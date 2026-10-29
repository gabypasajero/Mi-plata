"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/types";
import { buttonClass } from "./ui";

export function SubmitButton({ children, className = buttonClass, pendingText = "Guardando…" }: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={`rounded-xl px-3 py-2 text-sm ${state.ok ? "bg-brand-soft text-brand-strong" : "bg-danger-soft text-danger"}`}
    >
      {state.message}
    </p>
  );
}

/** Botón de envío que pide confirmación antes de una acción que no se puede deshacer. */
export function ConfirmSubmit({ children, message, className }: { children: ReactNode; message: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
