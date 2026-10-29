-- La función que usan las reglas RLS no debe quedar expuesta como RPC en la API.
-- Las políticas la referencian internamente, así que siguen funcionando al moverla.
create schema if not exists private;
alter function public.is_household_member(uuid) set schema private;
revoke all on function private.is_household_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
