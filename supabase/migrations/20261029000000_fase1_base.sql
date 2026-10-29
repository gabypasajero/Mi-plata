-- Mi Plata — Fase 1: hogares, cuentas, categorías, sobres y movimientos.
-- Montos en pesos chilenos enteros (bigint, sin decimales).
-- Todo pertenece a un hogar (household); la seguridad (RLS) deja ver solo los hogares donde eres miembro.

-- ─────────────────────────── Hogares ───────────────────────────

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi hogar' check (char_length(name) between 1 and 60),
  -- Plantilla de reparto por prioridad (porcentajes que suman 100)
  split_esencial smallint not null default 50,
  split_importante smallint not null default 30,
  split_opcional smallint not null default 20,
  created_at timestamptz not null default now(),
  constraint households_split_100 check (split_esencial + split_importante + split_opcional = 100),
  constraint households_split_range check (
    split_esencial >= 0 and split_importante >= 0 and split_opcional >= 0
  )
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  current_household_id uuid references public.households (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_invites (
  code text primary key default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index household_invites_household_idx on public.household_invites (household_id);

-- ─────────────────────────── Finanzas ───────────────────────────

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  type text not null check (type in ('efectivo', 'corriente', 'credito', 'deuda')),
  opening_balance bigint not null default 0,
  credit_limit bigint check (credit_limit is null or credit_limit >= 0),
  billing_day smallint check (billing_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, household_id)
);
create index accounts_household_idx on public.accounts (household_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default '🏷️',
  color text not null default '#64748b',
  kind text not null default 'gasto' check (kind in ('gasto', 'ingreso')),
  -- 1 = Esencial, 2 = Importante, 3 = Opcional. Solo aplica a gastos.
  priority_level smallint check (priority_level between 1 and 3),
  parent_id uuid references public.categories (id) on delete set null,
  sort_order smallint not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  constraint categories_priority_kind check (
    (kind = 'gasto' and priority_level is not null) or (kind = 'ingreso' and priority_level is null)
  )
);
create index categories_household_idx on public.categories (household_id);

-- Un "sobre": lo asignado a una categoría en un mes.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid not null,
  month date not null check (extract(day from month) = 1),
  assigned bigint not null default 0 check (assigned >= 0),
  rollover boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, month),
  foreign key (category_id, household_id)
    references public.categories (id, household_id) on delete cascade
);
create index budgets_household_month_idx on public.budgets (household_id, month);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null,
  category_id uuid,
  -- Positivo = ingreso, negativo = gasto
  amount bigint not null check (amount <> 0),
  date date not null default (now() at time zone 'America/Santiago')::date,
  merchant text check (char_length(merchant) <= 80),
  note text check (char_length(note) <= 280),
  installment text check (installment ~ '^[0-9]{1,3}/[0-9]{1,3}$'),
  import_id uuid,
  receipt_path text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  -- La cuenta y la categoría deben ser del mismo hogar que el movimiento
  foreign key (account_id, household_id)
    references public.accounts (id, household_id) on delete cascade,
  foreign key (category_id, household_id)
    references public.categories (id, household_id) on delete set null (category_id)
);
create index transactions_household_date_idx on public.transactions (household_id, date desc);
create index transactions_category_date_idx on public.transactions (category_id, date);
create index transactions_account_idx on public.transactions (account_id);

-- Saldo de cada cuenta = saldo inicial + suma de movimientos (nunca se desincroniza).
create view public.account_balances
with (security_invoker = true) as
select
  a.id,
  a.household_id,
  (a.opening_balance + coalesce(sum(t.amount), 0))::bigint as balance
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;

-- Totales por categoría y mes (gasto = total negativo, ingreso = positivo).
create view public.category_month_totals
with (security_invoker = true) as
select
  household_id,
  category_id,
  date_trunc('month', date)::date as month,
  sum(amount)::bigint as total
from public.transactions
group by household_id, category_id, date_trunc('month', date);

-- ─────────────────────────── Seguridad (RLS) ───────────────────────────

create function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.profiles enable row level security;
alter table public.household_invites enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.budgets enable row level security;
alter table public.transactions enable row level security;

create policy "miembros ven su hogar" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "miembros editan su hogar" on public.households
  for update to authenticated
  using (public.is_household_member(id)) with check (public.is_household_member(id));

create policy "miembros ven a los miembros" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));

create policy "perfil propio: ver" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "perfil propio: editar" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (current_household_id is null or public.is_household_member(current_household_id))
  );

create policy "miembros ven invitaciones" on public.household_invites
  for select to authenticated using (public.is_household_member(household_id));
create policy "miembros crean invitaciones" on public.household_invites
  for insert to authenticated
  with check (public.is_household_member(household_id) and used_by is null);

create policy "hogar: cuentas" on public.accounts
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "hogar: categorías" on public.categories
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "hogar: sobres" on public.budgets
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "hogar: movimientos" on public.transactions
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ─────────────────────────── Alta de usuarios ───────────────────────────

create function public.seed_default_categories(hid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categories (household_id, name, icon, color, kind, priority_level, sort_order)
  values
    (hid, 'Arriendo / Dividendo', '🏠', '#0ea5e9', 'gasto', 1, 1),
    (hid, 'Cuentas básicas',      '💡', '#0ea5e9', 'gasto', 1, 2),
    (hid, 'Supermercado',         '🛒', '#0ea5e9', 'gasto', 1, 3),
    (hid, 'Transporte',           '🚌', '#0ea5e9', 'gasto', 1, 4),
    (hid, 'Salud',                '💊', '#0ea5e9', 'gasto', 1, 5),
    (hid, 'Educación',            '🎒', '#0ea5e9', 'gasto', 1, 6),
    (hid, 'Tarjetas y deudas',    '💳', '#8b5cf6', 'gasto', 2, 1),
    (hid, 'Fondo de emergencia',  '🛟', '#8b5cf6', 'gasto', 2, 2),
    (hid, 'Ahorro y metas',       '🐷', '#8b5cf6', 'gasto', 2, 3),
    (hid, 'Salidas y comida',     '🍔', '#f59e0b', 'gasto', 3, 1),
    (hid, 'Delivery',             '🛵', '#f59e0b', 'gasto', 3, 2),
    (hid, 'Ropa',                 '👕', '#f59e0b', 'gasto', 3, 3),
    (hid, 'Gustos',               '🎁', '#f59e0b', 'gasto', 3, 4),
    (hid, 'Suscripciones',        '📺', '#f59e0b', 'gasto', 3, 5),
    (hid, 'Sueldo',               '💼', '#10b981', 'ingreso', null, 1),
    (hid, 'Ventas',               '🏷️', '#10b981', 'ingreso', null, 2),
    (hid, 'Otros ingresos',       '💰', '#10b981', 'ingreso', null, 3);
$$;

-- Cada usuario nuevo recibe su hogar, una cuenta de efectivo y las categorías base.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  insert into public.households default values returning id into hid;
  insert into public.household_members (household_id, user_id, role) values (hid, new.id, 'owner');
  insert into public.profiles (id, display_name, current_household_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    hid
  );
  insert into public.accounts (household_id, name, type, created_by) values (hid, 'Efectivo', 'efectivo', new.id);
  perform public.seed_default_categories(hid);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Unirse a un hogar con un código de invitación.
create function public.accept_household_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.household_invites;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select * into inv from public.household_invites
  where code = upper(trim(invite_code))
  for update;

  if inv.code is null or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'El código no es válido o ya expiró';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), 'member')
  on conflict do nothing;

  update public.household_invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  update public.profiles set current_household_id = inv.household_id where id = auth.uid();

  return inv.household_id;
end;
$$;

revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.accept_household_invite(text) from public, anon;
grant execute on function public.accept_household_invite(text) to authenticated;

-- Permisos explícitos para la API (RLS sigue decidiendo qué filas ve cada uno).
grant select, insert, update, delete on
  public.households, public.household_members, public.profiles, public.household_invites,
  public.accounts, public.categories, public.budgets, public.transactions
to authenticated;
grant select on public.account_balances, public.category_month_totals to authenticated;
