"use client";

import { House, Landmark, List, PiggyBank, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Inicio", icon: House },
  { href: "/presupuesto", label: "Presupuesto", icon: PiggyBank },
  { href: "/agregar", label: "Agregar", icon: Plus, primary: true },
  { href: "/movimientos", label: "Movimientos", icon: List },
  { href: "/cuentas", label: "Cuentas", icon: Landmark },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md items-end justify-around px-2">
        {ITEMS.map(({ href, label, icon: Icon, primary }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          if (primary) {
            return (
              <li key={href} className="-mt-5">
                <Link
                  href={href}
                  aria-label={label}
                  className="flex size-14 items-center justify-center rounded-full bg-brand text-on-brand shadow-lg shadow-brand/30 transition hover:bg-brand-strong"
                >
                  <Icon className="size-7" strokeWidth={2.5} />
                </Link>
              </li>
            );
          }
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-16 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-brand" : "text-muted"}`}
              >
                <Icon className="size-6" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
