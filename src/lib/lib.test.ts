import { describe, expect, it } from "vitest";
import { buildEnvelopes, canSpendToday, proposeAllocation, splitProportional } from "./budget";
import { addMonths, daysBetween, isIsoDate, daysLeftInMonth, monthLabel, nextDueDate, parseMonthParam, todayInChile } from "./dates";
import { formatCLP, parseCLP } from "./money";
import { parseQuickEntry, suggestCategoryName } from "./quick-entry";

describe("money", () => {
  it("formatea pesos chilenos sin decimales", () => {
    expect(formatCLP(25990)).toBe("$25.990");
    expect(formatCLP(-1500)).toBe("-$1.500");
    expect(formatCLP(0)).toBe("$0");
  });
  it("lee montos escritos de varias formas", () => {
    expect(parseCLP("$25.990")).toBe(25990);
    expect(parseCLP("25990")).toBe(25990);
    expect(parseCLP("abc")).toBeNull();
    expect(parseCLP("")).toBeNull();
  });
});

describe("dates", () => {
  it("usa la hora de Chile", () => {
    // 02:00 UTC del 1 de noviembre = 31 de octubre en Santiago (UTC-3)
    expect(todayInChile(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10-31");
  });
  it("cuenta los días que quedan del mes incluyendo hoy", () => {
    expect(daysLeftInMonth("2026-10-29")).toBe(3);
    expect(daysLeftInMonth("2026-10-31")).toBe(1);
    expect(daysLeftInMonth("2028-02-01")).toBe(29);
  });
  it("mueve meses y los nombra en español", () => {
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(monthLabel("2026-10-01")).toBe("Octubre 2026");
  });
  it("calcula el próximo vencimiento de una tarjeta", () => {
    expect(nextDueDate("2026-10-29", 5)).toBe("2026-11-05");
    expect(nextDueDate("2026-10-05", 5)).toBe("2026-10-05");
    expect(nextDueDate("2027-02-10", 31)).toBe("2027-02-28");
    expect(daysBetween("2026-10-29", "2026-11-05")).toBe(7);
  });
  it("valida el mes que llega por la URL", () => {
    expect(parseMonthParam("2026-09", "2026-10-29")).toBe("2026-09-01");
    expect(parseMonthParam("basura", "2026-10-29")).toBe("2026-10-01");
    expect(parseMonthParam(undefined, "2026-10-29")).toBe("2026-10-01");
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });
});

describe("registro rápido", () => {
  it.each([
    ["café 2500", 2500, "Café", false],
    ["uber 4.500", 4500, "Uber", false],
    ["$12.990 farmacia", 12990, "Farmacia", false],
    ["5 lucas almuerzo", 5000, "Almuerzo", false],
    ["2,5 lucas pan", 2500, "Pan", false],
    ["netflix 1.5k", 1500, "Netflix", false],
    ["+850000 sueldo", 850000, "Sueldo", true],
    ["sueldo 1.200.000", 1200000, "Sueldo", true],
    ["3 cafés 7500", 7500, "3 cafés", false],
  ])("entiende %j", (text, amount, description, isIncome) => {
    expect(parseQuickEntry(text)).toEqual({ amount, description, isIncome });
  });
  it("sin número no inventa un monto", () => {
    expect(parseQuickEntry("supermercado").amount).toBeNull();
  });
  it("sugiere la categoría por palabra clave", () => {
    expect(suggestCategoryName("Uber Eats")).toBe("Delivery");
    expect(suggestCategoryName("uber")).toBe("Transporte");
    expect(suggestCategoryName("Café")).toBe("Salidas y comida");
    expect(suggestCategoryName("Lider Express")).toBe("Supermercado");
    expect(suggestCategoryName("algo raro")).toBeNull();
  });
});

describe("presupuesto por prioridades", () => {
  const cats = [
    { id: "arriendo", name: "Arriendo", icon: "🏠", priority_level: 1 as const },
    { id: "super", name: "Super", icon: "🛒", priority_level: 1 as const },
    { id: "ahorro", name: "Ahorro", icon: "🐷", priority_level: 2 as const },
    { id: "salidas", name: "Salidas", icon: "🍔", priority_level: 3 as const },
    { id: "gustos", name: "Gustos", icon: "🎁", priority_level: 3 as const },
  ];

  it("calcula cuánto puedes gastar hoy con los sobres opcionales", () => {
    const envelopes = buildEnvelopes(
      cats,
      new Map([["salidas", 60000], ["gustos", 40000], ["super", 200000]]),
      new Map([["salidas", 10000], ["super", 250000]]),
    );
    expect(envelopes.find((e) => e.categoryId === "super")?.available).toBe(-50000);
    // (50.000 + 40.000) / 3 días
    expect(canSpendToday(envelopes, 3)).toBe(30000);
    expect(canSpendToday(buildEnvelopes(cats, new Map(), new Map()), 3)).toBe(0);
  });

  it("reparte sin perder pesos por redondeo", () => {
    const parts = splitProportional(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(splitProportional(10, [0, 0])).toEqual([5, 5]);
  });

  it("primer mes: usa la plantilla 50/30/20", () => {
    const input = cats.map((c) => ({ categoryId: c.id, level: c.priority_level, assigned: 0, target: 0 }));
    const plan = proposeAllocation(1_000_000, input, { esencial: 50, importante: 30, opcional: 20 });
    expect(plan.get("arriendo")! + plan.get("super")!).toBe(500_000);
    expect(plan.get("ahorro")).toBe(300_000);
    expect(plan.get("salidas")! + plan.get("gustos")!).toBe(200_000);
  });

  it("con historia: llena Esencial primero y Opcional recibe lo que sobra", () => {
    const input = [
      { categoryId: "arriendo", level: 1 as const, assigned: 0, target: 400_000 },
      { categoryId: "super", level: 1 as const, assigned: 50_000, target: 250_000 },
      { categoryId: "ahorro", level: 2 as const, assigned: 0, target: 100_000 },
      { categoryId: "salidas", level: 3 as const, assigned: 0, target: 30_000 },
      { categoryId: "gustos", level: 3 as const, assigned: 0, target: 10_000 },
    ];
    const plan = proposeAllocation(800_000, input, { esencial: 50, importante: 30, opcional: 20 });
    expect(plan.get("arriendo")).toBe(400_000);
    expect(plan.get("super")).toBe(200_000); // solo lo que le falta
    expect(plan.get("ahorro")).toBe(100_000);
    expect(plan.get("salidas")).toBe(75_000);
    expect(plan.get("gustos")).toBe(25_000);

    const short = proposeAllocation(300_000, input, { esencial: 50, importante: 30, opcional: 20 });
    expect(short.get("arriendo")! + short.get("super")!).toBe(300_000);
    expect(short.get("ahorro")).toBe(0);
    expect(short.get("salidas")).toBe(0);
  });
});

describe("etiquetas de fecha", () => {
  it("pone mayúscula solo a la primera palabra", async () => {
    const { dayLabel } = await import("./dates");
    expect(dayLabel("2026-10-29")).toMatch(/^Jueves,? 29 de octubre$/);
  });
});
