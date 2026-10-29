import { NextResponse, type NextRequest } from "next/server";
import { processImport } from "@/lib/documents/process";

// Leer una cartola larga con IA puede tomar sobre un minuto.
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/documentos/[id]/procesar">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Documento no válido." }, { status: 400 });
  const result = await processImport(id);
  return NextResponse.json(result, { status: result.status === "error" ? 422 : 200 });
}
