import { z } from "zod";

/** Lo que la IA devuelve al leer un documento. Esquema fijo para que se cachee del lado de la API. */
export const DOC_TYPES = [
  "boleta",
  "factura",
  "cartola_tarjeta",
  "cartola_cuenta",
  "comprobante_transferencia",
  "liquidacion_sueldo",
  "cuenta_servicio",
  "estado_deuda",
  "otro",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  boleta: "Boleta",
  factura: "Factura",
  cartola_tarjeta: "Estado de cuenta de tarjeta",
  cartola_cuenta: "Cartola de cuenta",
  comprobante_transferencia: "Comprobante de transferencia",
  liquidacion_sueldo: "Liquidación de sueldo",
  cuenta_servicio: "Cuenta de servicio (luz, agua, internet…)",
  estado_deuda: "Estado de deuda o crédito",
  otro: "Documento financiero",
};

export const ExtractionSchema = z.object({
  es_financiero: z.boolean(),
  tipo_documento: z.enum(DOC_TYPES),
  emisor: z.string().nullable(),
  resumen: z.string(),
  monto_a_pagar: z.number().int().nullable(),
  fecha_vencimiento: z.string().nullable(),
  movimientos: z.array(
    z.object({
      fecha: z.string(),
      comercio: z.string(),
      detalle: z.string().nullable(),
      monto: z.number().int(),
      es_ingreso: z.boolean(),
      cuotas: z.string().nullable(),
      categoria: z.string().nullable(),
    }),
  ),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export function buildSystemPrompt(): string {
  return `Eres el lector de documentos de Mi Plata, una app chilena de finanzas personales.
Recibes un documento que subió una persona (foto de boleta, PDF de cartola, Excel o CSV del banco, factura, comprobante, liquidación de sueldo, etc.) y extraes sus movimientos de dinero para que ella los revise antes de guardarlos.

Reglas:
- es_financiero = false si el documento no tiene que ver con dinero (fotos personales, memes, documentos sin montos). En ese caso movimientos = [] y resumen explica qué parece ser.
- Montos en pesos chilenos enteros y siempre positivos en "monto" ("$12.990" → 12990; "1.234.567" → 1234567). El sentido va en "es_ingreso".
- Fechas en formato AAAA-MM-DD. En Chile las fechas se escriben DD/MM/AAAA. Si falta el año, usa el del documento o el año actual que te indican.
- Boleta o factura: UN solo movimiento por el total pagado (no uno por producto). Pon los productos principales en "detalle", resumidos.
- Cartola de tarjeta o de cuenta: un movimiento por cada línea de compra, cargo, abono o pago. No incluyas totales, subtotales, saldos, ni el "monto facturado".
  En tarjetas de crédito: compras y cargos son gastos; los pagos a la tarjeta y las devoluciones son ingresos a la tarjeta (es_ingreso = true).
  Si una compra está en cuotas ("03/12", "cuota 3 de 12"), registra solo la cuota del período en "monto" y pon cuotas = "3/12".
- Compras en moneda extranjera: usa el monto en pesos si aparece; si no aparece, omite la línea y menciónalo en el resumen.
- Liquidación de sueldo: UN ingreso por el líquido a pagar.
- Comprobante de transferencia: un movimiento; ingreso si la persona recibió la plata, gasto si la envió.
- Cuenta de servicio (luz, agua, gas, internet, celular) o estado de deuda: un movimiento por el monto a pagar, y llena monto_a_pagar y fecha_vencimiento.
- "comercio": nombre corto y limpio del comercio o contraparte ("LIDER EXPRESS LAS CONDES 123" → "Lider Express"). Máximo 60 caracteres.
- "categoria": elige exactamente uno de los nombres de la lista que te entregan (gastos para gastos, ingresos para ingresos). Si ninguno calza, null.
- No inventes movimientos ni montos. Si algo no se lee, omítelo y dilo en el resumen.
- "resumen": una o dos frases en español para la persona (ej.: "Estado de cuenta Visa de octubre: 23 compras, total a pagar $412.300 el 5 de noviembre.").`;
}

export function buildUserInstruction(options: {
  fileName: string;
  today: string;
  expenseCategories: string[];
  incomeCategories: string[];
}): string {
  return `Archivo: ${options.fileName}
Fecha de hoy: ${options.today}
Categorías de gasto: ${options.expenseCategories.join(" | ")}
Categorías de ingreso: ${options.incomeCategories.join(" | ")}

Extrae los movimientos de este documento.`;
}
