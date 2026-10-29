import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  buildSystemPrompt,
  buildUserInstruction,
  ExtractionSchema,
  type Extraction,
} from "./extraction";
import { detectKind, isImageMime } from "./kinds";
import { DocumentError, spreadsheetToText, textFileToText } from "./to-text";

export const DOCUMENT_MODEL = "claude-opus-5-5";

export type ReadInput = {
  bytes: Uint8Array;
  mime: string;
  fileName: string;
  today: string;
  expenseCategories: string[];
  incomeCategories: string[];
};

export function readerConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) || process.env.AI_EXTRACTOR === "fake";
}

/** Arma el contenido del mensaje según el tipo de archivo. */
async function buildContent(input: ReadInput): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const kind = detectKind(input.mime, input.fileName);
  const instruction: Anthropic.Beta.BetaTextBlockParam = { type: "text", text: buildUserInstruction(input) };
  const base64 = () => Buffer.from(input.bytes).toString("base64");

  switch (kind) {
    case "imagen":
      if (!isImageMime(input.mime)) throw new DocumentError("Formato de imagen no soportado. Usa JPG o PNG.");
      return [{ type: "image", source: { type: "base64", media_type: input.mime, data: base64() } }, instruction];
    case "pdf":
      return [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64() } },
        instruction,
      ];
    case "hoja":
    case "texto": {
      const text = kind === "hoja" ? await spreadsheetToText(input.bytes) : textFileToText(input.bytes);
      return [
        { type: "document", source: { type: "text", media_type: "text/plain", data: text }, title: input.fileName },
        instruction,
      ];
    }
    default:
      throw new DocumentError("Ese tipo de archivo no lo sabemos leer. Sube una foto, PDF, Excel o CSV.");
  }
}

/** Lee un documento financiero con Claude y devuelve los movimientos que encontró. */
export async function readDocument(input: ReadInput): Promise<Extraction> {
  if (process.env.AI_EXTRACTOR === "fake") return fakeExtraction(input);
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new DocumentError("La lectura con IA aún no está activada en este servidor.");
  }

  const content = await buildContent(input);
  const client = new Anthropic();

  let message;
  try {
    // Streaming: una cartola larga puede traer muchas líneas y tomar más que un request normal.
    const stream = client.beta.messages.stream({
      model: DOCUMENT_MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
      system: buildSystemPrompt(),
      messages: [{ role: "user", content }],
    });
    message = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new DocumentError("Hay mucha demanda en este momento. Intenta de nuevo en un minuto.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new DocumentError("No pudimos abrir el archivo. Revisa que no esté dañado ni protegido con clave.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[documentos] error de la API", error.status, error.message);
      throw new DocumentError("No pudimos leer el documento. Intenta de nuevo en un momento.");
    }
    throw error;
  }

  if (message.stop_reason === "refusal") {
    throw new DocumentError("No pudimos procesar este documento.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new DocumentError("El documento tiene demasiados movimientos para una sola lectura. Súbelo en partes.");
  }
  const parsed = ExtractionSchema.safeParse(message.parsed_output);
  if (!parsed.success) {
    console.error("[documentos] respuesta inválida", parsed.error.message);
    throw new DocumentError("No pudimos entender el documento. Prueba con una foto más nítida o el PDF original.");
  }
  return parsed.data;
}

/** Solo para pruebas locales (AI_EXTRACTOR=fake): no llama a ningún servicio. */
function fakeExtraction(input: ReadInput): Extraction {
  if (/selfie|foto-personal/i.test(input.fileName)) {
    return {
      es_financiero: false,
      tipo_documento: "otro",
      emisor: null,
      resumen: "Parece una foto personal, no un documento financiero.",
      monto_a_pagar: null,
      fecha_vencimiento: null,
      movimientos: [],
    };
  }
  return {
    es_financiero: true,
    tipo_documento: "cartola_tarjeta",
    emisor: "Banco de Prueba",
    resumen: "Estado de cuenta de prueba con 3 movimientos.",
    monto_a_pagar: 38980,
    fecha_vencimiento: null,
    movimientos: [
      { fecha: input.today, comercio: "Lider Express", detalle: null, monto: 25990, es_ingreso: false, cuotas: null, categoria: "Supermercado" },
      { fecha: input.today, comercio: "Netflix", detalle: null, monto: 12990, es_ingreso: false, cuotas: "1/1", categoria: "Suscripciones" },
      { fecha: input.today, comercio: "Pago tarjeta", detalle: null, monto: 50000, es_ingreso: true, cuotas: null, categoria: null },
    ],
  };
}
