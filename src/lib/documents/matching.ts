/**
 * Lógica pura para pasar de lo que leyó la IA a movimientos listos para revisar:
 * normalizar, aplicar lo que la app aprendió por comercio y detectar duplicados.
 */
import { daysBetween, isIsoDate } from "../dates";
import { normalizeText } from "../quick-entry";
import type { Extraction } from "./extraction";

export type ProposedItem = {
  position: number;
  date: string;
  merchant: string | null;
  description: string | null;
  amount: number; // + ingreso, − gasto
  installment: string | null;
  categoryName: string | null;
};

const INSTALLMENT_RE = /^(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})$/i;

/** Convierte la respuesta de la IA en ítems válidos (descarta los que no se pueden guardar). */
export function itemsFromExtraction(extraction: Extraction, today: string): ProposedItem[] {
  if (!extraction.es_financiero) return [];
  const items: ProposedItem[] = [];
  extraction.movimientos.forEach((m, position) => {
    const amount = Math.round(Math.abs(m.monto));
    if (!Number.isSafeInteger(amount) || amount === 0) return;
    const date = isIsoDate(m.fecha) ? m.fecha : today;
    const match = m.cuotas?.trim().match(INSTALLMENT_RE);
    const merchant = m.comercio.trim().slice(0, 80) || null;
    items.push({
      position,
      date,
      merchant,
      description: m.detalle?.trim().slice(0, 280) || null,
      amount: m.es_ingreso ? amount : -amount,
      installment: match ? `${Number(match[1])}/${Number(match[2])}` : null,
      categoryName: m.categoria?.trim() || null,
    });
  });
  return items;
}

/** "LIDER EXPRESS #123 Las Condes" → "lider express las condes" (sin números de sucursal ni símbolos). */
export function normalizeMerchant(merchant: string): string {
  return normalizeText(merchant)
    .replace(/[^a-z\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export type MerchantRule = { pattern: string; category_id: string };

/** La regla aprendida con el patrón más largo que aparece en el comercio gana. */
export function categoryFromRules(merchant: string | null, rules: MerchantRule[]): string | null {
  if (!merchant) return null;
  const name = ` ${normalizeMerchant(merchant)} `;
  let best: MerchantRule | null = null;
  for (const rule of rules) {
    if (rule.pattern.length >= 2 && name.includes(` ${rule.pattern} `) && (!best || rule.pattern.length > best.pattern.length)) {
      best = rule;
    }
  }
  return best?.category_id ?? null;
}

export type ExistingTransaction = { id: string; date: string; amount: number; merchant: string | null };

/**
 * ¿Ya está registrado? Mismo monto, fecha a ±3 días y comercio parecido (o sin comercio).
 * Así una boleta subida antes y la misma compra en la cartola no se cuentan dos veces.
 */
export function findDuplicate(item: Pick<ProposedItem, "date" | "amount" | "merchant">, existing: ExistingTransaction[]) {
  const words = (s: string | null) => new Set(normalizeMerchant(s ?? "").split(" ").filter((w) => w.length >= 3));
  const itemWords = words(item.merchant);
  let best: ExistingTransaction | null = null;
  let bestDays = Infinity;
  for (const tx of existing) {
    if (tx.amount !== item.amount) continue;
    const days = Math.abs(daysBetween(tx.date, item.date));
    if (days > 3) continue;
    const txWords = words(tx.merchant);
    const similar =
      itemWords.size === 0 || txWords.size === 0 || [...itemWords].some((w) => txWords.has(w));
    if (similar && days < bestDays) {
      best = tx;
      bestDays = days;
    }
  }
  return best;
}

/** Patrón que se guarda al aprender: las 2 primeras palabras significativas del comercio. */
export function ruleFromMerchant(merchant: string | null): string | null {
  if (!merchant) return null;
  const words = normalizeMerchant(merchant).split(" ").filter((w) => w.length >= 2).slice(0, 2);
  const pattern = words.join(" ");
  return pattern.length >= 2 ? pattern : null;
}
