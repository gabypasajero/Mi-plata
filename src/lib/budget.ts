/**
 * Método de presupuesto por prioridades: Esencial → Importante → Opcional.
 * Funciones puras (sin base de datos) para poder probarlas.
 */

export type PriorityLevel = 1 | 2 | 3;

export const LEVELS: { level: PriorityLevel; name: string; hint: string }[] = [
  { level: 1, name: "Esencial", hint: "Se llena primero, siempre" },
  { level: 2, name: "Importante", hint: "Con lo que sobra del nivel 1" },
  { level: 3, name: "Opcional", hint: "Recibe solo lo que queda" },
];

export type Split = { esencial: number; importante: number; opcional: number };

export type Envelope = {
  categoryId: string;
  name: string;
  icon: string;
  level: PriorityLevel;
  assigned: number;
  spent: number;
  available: number;
};

type CategoryInput = { id: string; name: string; icon: string; priority_level: PriorityLevel };

/** Arma los sobres del mes: asignado, gastado y disponible por categoría de gasto. */
export function buildEnvelopes(
  categories: CategoryInput[],
  assignedByCategory: Map<string, number>,
  spentByCategory: Map<string, number>,
): Envelope[] {
  return categories.map((c) => {
    const assigned = assignedByCategory.get(c.id) ?? 0;
    const spent = spentByCategory.get(c.id) ?? 0;
    return {
      categoryId: c.id,
      name: c.name,
      icon: c.icon,
      level: c.priority_level,
      assigned,
      spent,
      available: assigned - spent,
    };
  });
}

/** "Puedes gastar hoy" = disponible en sobres Opcionales ÷ días que quedan del mes. */
export function canSpendToday(envelopes: Envelope[], daysLeft: number): number {
  const optional = envelopes
    .filter((e) => e.level === 3)
    .reduce((sum, e) => sum + e.available, 0);
  if (optional <= 0 || daysLeft <= 0) return 0;
  return Math.floor(optional / daysLeft);
}

/** Reparte `total` en partes enteras proporcionales a `weights` (la suma exacta se respeta). */
export function splitProportional(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || weights.length === 0) return weights.map(() => 0);
  const effective = weightSum > 0 ? weights : weights.map(() => 1);
  const effectiveSum = weightSum > 0 ? weightSum : weights.length;

  const exact = effective.map((w) => (total * w) / effectiveSum);
  const parts = exact.map(Math.floor);
  let rest = total - parts.reduce((a, b) => a + b, 0);
  // El resto (por redondeo) va a quienes perdieron más decimales
  const order = exact
    .map((value, i) => ({ i, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    parts[i] += 1;
    rest -= 1;
  }
  return parts;
}

export type AllocationInput = {
  categoryId: string;
  level: PriorityLevel;
  /** Lo que ya tiene asignado este mes */
  assigned: number;
  /** Meta del sobre: lo que se asignó el mes anterior (0 si no hay historia) */
  target: number;
};

/**
 * Propone cómo repartir `amount` (lo que está "por asignar") entre los sobres.
 * - Con historia: llena Esencial hasta su meta, luego Importante; Opcional recibe el resto.
 * - Sin historia (primer mes): usa la plantilla de porcentajes (50/30/20 por defecto).
 * Devuelve cuánto SUMAR a cada sobre.
 */
export function proposeAllocation(
  amount: number,
  envelopes: AllocationInput[],
  split: Split,
): Map<string, number> {
  const result = new Map<string, number>(envelopes.map((e) => [e.categoryId, 0]));
  if (amount <= 0 || envelopes.length === 0) return result;

  const byLevel = (level: PriorityLevel) => envelopes.filter((e) => e.level === level);
  const hasHistory = envelopes.some((e) => e.target > 0);

  if (!hasHistory) {
    const pct = [split.esencial, split.importante, split.opcional];
    const present = ([1, 2, 3] as PriorityLevel[]).filter((l) => byLevel(l).length > 0);
    const levelShares = splitProportional(
      amount,
      present.map((l) => pct[l - 1]),
    );
    present.forEach((level, i) => {
      const group = byLevel(level);
      splitProportional(levelShares[i], group.map(() => 1)).forEach((part, j) => {
        result.set(group[j].categoryId, part);
      });
    });
    return result;
  }

  let remaining = amount;
  for (const level of [1, 2] as PriorityLevel[]) {
    const group = byLevel(level);
    const needs = group.map((e) => Math.max(0, e.target - e.assigned));
    const needed = needs.reduce((a, b) => a + b, 0);
    if (needed === 0) continue;
    const parts = needed <= remaining ? needs : splitProportional(remaining, needs);
    parts.forEach((part, j) => result.set(group[j].categoryId, part));
    remaining -= parts.reduce((a, b) => a + b, 0);
    if (remaining <= 0) return result;
  }

  // Opcional recibe lo que queda, proporcional a sus metas
  let group = byLevel(3);
  if (group.length === 0) group = byLevel(2).length ? byLevel(2) : byLevel(1);
  splitProportional(remaining, group.map((e) => e.target)).forEach((part, j) => {
    const id = group[j].categoryId;
    result.set(id, (result.get(id) ?? 0) + part);
  });
  return result;
}
