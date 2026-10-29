-- Prueba de seguridad: cada hogar ve solo lo suyo. Falla (ERROR) si algo se filtra.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@example.com');

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

do $$
declare
  ana_h uuid; beto_h uuid; ana_acc uuid; beto_acc uuid; cat uuid; n int; code text;
begin
  select current_household_id into ana_h from public.profiles where id = '00000000-0000-0000-0000-00000000000a';
  select current_household_id into beto_h from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  assert ana_h is not null and beto_h is not null and ana_h <> beto_h, 'cada usuario tiene su hogar';
  select count(*) into n from public.categories where household_id = ana_h;
  assert n = 17, 'categorías base sembradas: ' || n;
  select id into ana_acc from public.accounts where household_id = ana_h;
  select id into beto_acc from public.accounts where household_id = beto_h;

  -- Desde aquí, como usuario autenticado Ana
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
  set local role authenticated;

  select count(*) into n from public.accounts;
  assert n = 1, 'Ana ve solo su cuenta, vio ' || n;
  select count(*) into n from public.categories where household_id = beto_h;
  assert n = 0, 'Ana no ve categorías de Beto';

  select id into cat from public.categories where household_id = ana_h and name = 'Supermercado';
  insert into public.transactions (household_id, account_id, category_id, amount, merchant)
  values (ana_h, ana_acc, cat, -25990, 'Lider');
  select balance into n from public.account_balances where id = ana_acc;
  assert n = -25990, 'saldo calculado: ' || n;
  select total into n from public.category_month_totals where category_id = cat;
  assert n = -25990, 'total del mes por categoría: ' || n;
  select count(*) into n from public.category_month_totals where household_id = beto_h;
  assert n = 0, 'Ana no ve totales de Beto';

  -- Ana no puede escribir en el hogar de Beto
  begin
    insert into public.transactions (household_id, account_id, amount) values (beto_h, beto_acc, -1000);
    raise exception 'FALLO: Ana insertó en el hogar de Beto';
  exception when insufficient_privilege then null;
  end;

  -- Ni mezclar su hogar con la cuenta de Beto (FK compuesta)
  begin
    insert into public.transactions (household_id, account_id, amount) values (ana_h, beto_acc, -1000);
    raise exception 'FALLO: movimiento con cuenta de otro hogar';
  exception when foreign_key_violation then null;
  end;

  -- Ana no puede cambiarse a un hogar ajeno
  begin
    update public.profiles set current_household_id = beto_h where id = auth.uid();
    raise exception 'FALLO: Ana se cambió a un hogar ajeno';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Verifica que el update anterior no tuvo efecto y prueba invitaciones
do $$
declare ana_h uuid; beto_h uuid; code text; n int;
begin
  select current_household_id into ana_h from public.profiles where id = '00000000-0000-0000-0000-00000000000a';
  select current_household_id into beto_h from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  assert ana_h <> beto_h, 'Ana sigue en su hogar';

  -- Ana invita a Beto
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
  set local role authenticated;
  insert into public.household_invites (household_id) values (ana_h) returning household_invites.code into code;
  reset role;

  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
  set local role authenticated;
  perform public.accept_household_invite(lower(code));
  select count(*) into n from public.transactions where household_id = ana_h;
  assert n = 1, 'Beto ahora ve los movimientos del hogar de Ana';
  begin
    perform public.accept_household_invite(code);
    raise exception 'FALLO: invitación reutilizada';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;
end $$;

select 'RLS OK ✅' as resultado;
