"use client";

import { Camera, CheckCircle2, FileUp, Loader2, TriangleAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createImport } from "@/app/document-actions";
import { secondaryButtonClass } from "@/components/ui";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents/kinds";
import { createClient } from "@/lib/supabase/browser";

type Status = "preparando" | "subiendo" | "leyendo" | "listo" | "no_financiero" | "error";
type Entry = { key: string; name: string; status: Status; message?: string };

const SUPPORTED_IMAGES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIDE = 2400;

/** Achica fotos grandes y convierte formatos que la IA no lee (HEIC del iPhone) a JPG. */
async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const needsConversion = !SUPPORTED_IMAGES.includes(file.type);
  if (!needsConversion && file.size < 1.5 * 1024 * 1024) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (needsConversion) throw new Error("No pudimos abrir esta imagen. Conviértela a JPG o PNG y vuelve a subirla.");
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

export function Uploader() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Entry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  async function handleOne(original: File, key: string) {
    try {
      const file = await prepareFile(original);
      update(key, { status: "subiendo" });
      const created = await createImport({ name: file.name, type: file.type, size: file.size });
      if (!created.ok) return update(key, { status: "error", message: created.message });

      const { error } = await createClient()
        .storage.from("documentos")
        .upload(created.path, file, { contentType: created.mime, upsert: false });
      if (error) return update(key, { status: "error", message: "No se pudo subir el archivo. Revisa tu conexión." });

      update(key, { status: "leyendo" });
      const response = await fetch(`/api/documentos/${created.id}/procesar`, { method: "POST" });
      const result = (await response.json().catch(() => null)) as { status?: string; message?: string; duplicates?: number } | null;
      if (!result?.status) return update(key, { status: "error", message: "No pudimos leer el documento." });
      const extra = result.duplicates
        ? ` ${result.duplicates} ${result.duplicates === 1 ? "ya estaba registrado" : "ya estaban registrados"}.`
        : "";
      update(key, {
        status: result.status === "por_revisar" ? "listo" : result.status === "no_financiero" ? "no_financiero" : "error",
        message: (result.message ?? "") + extra,
      });
    } catch (error) {
      update(key, { status: "error", message: error instanceof Error ? error.message : "Algo falló." });
    }
  }

  async function handleFiles(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const added = list.map((f) => ({ key: crypto.randomUUID(), name: f.name, status: "preparando" as Status }));
    setEntries((prev) => [...added, ...prev]);
    setBusy(true);
    // De a uno: la lectura con IA es lo lento y así no saturamos al servidor
    for (const [i, file] of list.entries()) await handleOne(file, added[i].key);
    setBusy(false);
    router.refresh();
  }

  const ready = entries.filter((e) => e.status === "listo").length;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragging ? "border-brand bg-brand-soft" : "border-border bg-surface"
        }`}
      >
        <FileUp className="mx-auto size-10 text-brand" />
        <p className="mt-2 font-semibold">Arrastra tus archivos aquí</p>
        <p className="text-sm text-muted">Boletas, facturas, cartolas, Excel o CSV del banco, comprobantes, liquidaciones…</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-semibold text-on-brand disabled:opacity-60"
          >
            <Camera className="size-5" /> Tomar foto
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className={`${secondaryButtonClass} py-3`}>
            <FileUp className="size-5" /> Elegir archivos
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {entries.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {entries.map((e) => (
            <li key={e.key} className="flex items-start gap-3 p-3" data-status={e.status}>
              <StatusIcon status={e.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{e.name}</p>
                <p className={`text-sm ${e.status === "error" ? "text-danger" : "text-muted"}`}>
                  {e.message ?? LABELS[e.status]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {ready > 0 && !busy && (
        <Link
          href="/revisar"
          className="block rounded-2xl bg-brand py-3.5 text-center text-lg font-bold text-on-brand shadow-lg shadow-brand/20"
        >
          Revisar y agregar movimientos →
        </Link>
      )}
    </div>
  );
}

const LABELS: Record<Status, string> = {
  preparando: "Preparando…",
  subiendo: "Subiendo…",
  leyendo: "Leyendo con IA… (puede tardar hasta un minuto)",
  listo: "Listo para revisar",
  no_financiero: "No parece un documento financiero",
  error: "No se pudo leer",
};

function StatusIcon({ status }: { status: Status }) {
  if (status === "listo") return <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand" />;
  if (status === "error") return <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />;
  if (status === "no_financiero") return <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" />;
  return <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-muted" />;
}
