-- PROCEDENCIA DE LAS EJECUCIONES (instrucción maestra §3 y §9).
--
-- El inspector declaraba cuatro huecos. Esta migración cierra tres de ellos para las ejecuciones
-- NUEVAS: qué fuentes leyó, con qué configuración corrió y a qué paso entregó. El cuarto —el
-- contexto exacto enviado al modelo— NO se guarda a propósito: es el material del cliente completo,
-- y almacenarlo duplicado multiplica la superficie de exposición sin añadir nada que las referencias
-- no den. Se guardan REFERENCIAS Y VERSIONES, no copias.
--
-- Los huecos históricos siguen siendo huecos: estas columnas nacen vacías y las ejecuciones
-- anteriores no se rellenan por inferencia. La pantalla dice «no se registraba entonces».

-- LA TRANSFERENCIA AL SIGUIENTE PASO. Se lee en los dos sentidos: de quién vino y a qué dio lugar.
alter table jobs add column if not exists origen_job_id uuid references jobs(id) on delete set null;
create index if not exists jobs_origen_idx on jobs (origen_job_id) where origen_job_id is not null;

-- LAS FUENTES QUE LEYÓ, por referencia: [{ id, nombre, version }]. Nunca el contenido.
alter table jobs add column if not exists fuentes_usadas jsonb not null default '[]'::jsonb;

-- LA CONFIGURACIÓN EFECTIVA con la que corrió cada llamada: la versión del contrato que la limitó.
-- `version_prompt` ya estaba; sin la del contrato no se puede saber con qué presupuesto corrió.
alter table token_usage add column if not exists contrato_version text;

-- LAS FUENTES DE LO CONSTRUIDO. Un proceso y un puesto salen de documentos, y hasta hoy no guardaban
-- cuáles: los procesos de la primera empresa cliente no saben de qué PDF vienen. Se registra para lo nuevo.
alter table processes add column if not exists fuentes_usadas jsonb not null default '[]'::jsonb;
alter table org_puestos add column if not exists fuentes_usadas jsonb not null default '[]'::jsonb;

-- La cadena de entrega de un trabajo, en los dos sentidos y sin recursión infinita.
create or replace function cadena_de_trabajo(p_job uuid)
returns table (id uuid, tipo text, estado text, direccion text, creado timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  -- De dónde vino (hasta 5 saltos hacia atrás).
  with recursive arriba as (
    select j.id, j.tipo, j.estado, j.origen_job_id, j.created_at, 0 as salto
    from jobs j where j.id = p_job
    union all
    select p.id, p.tipo, p.estado, p.origen_job_id, p.created_at, a.salto + 1
    from jobs p join arriba a on p.id = a.origen_job_id where a.salto < 5
  )
  select a.id, a.tipo::text, a.estado::text, 'vino_de'::text, a.created_at
  from arriba a where a.salto > 0
  union all
  -- A qué dio lugar (hijos directos).
  select h.id, h.tipo::text, h.estado::text, 'entrego_a'::text, h.created_at
  from jobs h where h.origen_job_id = p_job
$$;

revoke all on function cadena_de_trabajo(uuid) from public;
grant execute on function cadena_de_trabajo(uuid) to authenticated, service_role;
