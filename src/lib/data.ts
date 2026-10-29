import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { buildEnvelopes, canSpendToday, type Envelope } from "./budget";
import { addMonths, daysLeftInMonth, monthStart, todayInChile } from "./dates";
import { createClient } from "./supabase/server";
import type { Account, Category, ExpenseCategory, Household, Transaction } from "./types";

/**
 * Capa de acceso a datos: todo pasa por aquí. La seguridad real la da RLS en Postgres;
 * además filtramos por el hogar actual para no mezclar hogares de un mismo usuario.
 */
export const getContext = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, current_household_id")
    .eq("id", userId)
    .maybeSingle();

  let householdId: string | null = profile?.current_household_id ?? null;
  if (!householdId) {
    const { data: membership } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    householdId = membership?.household_id ?? null;
  }
  if (!householdId) throw new Error("Tu usuario no tiene un hogar asignado.");

  return {
    supabase,
    userId,
    householdId,
    displayName: (profile?.display_name as string | null) ?? null,
  };
});

export const getHousehold = cache(async (): Promise<Household> => {
  const { supabase, householdId } = await getContext();
  const { data, error } = await supabase
    .from("households")
    .select("id, name, split_esencial, split_importante, split_opcional")
    .eq("id", householdId)
    .single();
  if (error) throw error;
  return data as Household;
});

export const getAccounts = cache(async (includeArchived = false): Promise<Account[]> => {
  const { supabase, householdId } = await getContext();
  let query = supabase
    .from("accounts")
    .select("id, name, type, opening_balance, credit_limit, billing_day, due_day, archived")
    .eq("household_id", householdId)
    .order("created_at");
  if (!includeArchived) query = query.eq("archived", false);
  const [{ data: accounts, error }, { data: balances }] = await Promise.all([
    query,
    supabase.from("account_balances").select("id, balance").eq("household_id", householdId),
  ]);
  if (error) throw error;
  const balanceById = new Map((balances ?? []).map((b) => [b.id as string, Number(b.balance)]));
  return (accounts ?? []).map((a) => ({ ...a, balance: balanceById.get(a.id) ?? a.opening_balance }) as Account);
});

export const getCategories = cache(async (includeArchived = false): Promise<Category[]> => {
  const { supabase, householdId } = await getContext();
  let query = supabase
    .from("categories")
    .select("id, name, icon, color, kind, priority_level, sort_order, archived")
    .eq("household_id", householdId)
    .order("kind")
    .order("priority_level")
    .order("sort_order")
    .order("name");
  if (!includeArchived) query = query.eq("archived", false);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Category[];
});

export function isExpenseCategory(c: Category): c is ExpenseCategory {
  return c.kind === "gasto" && c.priority_level !== null;
}

export type MonthSummary = {
  month: string;
  envelopes: Envelope[];
  income: number;
  assignedTotal: number;
  spentTotal: number;
  toAssign: number;
  canSpendToday: number;
  daysLeft: number;
  /** Lo asignado el mes anterior por categoría (meta para el reparto automático) */
  previousAssigned: Map<string, number>;
};

/** Sobres, ingresos y "Puedes gastar hoy" de un mes. */
export const getMonthSummary = cache(async (month: string): Promise<MonthSummary> => {
  const { supabase, householdId } = await getContext();
  const previous = addMonths(month, -1);

  const [categories, budgetsRes, prevBudgetsRes, totalsRes] = await Promise.all([
    getCategories(),
    supabase.from("budgets").select("category_id, assigned").eq("household_id", householdId).eq("month", month),
    supabase.from("budgets").select("category_id, assigned").eq("household_id", householdId).eq("month", previous),
    supabase
      .from("category_month_totals")
      .select("category_id, total")
      .eq("household_id", householdId)
      .eq("month", month),
  ]);
  for (const res of [budgetsRes, prevBudgetsRes, totalsRes]) if (res.error) throw res.error;

  const toMap = (rows: { category_id: string; assigned: number }[] | null) =>
    new Map((rows ?? []).map((r) => [r.category_id, Number(r.assigned)]));
  const assigned = toMap(budgetsRes.data);
  const previousAssigned = toMap(prevBudgetsRes.data);

  const kindById = new Map(categories.map((c) => [c.id, c.kind]));
  const spent = new Map<string, number>();
  let income = 0;
  for (const row of totalsRes.data ?? []) {
    const total = Number(row.total);
    const kind = row.category_id ? kindById.get(row.category_id) : undefined;
    if (kind === "gasto") spent.set(row.category_id, -total);
    else if (kind === "ingreso" || (!kind && total > 0)) income += Math.max(0, total);
  }

  const envelopes = buildEnvelopes(categories.filter(isExpenseCategory), assigned, spent);
  const assignedTotal = envelopes.reduce((s, e) => s + e.assigned, 0);
  const spentTotal = envelopes.reduce((s, e) => s + e.spent, 0);

  const today = todayInChile();
  const isCurrent = monthStart(today) === month;
  const daysLeft = isCurrent ? daysLeftInMonth(today) : 0;

  return {
    month,
    envelopes,
    income,
    assignedTotal,
    spentTotal,
    toAssign: income - assignedTotal,
    canSpendToday: isCurrent ? canSpendToday(envelopes, daysLeft) : 0,
    daysLeft,
    previousAssigned,
  };
});

export type TransactionFilters = {
  month: string;
  accountId?: string;
  categoryId?: string;
  q?: string;
};

export async function getTransactions(filters: TransactionFilters, limit = 300): Promise<Transaction[]> {
  const { supabase, householdId } = await getContext();
  let query = supabase
    .from("transactions")
    .select("id, account_id, category_id, amount, date, merchant, note, installment, created_at")
    .eq("household_id", householdId)
    .gte("date", filters.month)
    .lt("date", addMonths(filters.month, 1))
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.q) {
    const term = filters.q.replace(/[%_,()]/g, " ").trim();
    if (term) query = query.or(`merchant.ilike.%${term}%,note.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

export async function getRecentTransactions(limit = 5): Promise<Transaction[]> {
  const { supabase, householdId } = await getContext();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, account_id, category_id, amount, date, merchant, note, installment, created_at")
    .eq("household_id", householdId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const { supabase, householdId } = await getContext();
  const { data } = await supabase
    .from("transactions")
    .select("id, account_id, category_id, amount, date, merchant, note, installment, created_at")
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();
  return (data as Transaction | null) ?? null;
}

export async function getMembers() {
  const { supabase, householdId } = await getContext();
  const { data } = await supabase
    .from("household_members")
    .select("user_id, role")
    .eq("household_id", householdId);
  return data ?? [];
}

export type ImportDoc = {
  id: string;
  file_name: string;
  mime_type: string;
  status: "subido" | "procesando" | "por_revisar" | "revisado" | "no_financiero" | "error";
  doc_type: string | null;
  issuer: string | null;
  summary: string | null;
  error: string | null;
  raw_json: { monto_a_pagar?: number | null; fecha_vencimiento?: string | null } | null;
  created_at: string;
};

export type ImportItem = {
  id: string;
  import_id: string;
  position: number;
  date: string;
  merchant: string | null;
  description: string | null;
  amount: number;
  installment: string | null;
  category_id: string | null;
  account_id: string | null;
  duplicate_of: string | null;
};

const IMPORT_FIELDS = "id, file_name, mime_type, status, doc_type, issuer, summary, error, raw_json, created_at";

/** Documentos con movimientos esperando revisión, con sus ítems y los posibles duplicados. */
export async function getPendingReview() {
  const { supabase, householdId } = await getContext();
  const { data: docs, error } = await supabase
    .from("imports")
    .select(IMPORT_FIELDS)
    .eq("household_id", householdId)
    .eq("status", "por_revisar")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const ids = (docs ?? []).map((d) => d.id as string);
  if (ids.length === 0) return { docs: [] as ImportDoc[], items: [] as ImportItem[], duplicates: new Map<string, Transaction>() };

  const { data: items } = await supabase
    .from("import_items")
    .select("id, import_id, position, date, merchant, description, amount, installment, category_id, account_id, duplicate_of")
    .eq("household_id", householdId)
    .eq("status", "pendiente")
    .in("import_id", ids)
    .order("position");
  const duplicateIds = [...new Set((items ?? []).map((i) => i.duplicate_of).filter(Boolean))] as string[];
  const { data: dupes } = duplicateIds.length
    ? await supabase
        .from("transactions")
        .select("id, account_id, category_id, amount, date, merchant, note, installment, created_at")
        .in("id", duplicateIds)
    : { data: [] };
  return {
    docs: (docs ?? []) as ImportDoc[],
    items: (items ?? []) as ImportItem[],
    duplicates: new Map(((dupes ?? []) as Transaction[]).map((t) => [t.id, t])),
  };
}

export async function getRecentImports(limit = 15): Promise<ImportDoc[]> {
  const { supabase, householdId } = await getContext();
  const { data } = await supabase
    .from("imports")
    .select(IMPORT_FIELDS)
    .eq("household_id", householdId)
    .neq("status", "por_revisar")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ImportDoc[];
}

export async function countPendingReview(): Promise<number> {
  const { supabase, householdId } = await getContext();
  const { count } = await supabase
    .from("import_items")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("status", "pendiente");
  return count ?? 0;
}
