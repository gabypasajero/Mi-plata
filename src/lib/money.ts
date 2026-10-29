const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** 25990 → "$25.990"; -25990 → "-$25.990" */
export function formatCLP(amount: number): string {
  const rounded = Math.round(amount);
  // El signo va antes del "$" (es-CL lo pone después según el motor)
  return (rounded < 0 ? "-" : "") + clp.format(Math.abs(rounded));
}

/** "$25.990", "25990", "25.990" → 25990. Devuelve null si no hay un monto válido. */
export function parseCLP(input: string): number | null {
  const digits = input.replace(/[^\d-]/g, "");
  if (!/^-?\d+$/.test(digits)) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}
