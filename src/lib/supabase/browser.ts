"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cliente de Supabase para el navegador (solo para subir archivos directo a Storage). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
