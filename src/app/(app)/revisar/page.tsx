import { FileUp, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { deleteImport, discardImport } from "@/app/document-actions";
import { ConfirmSubmit } from "@/components/form-bits";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { getAccounts, getCategories, getPendingReview, getRecentImports, type ImportDoc } from "@/lib/data";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/documents/extraction";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Por revisar" };

const STATUS_LABELS: Record<ImportDoc["status"], string> = {
  subido: "Subido, sin leer",
  procesando: "Leyendo…",
  por_revisar: "Por revisar",
  revisado: "Revisado",
  no_financiero: "No es financiero",
  error: "No se pudo leer",
};

export default async function ReviewPage({ searchParams }: PageProps<"/revisar">) {
  const added = Number((await searchParams).agregados);
  const [{ docs, items, duplicates }, accounts, categories, recent] = await Promise.all([
    getPendingReview(),
    getAccounts(),
    getCategories(),
    getRecentImports(),
  ]);
  const duplicateMap = Object.fromEntries(duplicates);

  return (
    <>
      <PageTitle
        action={
          <Link href="/subir" className="inline-flex items-center gap-1 text-sm font-medium text-brand">
            <FileUp className="size-4" /> Subir
          </Link>
        }
      >
        Por revisar
      </PageTitle>

      {added > 0 && (
        <p role="status" className="mb-4 flex items-center justify-between rounded-2xl bg-brand-soft px-4 py-3 text-brand-strong">
          <span className="font-semibold">
            {added} {added === 1 ? "movimiento agregado" : "movimientos agregados"} ✓
          </span>
          <Link href="/movimientos" className="text-sm font-medium underline">Ver movimientos</Link>
        </p>
      )}

      {docs.length === 0 ? (
        <EmptyState icon="✅" title="Nada por revisar">
          Sube una boleta, cartola o Excel del banco y la IA propondrá los movimientos.{" "}
          <Link href="/subir" className="font-medium text-brand underline">Subir documentos</Link>
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {docs.map((doc) => (
            <Card key={doc.id}>
              <ReviewForm
                doc={doc}
                items={items.filter((i) => i.import_id === doc.id)}
                accounts={accounts}
                categories={categories}
                duplicates={duplicateMap}
              />
              <form action={discardImport} className="mt-2 text-center">
                <input type="hidden" name="import_id" value={doc.id} />
                <button className="text-sm text-muted underline">Descartar este documento</button>
              </form>
            </Card>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-bold">Documentos anteriores</h2>
          <Card className="divide-y divide-border py-1">
            {recent.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <a href={`/api/documentos/${doc.id}/archivo`} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
                    {doc.file_name}
                  </a>
                  <p className={`truncate text-sm ${doc.status === "error" ? "text-danger" : "text-muted"}`}>
                    {STATUS_LABELS[doc.status]}
                    {doc.doc_type && doc.status === "revisado" ? ` · ${DOC_TYPE_LABELS[doc.doc_type as DocType] ?? ""}` : ""}
                    {doc.status === "error" && doc.error ? ` · ${doc.error}` : ""}
                    {doc.status === "no_financiero" && doc.summary ? ` · ${doc.summary}` : ""}
                  </p>
                </div>
                <form action={deleteImport}>
                  <input type="hidden" name="import_id" value={doc.id} />
                  <ConfirmSubmit
                    message="¿Borrar este documento? Los movimientos que ya agregaste se mantienen."
                    className="rounded-lg p-1.5 text-muted hover:bg-surface-muted"
                  >
                    <Trash2 className="size-4" aria-label="Borrar documento" />
                  </ConfirmSubmit>
                </form>
              </div>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}
