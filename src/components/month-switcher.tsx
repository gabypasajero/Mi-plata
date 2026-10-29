import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { addMonths, monthLabel } from "@/lib/dates";

/** Flechas para cambiar de mes; conserva los demás filtros de la URL. */
export function MonthSwitcher({ month, basePath, params = {} }: {
  month: string;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (m: string) => {
    const query = new URLSearchParams({ ...clean(params), mes: m.slice(0, 7) });
    return `${basePath}?${query}`;
  };
  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-surface px-2 py-1">
      <Link href={href(addMonths(month, -1))} className="rounded-lg p-2 text-muted hover:bg-surface-muted" aria-label="Mes anterior">
        <ChevronLeft className="size-5" />
      </Link>
      <span className="font-semibold">{monthLabel(month)}</span>
      <Link href={href(addMonths(month, 1))} className="rounded-lg p-2 text-muted hover:bg-surface-muted" aria-label="Mes siguiente">
        <ChevronRight className="size-5" />
      </Link>
    </div>
  );
}

function clean(params: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>;
}
