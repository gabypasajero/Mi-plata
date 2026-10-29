import { Archive, ArchiveRestore, LogOut } from "lucide-react";
import type { Metadata } from "next";
import { signOut, updateCategory } from "@/app/actions";
import { Card, PageTitle, secondaryButtonClass } from "@/components/ui";
import { LEVELS } from "@/lib/budget";
import { getCategories, getHousehold, getMembers } from "@/lib/data";
import type { Category } from "@/lib/types";
import { CategoryForm, HouseholdForm, InviteBox, PrioritySelect } from "./settings-forms";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const [household, members, categories] = await Promise.all([getHousehold(), getMembers(), getCategories(true)]);
  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);

  return (
    <div className="space-y-6">
      <PageTitle>Ajustes</PageTitle>

      <Card>
        <h2 className="mb-3 font-bold">🏠 Hogar</h2>
        <HouseholdForm household={household} />
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">👨‍👩‍👧 Familia</h2>
        <p className="mb-3 text-sm text-muted">
          {members.length === 1 ? "Solo tú usas este hogar." : `${members.length} personas comparten este hogar.`}
        </p>
        <InviteBox />
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">🏷️ Categorías</h2>
        <div className="space-y-4">
          {LEVELS.map(({ level, name }) => (
            <CategoryGroup key={level} title={name} items={active.filter((c) => c.kind === "gasto" && c.priority_level === level)} />
          ))}
          <CategoryGroup title="Ingresos" items={active.filter((c) => c.kind === "ingreso")} />
          {archived.length > 0 && <CategoryGroup title="Archivadas" items={archived} />}
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="mb-2 font-semibold">Nueva categoría</h3>
          <CategoryForm />
        </div>
      </Card>

      <form action={signOut}>
        <button className={`${secondaryButtonClass} w-full`}>
          <LogOut className="size-4" /> Cerrar sesión
        </button>
      </form>
    </div>
  );
}

function CategoryGroup({ title, items }: { title: string; items: Category[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-muted">{title}</h3>
      <ul className="divide-y divide-border">
        {items.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            <span className="text-xl">{c.icon}</span>
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {c.kind === "gasto" && !c.archived && c.priority_level && <PrioritySelect id={c.id} level={c.priority_level} />}
            <form action={updateCategory}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="archived" value={String(!c.archived)} />
              <button className="rounded-lg p-1.5 text-muted hover:bg-surface-muted" aria-label={c.archived ? "Restaurar" : "Archivar"} title={c.archived ? "Restaurar" : "Archivar"}>
                {c.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
