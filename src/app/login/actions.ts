"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function readCredentials(fd: FormData) {
  return {
    email: String(fd.get("email") ?? "").trim().toLowerCase(),
    password: String(fd.get("password") ?? ""),
  };
}

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const { email, password } = readCredentials(fd);
  if (!email || !password) return { ok: false, message: "Escribe tu correo y contraseña." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const messages: Record<string, string> = {
      invalid_credentials: "Correo o contraseña incorrectos.",
      email_not_confirmed: "Confirma tu correo antes de entrar (revisa tu bandeja).",
      over_request_rate_limit: "Demasiados intentos. Espera un minuto y vuelve a probar.",
    };
    return { ok: false, message: messages[error.code ?? ""] ?? "No pudimos conectar. Intenta de nuevo en un momento." };
  }
  redirect("/");
}

export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const { email, password } = readCredentials(fd);
  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  if (!email) return { ok: false, message: "Escribe tu correo." };
  if (password.length < 8) return { ok: false, message: "La contraseña debe tener al menos 8 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/callback`,
      data: name ? { full_name: name } : undefined,
    },
  });
  if (error) return { ok: false, message: "No se pudo crear la cuenta. ¿Ya estás registrado?" };
  if (data.session) redirect("/");
  return { ok: true, message: "¡Listo! Te enviamos un correo para confirmar tu cuenta." };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}
