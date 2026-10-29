import type { PriorityLevel } from "./budget";

export type AccountType = "efectivo" | "corriente" | "credito" | "deuda";

export const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string }[] = [
  { value: "efectivo", label: "Efectivo", icon: "💵" },
  { value: "corriente", label: "Cuenta corriente / vista", icon: "🏦" },
  { value: "credito", label: "Tarjeta de crédito", icon: "💳" },
  { value: "deuda", label: "Deuda (consumo, hipotecario)", icon: "📉" },
];

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  opening_balance: number;
  credit_limit: number | null;
  billing_day: number | null;
  due_day: number | null;
  archived: boolean;
  balance: number;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: "gasto" | "ingreso";
  priority_level: PriorityLevel | null;
  sort_order: number;
  archived: boolean;
};

export type ExpenseCategory = Category & { kind: "gasto"; priority_level: PriorityLevel };

export type Transaction = {
  id: string;
  account_id: string;
  category_id: string | null;
  amount: number;
  date: string;
  merchant: string | null;
  note: string | null;
  installment: string | null;
  created_at: string;
};

export type Household = {
  id: string;
  name: string;
  split_esencial: number;
  split_importante: number;
  split_opcional: number;
};

/** Resultado de un formulario con Server Action */
export type FormState = { ok: boolean; message: string } | null;
