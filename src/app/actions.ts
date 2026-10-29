"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { proposeAllocation } from "@/lib/budget";
import { getContext, getHousehold, getMonthSummary } from "@/lib/data";
import { isIsoDate, todayInChile } from "@/lib/dates";
import { formatCLP, parseCLP } from "@/lib/money";
import type { FormState } from "@/lib/types";
import { ACCOUNT_TYPES } from "@/lib/types";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optional = (fd: FormData, key: string) => str(fd, key) || null;
const fail = (message: string): FormState => ({ ok: false, message });
const UUID_RE = /^[0-9a-f-]{36}$/i;

function refreshAll() {
  revalidatePath("/", "layout");
}

function readMonth(fd: FormData): string | null {
  const month = str(fd, "month");
  return /^\d{4}-\d{2}-01$/.test(month) && isIsoDate(month) ? month : null;
}

// ─────────────── Movimientos ───────────────

type TransactionValues = {
  account_id: string;
  category_id: string | null;
  amount: number;
  date: string;
  merchant: string | null;
  note: string | null;
  installment: string | null;
};

function readTransaction(fd: FormData): { error: string } | { values: TransactionValues } {
  const amount = parseCLP(str(fd, "amount"));
  const kind = str(fd, "kind") === "ingreso" ? "ingreso" : "gasto";
  const accountId = str(fd, "account_id");
  const categoryId = optional(fd, "category_id");
  const date = str(fd, "date") || todayInChile();
  const installment = optional(fd, "installment");

  if (!amount || amount <= 0) return { error: "Escribe un monto mayor a $0." };
  if (amount > 999_999_999_999) return { error: "El monto es demasiado grande." };
  if (!UUID_RE.test(accountId)) return { error: "Elige una cuenta." };
  if (categoryId && !UUID_RE.test(categoryId)) return { error: "Categoría no válida." };
  if (!isIsoDate(date)) return { error: "La fecha no es válida." };
  if (installment && !/^\d{1,3}\/\d{1,3}$/.test(installment))
    return { error: 'Las cuotas se escriben como "3/12".' };

  return {
    values: {
      account_id: accountId,
      category_id: categoryId,
      amount: kind === "ingreso" ? amount : -amount,
      date,
      merchant: optional(fd, "merchant")?.slice(0, 80) ?? null,
      note: optional(fd, "note")?.slice(0, 280) ?? null,
      installment,
    },
  };
}

export async function createTransaction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, householdId } = await getContext();
  const parsed = readTransaction(fd);
  if ("error" in parsed) return fail(parsed.error);

  const { error } = await supabase.from("transactions").insert({ ...parsed.values, household_id: householdId });
  if (error) return fail("No se pudo guardar. Revisa la cuenta y la categoría.");
  refreshAll();
  return { ok: true, message: parsed.values.amount > 0 ? "Ingreso guardado ✓" : "Gasto guardado ✓" };
}

export async function updateTransaction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, householdId } = await getContext();
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return fail("Movimiento no válido.");
  const parsed = readTransaction(fd);
  if ("error" in parsed) return fail(parsed.error);

  const { error } = await supabase
    .from("transactions")
    .update(parsed.values)
    .eq("id", id)
    .eq("household_id", householdId);
  if (error) return fail("No se pudo guardar el cambio.");
  refreshAll();
  redirect("/movimientos");
}

export async function deleteTransaction(fd: FormData) {
  const { supabase, householdId } = await getContext();
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return;
  await supabase.from("transactions").delete().eq("id", id).eq("household_id", householdId);
  refreshAll();
  redirect("/movimientos");
}

// ─────────────── Cuentas ───────────────

export async function createAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, householdId } = await getContext();
  const name = str(fd, "name").slice(0, 60);
  const type = str(fd, "type");
  if (!name) return fail("Ponle un nombre a la cuenta.");
  if (!ACCOUNT_TYPES.some((t) => t.value === type)) return fail("Elige el tipo de cuenta.");

  const balanceInput = str(fd, "opening_balance");
  let opening = balanceInput ? parseCLP(balanceInput) : 0;
  if (opening === null) return fail("El saldo inicial no es válido.");
  // En tarjetas y deudas lo que se debe es saldo negativo
  if ((type === "credito" || type === "deuda") && opening > 0) opening = -opening;

  const day = (key: string) => {
    const n = Number(str(fd, key));
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
  };
  const limit = type === "credito" ? parseCLP(str(fd, "credit_limit")) : null;

  const { error } = await supabase.from("accounts").insert({
    household_id: householdId,
    name,
    type,
    opening_balance: opening,
    credit_limit: limit && limit > 0 ? limit : null,
    billing_day: type === "credito" ? day("billing_day") : null,
    due_day: type === "credito" || type === "deuda" ? day("due_day") : null,
  });
  if (error) return fail("No se pudo crear la cuenta.");
  refreshAll();
  return { ok: true, message: `Cuenta "${name}" creada ✓` };
}

export async function setAccountArchived(fd: FormData) {
  const { supabase, householdId } = await getContext();
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return;
  await supabase
    .from("accounts")
    .update({ archived: str(fd, "archived") === "true" })
    .eq("id", id)
    .eq("household_id", householdId);
  refreshAll();
}

// ─────────────── Sobres (presupuesto) ───────────────

async function upsertBudgets(rows: { category_id: string; month: string; assigned: number }[]) {
  const { supabase, householdId } = await getContext();
  return supabase
    .from("budgets")
    .upsert(
      rows.map((r) => ({ ...r, household_id: householdId })),
      { onConflict: "category_id,month" },
    );
}

export async function assignBudget(_prev: FormState, fd: FormData): Promise<FormState> {
  const month = readMonth(fd);
  const categoryId = str(fd, "category_id");
  const assigned = parseCLP(str(fd, "assigned") || "0");
  if (!month || !UUID_RE.test(categoryId)) return fail("Datos no válidos.");
  if (assigned === null || assigned < 0) return fail("Monto no válido.");

  const { error } = await upsertBudgets([{ category_id: categoryId, month, assigned }]);
  if (error) return fail("No se pudo guardar el sobre.");
  refreshAll();
  return { ok: true, message: "Guardado ✓" };
}

export async function autoAssign(fd: FormData) {
  const month = readMonth(fd);
  if (!month) return;
  const [summary, household] = await Promise.all([getMonthSummary(month), getHousehold()]);
  if (summary.toAssign <= 0) return;

  const plan = proposeAllocation(
    summary.toAssign,
    summary.envelopes.map((e) => ({
      categoryId: e.categoryId,
      level: e.level,
      assigned: e.assigned,
      target: summary.previousAssigned.get(e.categoryId) ?? 0,
    })),
    {
      esencial: household.split_esencial,
      importante: household.split_importante,
      opcional: household.split_opcional,
    },
  );

  const rows = summary.envelopes
    .filter((e) => (plan.get(e.categoryId) ?? 0) > 0)
    .map((e) => ({ category_id: e.categoryId, month, assigned: e.assigned + plan.get(e.categoryId)! }));
  if (rows.length) await upsertBudgets(rows);
  refreshAll();
}

export async function moveMoney(_prev: FormState, fd: FormData): Promise<FormState> {
  const month = readMonth(fd);
  const from = str(fd, "from");
  const to = str(fd, "to");
  const amount = parseCLP(str(fd, "amount"));
  if (!month || !UUID_RE.test(from) || !UUID_RE.test(to)) return fail("Elige ambos sobres.");
  if (from === to) return fail("Elige sobres distintos.");
  if (!amount || amount <= 0) return fail("Escribe un monto mayor a $0.");

  const summary = await getMonthSummary(month);
  const source = summary.envelopes.find((e) => e.categoryId === from);
  const target = summary.envelopes.find((e) => e.categoryId === to);
  if (!source || !target) return fail("Sobre no encontrado.");
  if (source.assigned < amount) return fail(`${source.icon} ${source.name} solo tiene ${formatCLP(source.assigned)} asignado.`);

  const { error } = await upsertBudgets([
    { category_id: from, month, assigned: source.assigned - amount },
    { category_id: to, month, assigned: target.assigned + amount },
  ]);
  if (error) return fail("No se pudo mover la plata.");
  refreshAll();
  return { ok: true, message: `Movido de ${source.icon} a ${target.icon} ✓` };
}

// ─────────────── Categorías ───────────────

export async function createCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, householdId } = await getContext();
  const name = str(fd, "name").slice(0, 40);
  const icon = str(fd, "icon").slice(0, 8) || "🏷️";
  const kind = str(fd, "kind") === "ingreso" ? "ingreso" : "gasto";
  const level = Number(str(fd, "priority_level"));
  if (!name) return fail("Ponle un nombre.");
  if (kind === "gasto" && ![1, 2, 3].includes(level)) return fail("Elige la prioridad.");

  const { error } = await supabase.from("categories").insert({
    household_id: householdId,
    name,
    icon,
    kind,
    priority_level: kind === "gasto" ? level : null,
    sort_order: 99,
  });
  if (error) return fail("No se pudo crear la categoría.");
  refreshAll();
  return { ok: true, message: `Categoría ${icon} ${name} creada ✓` };
}

export async function updateCategory(fd: FormData) {
  const { supabase, householdId } = await getContext();
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return;
  const base = () => supabase.from("categories");

  if (fd.has("archived")) {
    await base()
      .update({ archived: str(fd, "archived") === "true" })
      .eq("id", id)
      .eq("household_id", householdId);
  }
  const level = Number(str(fd, "priority_level"));
  if (fd.has("priority_level") && [1, 2, 3].includes(level)) {
    // La prioridad solo aplica a categorías de gasto
    await base().update({ priority_level: level }).eq("id", id).eq("household_id", householdId).eq("kind", "gasto");
  }
  refreshAll();
}

// ─────────────── Hogar ───────────────

export async function updateHousehold(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, householdId } = await getContext();
  const name = str(fd, "name").slice(0, 60);
  const split = ["split_esencial", "split_importante", "split_opcional"].map((k) => Number(str(fd, k)));
  if (!name) return fail("Ponle un nombre al hogar.");
  if (split.some((n) => !Number.isInteger(n) || n < 0 || n > 100)) return fail("Porcentajes no válidos.");
  if (split.reduce((a, b) => a + b, 0) !== 100) return fail("Los porcentajes deben sumar 100%.");

  const { error } = await supabase
    .from("households")
    .update({ name, split_esencial: split[0], split_importante: split[1], split_opcional: split[2] })
    .eq("id", householdId);
  if (error) return fail("No se pudo guardar.");
  refreshAll();
  return { ok: true, message: "Hogar actualizado ✓" };
}

export async function createInvite(): Promise<FormState> {
  const { supabase, householdId } = await getContext();
  const { data, error } = await supabase
    .from("household_invites")
    .insert({ household_id: householdId })
    .select("code")
    .single();
  if (error || !data) return fail("No se pudo crear la invitación.");
  return { ok: true, message: data.code as string };
}

export async function acceptInvite(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await getContext();
  const code = str(fd, "code");
  if (!/^[A-Za-z0-9]{8}$/.test(code)) return fail("El código tiene 8 letras o números.");
  const { error } = await supabase.rpc("accept_household_invite", { invite_code: code });
  if (error) return fail("El código no es válido o ya expiró.");
  refreshAll();
  redirect("/");
}

export async function signOut() {
  const { supabase } = await getContext();
  await supabase.auth.signOut();
  redirect("/login");
}
