-- La ventana de días la calcula Postgres, no el navegador ni el render.
-- Dos razones: en Next 16 una página de servidor no puede llamar Date.now() durante el render, y
-- sobre todo la hora de Lima ya vivía aquí (el default de `fecha`): tenerla además en JavaScript
-- era la misma regla escrita dos veces, que es como empiezan las diferencias de un día.
create or replace function eventos_recientes(p_company uuid, p_dias int default 30)
returns setof eventos
language sql
stable
security definer
set search_path = public
as $$
  select *
  from eventos
  where company_id = p_company
    and fecha >= ((now() at time zone 'America/Lima')::date - greatest(least(p_dias, 365), 1))
  order by fecha desc, created_at desc
  limit 500;
$$;

revoke all on function eventos_recientes(uuid, int) from public;
grant execute on function eventos_recientes(uuid, int) to authenticated, service_role;
