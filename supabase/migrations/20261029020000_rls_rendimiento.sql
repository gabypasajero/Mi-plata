-- Rendimiento de RLS a escala: los hogares del usuario se calculan una vez por consulta
-- (subselect = initplan) en vez de llamar una función por cada fila.
create function private.my_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.household_members where user_id = (select auth.uid());
$$;
revoke all on function private.my_household_ids() from public, anon;
grant execute on function private.my_household_ids() to authenticated;

alter policy "miembros ven su hogar" on public.households
  using (id in (select private.my_household_ids()));
alter policy "miembros editan su hogar" on public.households
  using (id in (select private.my_household_ids()))
  with check (id in (select private.my_household_ids()));
alter policy "miembros ven a los miembros" on public.household_members
  using (household_id in (select private.my_household_ids()));

alter policy "perfil propio: ver" on public.profiles
  using (id = (select auth.uid()));
alter policy "perfil propio: editar" on public.profiles
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (current_household_id is null or current_household_id in (select private.my_household_ids()))
  );

alter policy "miembros ven invitaciones" on public.household_invites
  using (household_id in (select private.my_household_ids()));
alter policy "miembros crean invitaciones" on public.household_invites
  with check (household_id in (select private.my_household_ids()) and used_by is null);

alter policy "hogar: cuentas" on public.accounts
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
alter policy "hogar: categorías" on public.categories
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
alter policy "hogar: sobres" on public.budgets
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
alter policy "hogar: movimientos" on public.transactions
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

-- Índices para las llaves foráneas compuestas (borrados en cascada y joins)
create index transactions_account_household_idx on public.transactions (account_id, household_id);
create index transactions_category_household_idx on public.transactions (category_id, household_id);
create index budgets_category_household_idx on public.budgets (category_id, household_id);
create index profiles_current_household_idx on public.profiles (current_household_id);
