export const CHILE_TZ = "America/Santiago";

const isoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHILE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha de hoy en Chile como "YYYY-MM-DD". */
export function todayInChile(now: Date = new Date()): string {
  return isoDay.format(now);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  // Rechaza fechas que el motor "corrige", como 2026-02-31
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** "2026-10-29" → "2026-10-01" */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Suma (o resta) meses a un primer día de mes. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

export function daysInMonth(day: string): number {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Días que quedan del mes contando hoy (el último día del mes devuelve 1). */
export function daysLeftInMonth(day: string): number {
  return daysInMonth(day) - Number(day.slice(8, 10)) + 1;
}

/** "2026-10-01" → "Octubre 2026" */
export function monthLabel(month: string): string {
  const label = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1).replace(" de ", " ");
}

/** "2026-10-29" → "Jueves, 29 de octubre" */
export function dayLabel(day: string): string {
  const label = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Acepta "2026-10" o "2026-10-01" desde la URL; si no es válido, usa el mes actual. */
export function parseMonthParam(value: string | string[] | undefined, today: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && /^\d{4}-\d{2}(-01)?$/.test(raw)) {
    const month = `${raw.slice(0, 7)}-01`;
    if (isIsoDate(month)) return month;
  }
  return monthStart(today);
}

/** Próxima fecha (hoy incluido) en que cae el día `dueDay` del mes; si el mes es más corto, usa su último día. */
export function nextDueDate(today: string, dueDay: number): string {
  const inMonth = (month: string) => {
    const day = Math.min(dueDay, daysInMonth(month));
    return `${month.slice(0, 8)}${String(day).padStart(2, "0")}`;
  };
  const thisMonth = inMonth(monthStart(today));
  return thisMonth >= today ? thisMonth : inMonth(addMonths(monthStart(today), 1));
}

/** Días entre dos fechas ISO (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
