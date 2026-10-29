import { MAX_TEXT_CHARS } from "./kinds";

/** Error con un mensaje listo para mostrarle a la persona. */
export class DocumentError extends Error {}

/** Lee texto respetando acentos: UTF-8, y si no calza, Latin-1 (común en CSV de bancos chilenos). */
export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const text = utf8.includes("�") ? new TextDecoder("latin1").decode(bytes) : utf8;
  return text.replace(/^﻿/, "");
}

export function looksLikeHtml(text: string): boolean {
  return /^\s*<(!doctype|html|table|\?xml[^>]*>\s*<html)/i.test(text);
}

/** Tabla HTML (los ".xls" que exportan varios bancos) → filas separadas por " | ". */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/(tr|p|div|li|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/(\s*\|\s*)+$/, "").trim())
    .filter(Boolean)
    .join("\n");
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows: unknown[][]): string {
  return rows
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""))
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

function ensureSize(text: string): string {
  if (text.length > MAX_TEXT_CHARS) {
    throw new DocumentError(
      "El archivo es demasiado largo para leerlo de una vez. Súbelo por mes (o divídelo en partes más chicas).",
    );
  }
  if (!text.trim()) throw new DocumentError("El archivo está vacío.");
  return text;
}

/** Archivos de texto (CSV, TXT, XML, OFX, HTML…) → texto plano para la IA. */
export function textFileToText(bytes: Uint8Array): string {
  const text = decodeText(bytes);
  return ensureSize(looksLikeHtml(text) ? htmlToText(text) : text);
}

/** Planillas (.xlsx, y los .xls que en realidad son HTML) → CSV por hoja. */
export async function spreadsheetToText(bytes: Uint8Array): Promise<string> {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK": .xlsx
  const isOldExcel = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;

  if (isZip) {
    const { default: readExcelFile } = await import("read-excel-file/node");
    const sheets = await readExcelFile(Buffer.from(bytes));
    const text = sheets
      .map(({ sheet, data }) => `### Hoja: ${sheet}\n${rowsToCsv(data as unknown[][])}`)
      .join("\n\n");
    return ensureSize(text);
  }
  if (isOldExcel) {
    throw new DocumentError(
      "Este Excel es del formato antiguo (.xls). Ábrelo y guárdalo como .xlsx o CSV, o sube el PDF de la cartola.",
    );
  }
  return textFileToText(bytes);
}
