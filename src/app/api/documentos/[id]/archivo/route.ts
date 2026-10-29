import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/data";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Abre el archivo original con un enlace firmado de corta duración. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/documentos/[id]/archivo">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Documento no válido." }, { status: 400 });

  const { supabase, householdId } = await getContext();
  const { data: doc } = await supabase
    .from("imports")
    .select("file_path")
    .eq("id", id)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const { data } = await supabase.storage.from("documentos").createSignedUrl(doc.file_path, 60);
  if (!data?.signedUrl) return NextResponse.json({ error: "No disponible." }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
