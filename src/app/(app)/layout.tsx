import { Settings } from "lucide-react";
import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-sm text-on-brand">$</span>
            Mi Plata
          </Link>
          <Link href="/ajustes" className="rounded-lg p-2 text-muted hover:bg-surface-muted" aria-label="Ajustes">
            <Settings className="size-5" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}
