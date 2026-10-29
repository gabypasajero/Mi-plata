import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  auth: "El enlace no es válido o ya se usó. Intenta entrar de nuevo.",
  google: "No pudimos conectar con Google. Intenta otra vez.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const initialError = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-2xl bg-brand text-3xl text-on-brand shadow-lg shadow-brand/30">
          $
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Mi Plata</h1>
        <p className="mt-1 text-muted">Cada peso con un trabajo. Sabe cuánto puedes gastar hoy.</p>
      </div>
      <LoginForm initialError={initialError} />
    </main>
  );
}
