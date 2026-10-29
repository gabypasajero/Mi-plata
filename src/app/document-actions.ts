"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/data";
import { isIsoDate } from "@/lib/dates";
import { detectKind, MAX_FILE_BYTES, safeFileName, storageMime } from "@/lib/documents/kinds";
import { ruleFromMerchant } from "@/lib/documents/matching";
import { parseCLP } from "@/lib/money";
import type { FormState } from "@/lib/types";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type CreatedImport = { ok: true; id: string; path: string; mime: string } | { ok: false; message: string };

/** Registra un documento antes de subirlo; devuelve la ruta en Storage donde va el archivo. */
export async function createImport(file: { name: string; type: string; size: number }): Promise<CreatedImport> {
  const { supabase, householdId } = await getContext();
  const name = String(file.name ?? "").slice(0, 200) || "documento";
  const size = Number(file.size);
  if (!Number.isInteger(size) || size <= 0) return { ok: false, message: "El archivo está vacío." };
  if (size > MAX_FILE_BYTES) return { ok: false, message: "El archivo pesa más de 15 MB." };
  if (!detectKind(String(file.type ?? ""), name)) {
    return { ok: false, message: "Ese tipo de archivo no lo sabemos leer. Sube una foto, PDF, Excel o CSV." };
  }

  const id = crypto.randomUUID();
  const path = `${householdId}/${id}/${safeFileName(name)}`;
  const mime = storageMime(String(file.type ?? ""), name);
  const { error } = await supabase.from("imports").insert({
    id,
    household_id: householdId,
    file_path: path,
    file_name: name,
    mime_type: mime,
    size_bytes: size,
  });
  if (error) return { ok: false, message: "No pudimos registrar el archivo." };
  return { ok: true, id, path, mime };
}

/** Acepta los ítems marcados de un documento (con las correcciones hechas) y aprende las categorías. */
export async function acceptImportItems(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, householdId } = await getContext();
  const importId = String(fd.get("import_id") ?? "");
  if (!UUID_RE.test(importId)) return { ok: false, message: "Documento no válido." };

  const selected = new Set(fd.getAll("include").map(String).filter((id) => UUID_RE.test(id)));
  if (selected.size === 0) return { ok: false, message: "Marca al menos un movimiento." };
  const accountForAll = String(fd.get("account_id") ?? "");
  if (!UUID_RE.test(accountForAll)) return { ok: false, message: "Elige la cuenta de este documento." };

  const { data: original } = await supabase
    .from("import_items")
    .select("id, merchant, category_id, amount")
    .eq("import_id", importId)
    .eq("household_id", householdId)
    .eq("status", "pendiente");
  const originalById = new Map((original ?? []).map((i) => [i.id as string, i]));

  const items = [];
  for (const id of selected) {
    const before = originalById.get(id);
    if (!before) continue;
    const categoryId = String(fd.get(`category_${id}`) ?? "");
    const amountText = String(fd.get(`amount_${id}`) ?? "");
    const amountAbs = amountText ? parseCLP(amountText) : Math.abs(Number(before.amount));
    const date = String(fd.get(`date_${id}`) ?? "");
    if (!amountAbs || amountAbs <= 0) return { ok: false, message: "Hay un monto vacío o en $0." };
    if (date && !isIsoDate(date)) return { ok: false, message: "Hay una fecha no válida." };
    items.push({
      id,
      category_id: UUID_RE.test(categoryId) ? categoryId : null,
      account_id: accountForAll,
      amount: Number(before.amount) > 0 ? amountAbs : -amountAbs,
      date: date || null,
      merchant: String(fd.get(`merchant_${id}`) ?? "").trim().slice(0, 80) || null,
    });
  }
  if (items.length === 0) return { ok: false, message: "Esos movimientos ya fueron revisados." };

  const { data: accepted, error } = await supabase.rpc("accept_import_items", { p_items: items });
  if (error) return { ok: false, message: "No se pudieron guardar. Revisa la cuenta y las categorías." };

  // Lo que se descartó (no marcado) queda descartado y el documento cerrado
  const notSelected = [...originalById.keys()].filter((id) => !selected.has(id));
  if (notSelected.length) {
    await supabase.from("import_items").update({ status: "descartado" }).in("id", notSelected);
  }
  await supabase.from("imports").update({ status: "revisado" }).eq("id", importId).eq("household_id", householdId);

  // La app aprende: comercio → categoría elegida
  const rules = items
    .map((item) => ({ pattern: ruleFromMerchant(item.merchant ?? originalById.get(item.id)?.merchant ?? null), category_id: item.category_id }))
    .filter((r): r is { pattern: string; category_id: string } => Boolean(r.pattern && r.category_id));
  const uniqueRules = [...new Map(rules.map((r) => [r.pattern, r])).values()];
  if (uniqueRules.length) {
    await supabase.from("merchant_rules").upsert(
      uniqueRules.map((r) => ({ ...r, household_id: householdId, updated_at: new Date().toISOString() })),
      { onConflict: "household_id,pattern" },
    );
  }

  revalidatePath("/", "layout");
  // El documento sale de la lista al quedar revisado: la confirmación la muestra la página
  redirect(`/revisar?agregados=${Number(accepted ?? 0)}`);
}

/** Descarta un documento completo sin agregar nada (el archivo se mantiene). */
export async function discardImport(fd: FormData) {
  const { supabase, householdId } = await getContext();
  const importId = String(fd.get("import_id") ?? "");
  if (!UUID_RE.test(importId)) return;
  await supabase
    .from("import_items")
    .update({ status: "descartado" })
    .eq("import_id", importId)
    .eq("household_id", householdId)
    .eq("status", "pendiente");
  await supabase.from("imports").update({ status: "revisado" }).eq("id", importId).eq("household_id", householdId);
  revalidatePath("/", "layout");
}

/** Borra el documento y su archivo. Los movimientos ya agregados se mantienen. */
export async function deleteImport(fd: FormData) {
  const { supabase, householdId } = await getContext();
  const importId = String(fd.get("import_id") ?? "");
  if (!UUID_RE.test(importId)) return;
  const { data: doc } = await supabase
    .from("imports")
    .select("file_path")
    .eq("id", importId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!doc) return;
  await supabase.storage.from("documentos").remove([doc.file_path]);
  await supabase.from("imports").delete().eq("id", importId).eq("household_id", householdId);
  revalidatePath("/", "layout");
}
