/**
 * Registro rápido: entiende textos como "café 2500", "uber 4.500", "5 lucas almuerzo"
 * o "+850000 sueldo" y los separa en monto y descripción.
 */

export type QuickEntry = {
  amount: number | null;
  description: string;
  isIncome: boolean;
};

const AMOUNT_RE =
  /([+-])?\s*\$?\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,.](\d+))?\s*(k|mil|lucas?)?(?=\s|$)/gi;

const INCOME_WORDS = /\b(sueldo|salario|ingreso|me pagaron|pago recibido|venta|vend[ií]|recib[ií])\b/i;

export function parseQuickEntry(text: string): QuickEntry {
  const matches = [...text.matchAll(AMOUNT_RE)];
  const match = matches.at(-1);

  let amount: number | null = null;
  let description = text;
  let sign: string | undefined;

  if (match) {
    const [whole, matchedSign, integer, decimals, multiplier] = match;
    sign = matchedSign;
    let value = Number(integer.replace(/[.\s]/g, "") + (decimals ? `.${decimals}` : ""));
    if (multiplier) value *= 1000;
    amount = Math.round(value);
    if (amount <= 0) amount = null;
    const start = match.index ?? 0;
    description = text.slice(0, start) + " " + text.slice(start + whole.length);
  }

  description = description.replace(/\s+/g, " ").trim();
  description = description.charAt(0).toUpperCase() + description.slice(1);

  const isIncome = sign === "+" || (sign !== "-" && INCOME_WORDS.test(text));
  return { amount, description, isIncome };
}

// Palabra clave → nombre de categoría base (las que crea la migración).
const KEYWORDS: Record<string, string[]> = {
  Delivery: ["uber eats", "ubereats", "rappi", "pedidosya", "pedidos ya", "delivery", "justo"],
  Supermercado: [
    "lider", "jumbo", "unimarc", "santa isabel", "tottus", "acuenta", "mayorista 10",
    "supermercado", "super", "feria", "verduras", "pan", "almacen",
  ],
  Transporte: [
    "uber", "didi", "cabify", "metro", "bip", "micro", "bencina", "copec", "shell",
    "petrobras", "aramco", "peaje", "tag", "estacionamiento", "taxi", "colectivo",
  ],
  "Salidas y comida": [
    "cafe", "starbucks", "juan maestro", "restaurant", "restoran", "almuerzo", "cena",
    "once", "completo", "sushi", "pizza", "cerveza", "bar", "cine", "helado",
  ],
  Suscripciones: [
    "netflix", "spotify", "disney", "hbo", "max", "prime video", "youtube", "icloud",
    "chatgpt", "claude", "suscripcion",
  ],
  "Cuentas básicas": [
    "luz", "enel", "agua", "aguas andinas", "gas", "metrogas", "lipigas", "abastible",
    "internet", "vtr", "entel", "movistar", "wom", "claro", "celular",
  ],
  Salud: [
    "farmacia", "cruz verde", "salcobrand", "ahumada", "doctor", "medico", "consulta",
    "isapre", "fonasa", "dentista", "remedio", "remedios", "examen",
  ],
  Educación: ["colegio", "universidad", "matricula", "mensualidad", "utiles", "libro", "curso", "jardin"],
  "Arriendo / Dividendo": ["arriendo", "dividendo", "gastos comunes"],
  Ropa: ["ropa", "zapatillas", "zapatos", "polera", "pantalon", "h&m", "zara"],
  Gustos: ["regalo", "juguete", "videojuego", "maquillaje"],
  "Tarjetas y deudas": ["pago tarjeta", "credito de consumo", "cuota credito"],
  Sueldo: ["sueldo", "salario", "liquidacion"],
  Ventas: ["venta", "vendi"],
};

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const KEYWORD_LIST = Object.entries(KEYWORDS)
  .flatMap(([category, words]) => words.map((word) => ({ word, category })))
  .sort((a, b) => b.word.length - a.word.length); // "uber eats" antes que "uber"

/** Devuelve el nombre de la categoría base que mejor calza con el texto, o null. */
export function suggestCategoryName(text: string): string | null {
  const normalized = ` ${normalizeText(text).replace(/[^a-z0-9&]+/g, " ")} `;
  for (const { word, category } of KEYWORD_LIST) {
    if (normalized.includes(` ${word} `)) return category;
  }
  return null;
}
