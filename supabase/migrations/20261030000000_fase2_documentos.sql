-- Mi Plata — Fase 2: subir documentos financieros (boletas, cartolas, facturas, Excel/CSV del banco…),
-- leerlos con IA y revisar los movimientos propuestos antes de guardarlos.

-- ─────────────────────────── Archivos ───────────────────────────

-- Bucket privado. Ruta de cada archivo: {household_id}/{import_id}/{nombre}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos', 'documentos', false, 15728640, -- 15 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'text/csv', 'text/plain', 'text/xml', 'application/xml', 'text/html',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/x-ofx', 'application/octet-stream'
  ]
)
on conflict (id) do nothing;

create policy "documentos: ver los de mi hogar" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] in (select h::text from private.my_household_ids() h));
create policy "documentos: subir a mi hogar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] in (select h::text from private.my_household_ids() h));
create policy "documentos: borrar los de mi hogar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] in (select h::text from private.my_household_ids() h));

-- ─────────────────────────── Documentos subidos ───────────────────────────

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  file_path text not null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  status text not null default 'subido'
    check (status in ('subido', 'procesando', 'por_revisar', 'revisado', 'no_financiero', 'error')),
  doc_type text,
  issuer text,
  summary text,
  error text,
  raw_json jsonb,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (id, household_id)
);
create index imports_household_created_idx on public.imports (household_id, created_at desc);

-- Movimientos que propuso la IA, a la espera de que alguien los confirme.
create table public.import_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  import_id uuid not null,
  position smallint not null default 0,
  date date not null,
  merchant text check (char_length(merchant) <= 80),
  description text check (char_length(description) <= 280),
  amount bigint not null check (amount <> 0),
  installment text check (installment ~ '^[0-9]{1,3}/[0-9]{1,3}$'),
  category_id uuid,
  account_id uuid,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptado', 'descartado')),
  duplicate_of uuid references public.transactions (id) on delete set null,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (import_id, household_id) references public.imports (id, household_id) on delete cascade,
  foreign key (category_id, household_id)
    references public.categories (id, household_id) on delete set null (category_id),
  foreign key (account_id, household_id)
    references public.accounts (id, household_id) on delete set null (account_id)
);
create index import_items_import_idx on public.import_items (import_id, household_id);
create index import_items_household_status_idx on public.import_items (household_id, status);
create index import_items_category_idx on public.import_items (category_id, household_id);
create index import_items_account_idx on public.import_items (account_id, household_id);
create index import_items_duplicate_idx on public.import_items (duplicate_of);
create index import_items_transaction_idx on public.import_items (transaction_id);

-- El movimiento recuerda de qué documento vino
alter table public.transactions
  add constraint transactions_import_fkey
  foreign key (import_id) references public.imports (id) on delete set null;
create index transactions_import_idx on public.transactions (import_id);

-- "La app aprende": comercio normalizado → categoría elegida por el hogar.
create table public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  pattern text not null check (char_length(pattern) between 2 and 80),
  category_id uuid not null,
  hits integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (household_id, pattern),
  foreign key (category_id, household_id)
    references public.categories (id, household_id) on delete cascade
);
create index merchant_rules_category_idx on public.merchant_rules (category_id, household_id);

-- ─────────────────────────── Seguridad (RLS) ───────────────────────────

alter table public.imports enable row level security;
alter table public.import_items enable row level security;
alter table public.merchant_rules enable row level security;

create policy "hogar: documentos" on public.imports
  for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy "hogar: por revisar" on public.import_items
  for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy "hogar: reglas por comercio" on public.merchant_rules
  for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

grant select, insert, update, delete on public.imports, public.import_items, public.merchant_rules to authenticated;

-- ─────────────────────────── Aceptar movimientos ───────────────────────────

-- Convierte ítems revisados en movimientos reales, todo o nada.
-- p_items: [{"id", "category_id", "account_id", "amount", "date", "merchant"}]
-- Corre con los permisos del usuario (security invoker): RLS sigue aplicando.
create function public.accept_import_items(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  tx uuid;
  accepted integer := 0;
begin
  for r in
    select * from jsonb_to_recordset(p_items)
      as x(id uuid, category_id uuid, account_id uuid, amount bigint, date date, merchant text)
  loop
    if r.account_id is null then
      raise exception 'Cada movimiento necesita una cuenta';
    end if;

    tx := null;
    insert into public.transactions
      (household_id, account_id, category_id, amount, date, merchant, note, installment, import_id)
    select i.household_id, r.account_id, r.category_id,
           coalesce(r.amount, i.amount), coalesce(r.date, i.date),
           coalesce(nullif(trim(r.merchant), ''), i.merchant), i.description, i.installment, i.import_id
    from public.import_items i
    where i.id = r.id and i.status = 'pendiente'
    returning id into tx;

    if tx is not null then
      update public.import_items
      set status = 'aceptado', transaction_id = tx, category_id = r.category_id, account_id = r.account_id
      where id = r.id;
      accepted := accepted + 1;
    end if;
  end loop;

  -- Los documentos sin ítems pendientes quedan revisados
  update public.imports d
  set status = 'revisado'
  where d.status = 'por_revisar'
    and d.id in (select i.import_id from public.import_items i
                 join jsonb_to_recordset(p_items) as x(id uuid) on x.id = i.id)
    and not exists (select 1 from public.import_items p where p.import_id = d.id and p.status = 'pendiente');

  return accepted;
end;
$$;

revoke execute on function public.accept_import_items(jsonb) from public, anon;
grant execute on function public.accept_import_items(jsonb) to authenticated;
