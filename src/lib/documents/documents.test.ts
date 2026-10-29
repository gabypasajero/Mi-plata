import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ExtractionSchema, type Extraction } from "./extraction";
import { detectKind, safeFileName, storageMime } from "./kinds";
import { categoryFromRules, findDuplicate, itemsFromExtraction, normalizeMerchant, ruleFromMerchant } from "./matching";
import { DocumentError, htmlToText, spreadsheetToText, textFileToText } from "./to-text";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe("tipos de archivo", () => {
  it.each([
    ["image/jpeg", "boleta.jpg", "imagen"],
    ["application/pdf", "cartola.pdf", "pdf"],
    ["", "movimientos.xlsx", "hoja"],
    ["application/vnd.ms-excel", "cartola.xls", "hoja"],
    ["text/csv", "banco.csv", "texto"],
    ["application/octet-stream", "export.ofx", "texto"],
    ["application/zip", "fotos.zip", null],
    ["image/heic", "IMG_1234.HEIC", null],
  ])("%s %s → %s", (mime, name, kind) => {
    expect(detectKind(mime, name)).toBe(kind);
  });
  it("arregla el MIME y el nombre para Storage", () => {
    expect(storageMime("", "Cartola Octubre.xlsx")).toContain("spreadsheetml");
    expect(safeFileName("Boleta Líder #23 (copia).JPG")).toBe("Boleta-Lider-23-copia.jpg");
    expect(safeFileName("....pdf")).toBe("documento.pdf");
  });
});

describe("conversión a texto", () => {
  it("lee Excel (.xlsx) con fechas y celdas vacías", async () => {
    const text = await spreadsheetToText(fixture("cartola.xlsx"));
    expect(text).toContain("### Hoja: Movimientos");
    expect(text).toContain("2026-10-03,COMPRA LIDER EXPRESS,25990,");
    expect(text).toContain('"TRANSF. RECIBIDA JUAN, PEREZ"');
    expect(text.split("\n")).toHaveLength(4); // título + encabezado + 2 filas (la vacía se omite)
  });
  it("lee CSV de banco en Latin-1 sin romper acentos", () => {
    expect(textFileToText(fixture("cartola-latin1.csv"))).toContain("Panadería Ñuñoa");
  });
  it("entiende los .xls que en realidad son HTML", async () => {
    const text = await spreadsheetToText(fixture("banco.xls"));
    expect(text).toContain("03/10/2026 | Copec & Pronto | $35.000");
  });
  it("rechaza el Excel antiguo con un mensaje útil", async () => {
    const oldExcel = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    await expect(spreadsheetToText(oldExcel)).rejects.toThrow(DocumentError);
  });
  it("limpia HTML", () => {
    expect(htmlToText("<p>Hola&nbsp;<b>mundo</b></p><script>x()</script>")).toBe("Hola mundo");
  });
});

const extraction = (movimientos: Extraction["movimientos"], es_financiero = true): Extraction => ({
  es_financiero,
  tipo_documento: "cartola_tarjeta",
  emisor: "Banco",
  resumen: "",
  monto_a_pagar: null,
  fecha_vencimiento: null,
  movimientos,
});

describe("de la lectura a movimientos", () => {
  it("normaliza signos, fechas y cuotas, y descarta montos en 0", () => {
    const items = itemsFromExtraction(
      extraction([
        { fecha: "2026-10-03", comercio: " Lider ", detalle: null, monto: 25990, es_ingreso: false, cuotas: "03 de 12", categoria: "Supermercado" },
        { fecha: "03/10/2026", comercio: "Pago", detalle: null, monto: -50000, es_ingreso: true, cuotas: null, categoria: null },
        { fecha: "2026-10-04", comercio: "Nada", detalle: null, monto: 0, es_ingreso: false, cuotas: null, categoria: null },
      ]),
      "2026-10-29",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ amount: -25990, merchant: "Lider", installment: "3/12", date: "2026-10-03" });
    expect(items[1]).toMatchObject({ amount: 50000, date: "2026-10-29" }); // fecha ilegible → hoy
  });
  it("un documento no financiero no propone nada", () => {
    expect(itemsFromExtraction(extraction([], false), "2026-10-29")).toEqual([]);
  });
  it("el esquema valida la respuesta de la IA", () => {
    expect(ExtractionSchema.safeParse({ es_financiero: true }).success).toBe(false);
  });
});

describe("la app aprende y evita duplicados", () => {
  it("normaliza comercios", () => {
    expect(normalizeMerchant("LIDER EXPRESS #123 Las Condes")).toBe("lider express las condes");
    expect(ruleFromMerchant("UBER EATS *TRIP")).toBe("uber eats");
  });
  it("usa la regla más específica", () => {
    const rules = [
      { pattern: "uber", category_id: "transporte" },
      { pattern: "uber eats", category_id: "delivery" },
    ];
    expect(categoryFromRules("UBER EATS Santiago", rules)).toBe("delivery");
    expect(categoryFromRules("Uber trip", rules)).toBe("transporte");
    expect(categoryFromRules("Lider", rules)).toBeNull();
  });
  it("detecta la boleta ya registrada que aparece en la cartola", () => {
    const existing = [
      { id: "a", date: "2026-10-01", amount: -25990, merchant: "Lider" },
      { id: "b", date: "2026-10-03", amount: -25990, merchant: "Jumbo" },
    ];
    expect(findDuplicate({ date: "2026-10-03", amount: -25990, merchant: "LIDER EXPRESS" }, existing)?.id).toBe("a");
    expect(findDuplicate({ date: "2026-10-03", amount: -25990, merchant: null }, existing)?.id).toBe("b");
    expect(findDuplicate({ date: "2026-10-10", amount: -25990, merchant: "Lider" }, existing)).toBeNull();
    expect(findDuplicate({ date: "2026-10-03", amount: -25991, merchant: "Lider" }, existing)).toBeNull();
  });
});
