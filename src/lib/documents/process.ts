import "server-only";
import { getAccounts, getCategories, getContext } from "../data";
import { addDays, todayInChile } from "../dates";
import { normalizeText } from "../quick-entry";
import { DOC_TYPE_LABELS, type DocType } from "./extraction";
import { categoryFromRules, findDuplicate, itemsFromExtraction, type MerchantRule } from "./matching";
import { readDocument } from "./reader";
import { DocumentError } from "./to-text";

export type ProcessResult = {
  status: "por_revisar" | "no_financiero" | "error";
  message: string;
  items: number;
  duplicates: number;
};

/** Lee un documento ya subido, propone movimientos y los deja en "Por revisar". */
export async function processImport(importId: string): Promise<ProcessResult> {
  const { supabase, householdId } = await getContext();

  const { data: doc } = await supabase
    .from("imports")
    .select("id, file_path, file_name, mime_type, status")
    .eq("id", importId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!doc) return { status: "error", message: "Documento no encontrado.", items: 0, duplicates: 0 };
  if (doc.status !== "subido" && doc.status !== "error") {
    return { status: "error", message: "Este documento ya fue procesado.", items: 0, duplicates: 0 };
  }

  const fail = async (message: string): Promise<ProcessResult> => {
    await supabase
      .from("imports")
      .update({ status: "error", error: message, processed_at: new Date().toISOString() })
      .eq("id", importId);
    return { status: "error", message, items: 0, duplicates: 0 };
  };

  await supabase.from("imports").update({ status: "procesando", error: null }).eq("id", importId);

  try {
    const { data: blob, error: downloadError } = await supabase.storage.from("documentos").download(doc.file_path);
    if (downloadError || !blob) return await fail("No encontramos el archivo subido. Vuelve a subirlo.");

    const [categories, accounts, rulesRes] = await Promise.all([
      getCategories(),
      getAccounts(),
      supabase.from("merchant_rules").select("pattern, category_id").eq("household_id", householdId),
    ]);
    const today = todayInChile();

    const extraction = await readDocument({
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: doc.mime_type,
      fileName: doc.file_name,
      today,
      expenseCategories: categories.filter((c) => c.kind === "gasto").map((c) => c.name),
      incomeCategories: categories.filter((c) => c.kind === "ingreso").map((c) => c.name),
    });

    const base = {
      doc_type: extraction.tipo_documento,
      issuer: extraction.emisor?.slice(0, 80) ?? null,
      summary: extraction.resumen.slice(0, 500),
      raw_json: extraction,
      processed_at: new Date().toISOString(),
    };

    if (!extraction.es_financiero) {
      await supabase.from("imports").update({ ...base, status: "no_financiero" }).eq("id", importId);
      return { status: "no_financiero", message: extraction.resumen, items: 0, duplicates: 0 };
    }

    const proposed = itemsFromExtraction(extraction, today);
    if (proposed.length === 0) {
      await supabase
        .from("imports")
        .update({ ...base, status: "error", error: "No encontramos movimientos en este documento." })
        .eq("id", importId);
      return { status: "error", message: "No encontramos movimientos en este documento.", items: 0, duplicates: 0 };
    }

    // Categoría: lo que la app aprendió de este hogar manda; si no, la sugerencia de la IA.
    const rules = (rulesRes.data ?? []) as MerchantRule[];
    const categoryByName = new Map(categories.map((c) => [`${c.kind}:${normalizeText(c.name)}`, c.id]));
    const kindById = new Map(categories.map((c) => [c.id, c.kind]));
    const suggestedAccount = suggestAccount(extraction.tipo_documento, accounts);

    // Duplicados: movimientos ya registrados con el mismo monto en fechas cercanas
    const dates = proposed.map((p) => p.date).sort();
    const { data: existing } = await supabase
      .from("transactions")
      .select("id, date, amount, merchant")
      .eq("household_id", householdId)
      .gte("date", addDays(dates[0], -3))
      .lte("date", addDays(dates[dates.length - 1], 3))
      .in("amount", [...new Set(proposed.map((p) => p.amount))])
      .limit(1000);

    let duplicates = 0;
    const rows = proposed.map((item) => {
      const kind = item.amount > 0 ? "ingreso" : "gasto";
      const fromRule = categoryFromRules(item.merchant, rules);
      const fromAi = item.categoryName ? categoryByName.get(`${kind}:${normalizeText(item.categoryName)}`) : undefined;
      const categoryId = fromRule && kindById.get(fromRule) === kind ? fromRule : fromAi ?? null;
      const duplicate = findDuplicate(item, existing ?? []);
      if (duplicate) duplicates += 1;
      return {
        household_id: householdId,
        import_id: importId,
        position: item.position,
        date: item.date,
        merchant: item.merchant,
        description: item.description,
        amount: item.amount,
        installment: item.installment,
        category_id: categoryId,
        account_id: suggestedAccount,
        duplicate_of: duplicate?.id ?? null,
      };
    });

    const { error: insertError } = await supabase.from("import_items").insert(rows);
    if (insertError) return await fail("No pudimos guardar los movimientos leídos. Intenta de nuevo.");

    await supabase.from("imports").update({ ...base, status: "por_revisar" }).eq("id", importId);
    const label = DOC_TYPE_LABELS[extraction.tipo_documento as DocType] ?? "Documento";
    return {
      status: "por_revisar",
      message: `${label}: ${rows.length} ${rows.length === 1 ? "movimiento" : "movimientos"} para revisar.`,
      items: rows.length,
      duplicates,
    };
  } catch (error) {
    if (error instanceof DocumentError) return await fail(error.message);
    console.error("[documentos] error procesando", importId, error);
    return await fail("Algo falló al leer el documento. Intenta de nuevo.");
  }
}

/** Cuenta más probable según el tipo de documento (la persona la puede cambiar al revisar). */
function suggestAccount(docType: string, accounts: { id: string; type: string }[]): string | null {
  const first = (type: string) => accounts.find((a) => a.type === type)?.id ?? null;
  switch (docType) {
    case "cartola_tarjeta":
      return first("credito");
    case "cartola_cuenta":
    case "comprobante_transferencia":
    case "liquidacion_sueldo":
      return first("corriente");
    case "estado_deuda":
      return first("deuda") ?? first("corriente");
    default:
      return first("corriente") ?? first("efectivo");
  }
}
