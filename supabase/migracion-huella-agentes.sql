-- LA HUELLA DE CADA AGENTE, QUE SOBREVIVE AL BORRADO DE UNA EMPRESA.
--
-- Hallazgo del rastreo adversarial (27-09-2026). `jobs` y `token_usage` cuelgan de la empresa con
-- `on delete cascade` (schema.sql:352 y :373). El 31-08 se eliminaron 18 empresas de 23, y con ellas
-- TODAS sus ejecuciones: cero filas huérfanas quedaron. Así que «este agente nunca ha corrido» era
-- una conclusión imposible de sostener — se estaba midiendo a los supervivientes y concluyendo sobre
-- la historia completa. Peor: la empresa viva más antigua nació 300 ms antes que el primer trabajo
-- registrado, así que la serie no empieza cuando arrancó el sistema, empieza cuando nació la única
-- empresa que nadie borró.
--
-- Esta tabla NO tiene company_id, a propósito: es lo único que puede responder «¿este agente corrió
-- alguna vez?» después de que se borre una empresa. Cuenta llamadas, no guarda contenido.

create table if not exists agente_huella (
  agente text primary key,
  llamadas bigint not null default 0,
  con_error bigint not null default 0,
  primera timestamptz,
  ultima timestamptz
);

alter table agente_huella enable row level security;
drop policy if exists agente_huella_consultor on agente_huella;
create policy agente_huella_consultor on agente_huella for select using (es_consultor());

create or replace function marcar_agente(p_agente text, p_error boolean default false)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into agente_huella (agente, llamadas, con_error, primera, ultima)
  values (p_agente, 1, case when p_error then 1 else 0 end, now(), now())
  on conflict (agente) do update
    set llamadas = agente_huella.llamadas + 1,
        con_error = agente_huella.con_error + case when p_error then 1 else 0 end,
        ultima = now();
$$;

-- SEMBRADO HONESTO. Se parte de lo que todavía se puede contar hoy, y se deja constancia de que eso
-- NO es el histórico completo: lo borrado el 31-08 no se puede recuperar ni estimar.
insert into agente_huella (agente, llamadas, con_error, primera, ultima)
select agente, count(*), count(*) filter (where error is not null), min(created_at), max(created_at)
from token_usage where agente is not null
group by agente
on conflict (agente) do nothing;

revoke all on function marcar_agente(text, boolean) from public;
grant execute on function marcar_agente(text, boolean) to authenticated, service_role;
