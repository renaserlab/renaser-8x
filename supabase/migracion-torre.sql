-- LA TORRE CUENTA EN SQL, NO EN JAVASCRIPT.
-- Antes traia filas con .limit(20000) y las contaba en memoria: un tope silencioso que hoy no muerde
-- (1.583 llamadas) pero que al crecer habria recortado los totales SIN AVISAR, mostrando numeros
-- menores como si fueran completos. Aqui se agrega en la base: exacto y sin tope.
--
-- Y NO SE MEZCLAN UNIDADES. Un TRABAJO (jobs) puede hacer varias LLAMADAS AL MODELO (token_usage),
-- y un trabajo puede REINTENTARSE. Contar unas por otras fue el error que infle al reportar "1.900
-- ejecuciones" y "269 fallidos": un LEFT JOIN con count(*) multiplica el trabajo por sus llamadas.

create or replace function torre_por_agente()
returns table (
  agente text,
  llamadas_modelo bigint,
  llamadas_con_error bigint,
  tokens_entrada bigint,
  tokens_salida bigint,
  latencia_media_ms bigint,
  latencia_max_ms bigint,
  -- Trabajos DISTINTOS en los que participo: no es lo mismo que llamadas.
  trabajos_distintos bigint,
  primera timestamptz,
  ultima timestamptz,
  modelos text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.agente::text,
    count(*)::bigint,
    count(*) filter (where t.error is not null)::bigint,
    coalesce(sum(t.tokens_entrada), 0)::bigint,
    coalesce(sum(t.tokens_salida), 0)::bigint,
    coalesce(round(avg(nullif(t.latencia_ms, 0))), 0)::bigint,
    coalesce(max(t.latencia_ms), 0)::bigint,
    count(distinct t.job_id)::bigint,
    min(t.created_at),
    max(t.created_at),
    array_agg(distinct t.modelo) filter (where t.modelo is not null)
  from token_usage t
  where t.agente is not null
  group by t.agente
$$;

-- Los totales, cada unidad contada por separado y en su propia subconsulta: ningun JOIN los multiplica.
create or replace function torre_totales()
returns table (
  trabajos bigint,
  trabajos_hechos bigint,
  trabajos_fallidos bigint,
  trabajos_en_curso bigint,
  trabajos_con_reintento bigint,
  reintentos bigint,
  llamadas_modelo bigint,
  llamadas_con_error bigint,
  agentes_que_corrieron bigint,
  desde timestamptz,
  hasta timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from jobs),
    (select count(*) from jobs where estado = 'hecho'),
    (select count(*) from jobs where estado = 'fallido'),
    (select count(*) from jobs where estado in ('pendiente', 'tomado')),
    (select count(*) from jobs where intentos > 1),
    (select coalesce(sum(greatest(intentos - 1, 0)), 0) from jobs),
    (select count(*) from token_usage),
    (select count(*) from token_usage where error is not null),
    (select count(distinct agente) from token_usage where agente is not null),
    (select least((select min(created_at) from jobs), (select min(created_at) from token_usage))),
    (select greatest((select max(created_at) from jobs), (select max(created_at) from token_usage)));
$$;

revoke all on function torre_por_agente() from public;
revoke all on function torre_totales() from public;
grant execute on function torre_por_agente() to authenticated, service_role;
grant execute on function torre_totales() to authenticated, service_role;

-- EL TOPE DE TOKENS TAMBIEN SE CONTABA EN JAVASCRIPT, y de eso depende que no haya un cobro
-- sorpresa. tokensUsados() traia todas las filas de la empresa y las sumaba en memoria; Supabase
-- devuelve como maximo 1.000 filas por peticion, asi que al cruzar ese numero la suma se habria
-- quedado corta EN SILENCIO y superaTope() habria dejado de frenar nada. La empresa que más trabaja ya tiene cientos de filas.
create or replace function tokens_de_empresa(p_company uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(tokens_entrada + tokens_salida), 0)::bigint
  from token_usage where company_id = p_company;
$$;

revoke all on function tokens_de_empresa(uuid) from public;
grant execute on function tokens_de_empresa(uuid) to authenticated, service_role;
