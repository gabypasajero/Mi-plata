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

-- ───── Fase 2: documentos, archivos y aceptar movimientos ─────
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'carla@example.com');

do $$
declare ana_h uuid; carla_h uuid; ana_acc uuid; cat uuid; imp uuid; item uuid; n int; tx_amount bigint;
begin
  select current_household_id into ana_h from public.profiles where id = '00000000-0000-0000-0000-00000000000a';
  select current_household_id into carla_h from public.profiles where id = '00000000-0000-0000-0000-00000000000c';
  select id into ana_acc from public.accounts where household_id = ana_h and type = 'efectivo';
  select id into cat from public.categories where household_id = ana_h and name = 'Supermercado';

  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
  set local role authenticated;

  -- Archivos: Ana sube a su carpeta, no a la de Carla
  insert into storage.objects (bucket_id, name) values ('documentos', ana_h || '/x/boleta.jpg');
  begin
    insert into storage.objects (bucket_id, name) values ('documentos', carla_h || '/x/robo.jpg');
    raise exception 'FALLO: Ana subió un archivo al hogar de Carla';
  exception when insufficient_privilege then null;
  end;

  insert into public.imports (household_id, file_path, file_name, mime_type, size_bytes, status)
  values (ana_h, ana_h || '/x/boleta.jpg', 'boleta.jpg', 'image/jpeg', 1000, 'por_revisar')
  returning id into imp;
  insert into public.import_items (household_id, import_id, date, merchant, amount, category_id)
  values (ana_h, imp, '2026-10-20', 'Lider', -12990, cat) returning id into item;

  -- Acepta corrigiendo el monto: crea el movimiento, marca el ítem y cierra el documento
  n := public.accept_import_items(jsonb_build_array(jsonb_build_object(
    'id', item, 'category_id', cat, 'account_id', ana_acc, 'amount', -13990)));
  assert n = 1, 'aceptó 1 ítem: ' || n;
  select amount into tx_amount from public.transactions where import_id = imp;
  assert tx_amount = -13990, 'monto corregido: ' || tx_amount;
  assert (select status from public.import_items where id = item) = 'aceptado', 'ítem aceptado';
  assert (select status from public.imports where id = imp) = 'revisado', 'documento revisado';

  -- Aceptar dos veces no duplica
  n := public.accept_import_items(jsonb_build_array(jsonb_build_object('id', item, 'account_id', ana_acc)));
  assert n = 0, 'no acepta dos veces';

  insert into public.merchant_rules (household_id, pattern, category_id) values (ana_h, 'lider', cat);
  reset role;

  -- Carla no ve nada de Ana
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
  set local role authenticated;
  assert (select count(*) from public.imports) = 0, 'Carla no ve documentos ajenos';
  assert (select count(*) from public.import_items) = 0, 'Carla no ve ítems ajenos';
  assert (select count(*) from public.merchant_rules) = 0, 'Carla no ve reglas ajenas';
  assert (select count(*) from storage.objects) = 0, 'Carla no ve archivos ajenos';
  begin
    perform public.accept_import_items(jsonb_build_array(jsonb_build_object(
      'id', item, 'account_id', (select id from public.accounts limit 1))));
  exception when others then null;
  end;
  assert (select count(*) from public.transactions) = 0, 'Carla no puede aceptar ítems ajenos';
  reset role;
end $$;

select 'RLS OK ✅' as resultado;
