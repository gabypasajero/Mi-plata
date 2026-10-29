"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { inputClass, labelClass, secondaryButtonClass } from "@/components/ui";
import { signIn, signInWithGoogle, signUp } from "./actions";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<"entrar" | "registro">("entrar");
  const [signInState, signInAction] = useActionState(signIn, null);
  const [signUpState, signUpAction] = useActionState(signUp, null);
  const state = mode === "entrar" ? signInState : signUpState;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-xl bg-surface-muted p-1 text-sm font-semibold">
        {(["entrar", "registro"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 ${mode === m ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            {m === "entrar" ? "Entrar" : "Crear cuenta"}
          </button>
        ))}
      </div>

      <form action={mode === "entrar" ? signInAction : signUpAction} className="space-y-3">
        {mode === "registro" && (
          <div>
            <label htmlFor="name" className={labelClass}>Tu nombre</label>
            <input id="name" name="name" autoComplete="given-name" className={inputClass} />
          </div>
        )}
        <div>
          <label htmlFor="email" className={labelClass}>Correo</label>
          <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={mode === "registro" ? 8 : undefined}
            autoComplete={mode === "entrar" ? "current-password" : "new-password"}
            className={inputClass}
          />
        </div>
        <FormMessage state={state ?? (initialError ? { ok: false, message: initialError } : null)} />
        <SubmitButton className="w-full rounded-xl bg-brand py-3 font-semibold text-on-brand disabled:opacity-60" pendingText="Un momento…">
          {mode === "entrar" ? "Entrar" : "Crear mi cuenta"}
        </SubmitButton>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> o <span className="h-px flex-1 bg-border" />
      </div>

      <form action={signInWithGoogle}>
        <button type="submit" className={`${secondaryButtonClass} w-full py-3`}>
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1 2.5-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" />
            <path fill="#34A853" d="M12 23c3 0 5.4-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8C3.9 20.5 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.7 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9l3.6-2.8z" />
            <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.4 2.2 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z" />
          </svg>
          Continuar con Google
        </button>
      </form>
    </div>
  );
}
