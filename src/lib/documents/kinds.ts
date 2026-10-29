/** Tipos de archivo que Mi Plata sabe leer y cómo se los pasamos a la IA. */

export type DocumentKind = "imagen" | "pdf" | "hoja" | "texto";

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // igual que el bucket
export const MAX_TEXT_CHARS = 300_000; // ~1.000 filas de una cartola en CSV

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];

const EXTENSIONS: Record<string, DocumentKind> = {
  jpg: "imagen", jpeg: "imagen", png: "imagen", webp: "imagen", gif: "imagen",
  pdf: "pdf",
  xlsx: "hoja", xls: "hoja",
  csv: "texto", txt: "texto", tsv: "texto", xml: "texto", html: "texto", htm: "texto",
  ofx: "texto", qif: "texto", json: "texto",
};

/** Para el <input type="file" accept="…"> */
export const ACCEPT_ATTRIBUTE = [
  "image/*",
  ...Object.keys(EXTENSIONS).filter((e) => !["jpg", "jpeg", "png", "webp", "gif"].includes(e)).map((e) => `.${e}`),
].join(",");

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

/** Decide cómo leer un archivo por su tipo MIME y, si no es claro, por su extensión. */
export function detectKind(mime: string, fileName: string): DocumentKind | null {
  const type = mime.toLowerCase().split(";")[0].trim();
  if ((IMAGE_MIMES as readonly string[]).includes(type)) return "imagen";
  if (type === "application/pdf") return "pdf";
  if (type.includes("spreadsheetml") || type === "application/vnd.ms-excel") return "hoja";
  if (type.startsWith("text/") || type === "application/xml" || type === "application/json") return "texto";
  return EXTENSIONS[extensionOf(fileName)] ?? null;
}

export function isImageMime(mime: string): mime is ImageMime {
  return (IMAGE_MIMES as readonly string[]).includes(mime);
}

/** MIME que guardamos en Storage (el navegador a veces manda "" o octet-stream). */
export function storageMime(mime: string, fileName: string): string {
  if (mime && mime !== "application/octet-stream") return mime;
  const ext = extensionOf(fileName);
  const byExt: Record<string, string> = {
    pdf: "application/pdf", csv: "text/csv", txt: "text/plain", tsv: "text/plain", xml: "application/xml",
    html: "text/html", htm: "text/html", json: "text/plain", qif: "text/plain", ofx: "application/x-ofx",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  };
  return byExt[ext] ?? "application/octet-stream";
}

/** Nombre seguro para la ruta en Storage. */
export function safeFileName(fileName: string): string {
  const ext = extensionOf(fileName);
  const base = fileName
    .slice(0, fileName.length - (ext ? ext.length + 1 : 0))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "documento";
  return ext ? `${base}.${ext}` : base;
}
