import type { ReactNode } from "react";
import { formatCLP } from "@/lib/money";

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
export const labelClass = "mb-1 block text-sm font-medium text-muted";
export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 font-semibold text-on-brand transition hover:bg-brand-strong disabled:opacity-60";
export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 font-medium text-foreground transition hover:bg-surface-muted disabled:opacity-60";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>{children}</section>;
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {action}
    </div>
  );
}

export function Money({ amount, className = "", signed = false }: { amount: number; className?: string; signed?: boolean }) {
  const color = signed ? (amount > 0 ? "text-brand" : amount < 0 ? "text-foreground" : "text-muted") : "";
  const text = signed && amount > 0 ? `+${formatCLP(amount)}` : formatCLP(amount);
  return <span className={`tabular-nums ${color} ${className}`}>{text}</span>;
}

export function ProgressBar({ value, max, color = "bg-brand" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : value > 0 ? 100 : 0;
  const over = max >= 0 && value > max;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${over ? "bg-danger" : color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <div className="text-4xl">{icon}</div>
      <p className="mt-2 font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export const LEVEL_STYLES = {
  1: { text: "text-level-1", bar: "bg-level-1", dot: "bg-level-1" },
  2: { text: "text-level-2", bar: "bg-level-2", dot: "bg-level-2" },
  3: { text: "text-level-3", bar: "bg-level-3", dot: "bg-level-3" },
} as const;
