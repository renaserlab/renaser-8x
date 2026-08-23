-- ============================================================
-- 8X — Esquema completo. Pegar íntegro en el SQL Editor de Supabase.
-- Idempotente: se puede volver a correr.
-- ============================================================

create extension if not exists pgcrypto;

-- ============ USUARIOS ============

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sector text,
  estado_admision text check (estado_admision in ('candidata','admitida','rechazada')) default 'candidata',
  motivo_rechazo text,
  admision jsonb,
  fase_actual int check (fase_actual between 1 and 4) default 1,
  etapa text check (etapa in ('admision','levantamiento','contraste','diagnostico','espejo','implementacion','monitoreo','cerrado')) default 'admision',
  tope_tokens int default 2000000,
  created_at timestamptz default now()
);

create table if not exists users (
  id uuid primary key,
  nombre text,
  email text unique,
  rol text check (rol in ('consultor','cliente')) not null default 'cliente',
  created_at timestamptz default now()
);

create table if not exists memberships (
  user_id uuid references users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  nivel text check (nivel in ('dueno','lider','participante')) default 'dueno',
  primary key (user_id, company_id)
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  user_id uuid references users(id),
  nombre text not null,
  puesto text,
  rol text check (rol in ('dueno','socio','lider','empleado','cliente','consultor')),
  antiguedad text,
  token_hash text unique,                      -- sha256 del token; el token plano solo viaja una vez al crearse
  token_expira_at timestamptz,
  token_revocado_at timestamptz,
  token_usos int default 0,
  token_max_usos int default 200,
  token_canjeado_at timestamptz,               -- el enlace es de un solo uso: al canjearse, el hash pasa a ser el del token de sesión
  created_at timestamptz default now()
);
alter table participants drop column if exists token;
alter table participants add column if not exists token_canjeado_at timestamptz;
alter table participants add column if not exists token_hash text unique;
alter table participants add column if not exists token_expira_at timestamptz;
alter table participants add column if not exists token_revocado_at timestamptz;
alter table participants add column if not exists token_usos int default 0;
alter table participants add column if not exists token_max_usos int default 200;

-- ============ EVIDENCIA ============

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  tipo text check (tipo in ('documento','foto','audio','entrevista','dato','observacion')),
  nombre text not null,
  fecha_origen date,
  contenido text,
  storage_path text,
  mime text,
  origen text check (origen in ('cliente','consultor')) default 'cliente',
  estado text check (estado in ('subido','leyendo','leido','error')) default 'subido',
  error text,
  created_at timestamptz default now()
);
create index if not exists sources_company_idx on sources (company_id, created_at desc);

create table if not exists source_fragments (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete cascade,
  pagina int,
  seccion text,
  celda text,
  audio_desde int,
  audio_hasta int,
  texto text
);
create index if not exists source_fragments_source_idx on source_fragments (source_id);

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  source_id uuid references sources(id) not null,
  fragment_id uuid references source_fragments(id),
  participant_id uuid references participants(id),
  texto text not null,
  pilar text check (pilar in ('personas','procesos','producto','marketing','transversal')),
  tipo text,
  temporalidad text check (temporalidad in ('actual','historica','aspiracional')),
  fecha_afirmacion date,
  estado text check (estado in ('sin_verificar','confirmado','caducado','contradicho')) default 'sin_verificar',
  contradice_a uuid references claims(id),
  explicacion_contradiccion text,
  pregunta_sugerida text,
  prioridad_validacion boolean default false,
  response_id uuid,                          -- trazabilidad: PREGUNTA→RESPUESTA→AFIRMACIÓN
  idempotency_key text,                      -- hash(source, tramo, índice): un reintento no duplica
  validado_por uuid references users(id),
  validado_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists claims_pilar_estado_idx on claims (company_id, pilar, estado);
create index if not exists claims_tipo_temp_idx on claims (company_id, tipo, temporalidad);
create index if not exists claims_alerta_idx on claims (company_id, estado) where estado in ('caducado','contradicho');
create index if not exists claims_source_idx on claims (source_id);
alter table claims add column if not exists response_id uuid;
alter table claims add column if not exists idempotency_key text;
create unique index if not exists claims_idem_idx on claims (idempotency_key) where idempotency_key is not null;

-- Relaciones entre afirmaciones (1.12): no solo contradicción.
create table if not exists claim_relations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  claim_id uuid references claims(id) on delete cascade,
  related_id uuid references claims(id) on delete cascade,
  tipo text check (tipo in ('supports','contradicts','updates','explains','depends_on')) not null,
  explicacion text,
  origen text check (origen in ('regla','ia','consultor')) default 'ia',
  created_at timestamptz default now(),
  unique (claim_id, related_id, tipo)
);
create index if not exists claim_relations_company_idx on claim_relations (company_id, tipo);

-- ============ ENTREVISTA ============

create table if not exists interview_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  participant_id uuid references participants(id) not null,
  tipo text check (tipo in ('sueno_dueno','empresa_dueno','lider','personal','know_how','validacion')),
  estado text check (estado in ('pendiente','en_curso','completa')) default 'pendiente',
  created_at timestamptz default now()
);
create index if not exists interview_sessions_company_idx on interview_sessions (company_id);

create table if not exists interview_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references interview_sessions(id) on delete cascade,
  bloque text,
  pilar text,
  pregunta text not null,
  origen_claim_id uuid references claims(id),
  respuesta text,
  respuesta_audio_path text,
  orden int,
  created_at timestamptz default now(),
  respondido_at timestamptz
);
alter table interview_sessions add column if not exists bloques_cubiertos jsonb default '[]'::jsonb;

create index if not exists interview_responses_session_idx on interview_responses (session_id, orden);

create table if not exists know_how (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  participant_id uuid references participants(id),
  puesto text,
  situacion text, senal text, decision text, excepcion text, estandar text,
  error_frecuente text, regla_practica text, escalamiento text,
  destino text check (destino in ('sop','entrenamiento','checklist','criterio_calidad','agente','pendiente')) default 'pendiente',
  rol text,
  process_id uuid,                 -- FK añadida más abajo (processes se crea después)
  process_node_id uuid,
  criterio_experto text,
  criticidad text check (criticidad in ('alta','media','baja')) default 'media',
  documentado boolean default false,
  sop_id uuid,
  created_at timestamptz default now()
);
create index if not exists know_how_company_idx on know_how (company_id);
alter table know_how add column if not exists rol text;
alter table know_how add column if not exists process_id uuid;
alter table know_how add column if not exists process_node_id uuid;
alter table know_how add column if not exists criterio_experto text;
alter table know_how add column if not exists criticidad text default 'media';
alter table know_how add column if not exists documentado boolean default false;
alter table know_how add column if not exists sop_id uuid;

-- ============ DIAGNÓSTICO ============

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  pilar text not null,
  patron text,
  titulo text not null,
  causa_raiz text,
  impacto text check (impacto in ('alto','medio','bajo')),
  veredicto text check (veredicto in ('keep','improve','replace','remove','create')),
  recomendacion text,
  filtros jsonb,
  auditoria jsonb,
  origen text check (origen in ('ia','consultor')) default 'ia',
  estado_revision text check (estado_revision in ('pendiente','aprobado','corregido','rechazado')) default 'pendiente',
  requiere_validacion boolean default false,
  motivo_validacion text,
  created_at timestamptz default now()
);
create index if not exists findings_revision_idx on findings (company_id, estado_revision, pilar);
alter table findings add column if not exists requiere_validacion boolean default false;
alter table findings add column if not exists motivo_validacion text;

create table if not exists finding_evidence (
  finding_id uuid references findings(id) on delete cascade,
  claim_id uuid references claims(id) on delete cascade,
  relacion text check (relacion in ('sustenta','contradice')) default 'sustenta',
  primary key (finding_id, claim_id)
);

create table if not exists diagnoses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  pilar text not null,
  estado text check (estado in ('solido','mejorable','critico','desconocido')),
  resumen text,
  created_at timestamptz default now(),
  unique (company_id, pilar)
);

-- ============ PROCESOS ============

create table if not exists processes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  nombre text not null,
  area text,
  pilar text default 'procesos',
  version text check (version in ('as_is','to_be')) default 'as_is',
  origen text check (origen in ('dibujado','generado_ia')) default 'dibujado',
  padre_id uuid references processes(id),
  created_at timestamptz default now()
);
alter table processes add column if not exists confirmacion text check (confirmacion in ('borrador','por_confirmar','confirmado')) default 'borrador';
alter table processes add column if not exists deseo text;
create index if not exists processes_company_idx on processes (company_id);

create table if not exists process_nodes (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references processes(id) on delete cascade,
  tipo text check (tipo in ('inicio','actividad','decision','espera','fin')),
  etiqueta text not null,
  responsable text,
  ejecutor text check (ejecutor in ('humano','software','ia','hibrido')),
  tiempo text,
  herramienta text,
  problema text,
  veredicto text check (veredicto in ('keep','improve','replace','remove','create')),
  rol text,
  espera text,
  entrada text,
  salida text,
  evidencia text,
  estandar text,
  know_how_id uuid references know_how(id) on delete set null,
  pos_x float default 0,
  pos_y float default 0
);
create index if not exists process_nodes_idx on process_nodes (process_id);
alter table process_nodes add column if not exists rol text;
alter table process_nodes add column if not exists espera text;
alter table process_nodes add column if not exists entrada text;
alter table process_nodes add column if not exists salida text;
alter table process_nodes add column if not exists evidencia text;
alter table process_nodes add column if not exists estandar text;
alter table process_nodes add column if not exists know_how_id uuid references know_how(id) on delete set null;
alter table know_how add column if not exists process_node_id uuid;
do $$ begin
  alter table know_how add constraint know_how_process_fk foreign key (process_id) references processes(id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table know_how add constraint know_how_node_fk foreign key (process_node_id) references process_nodes(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists process_edges (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references processes(id) on delete cascade,
  origen uuid references process_nodes(id) on delete cascade,
  destino uuid references process_nodes(id) on delete cascade,
  etiqueta text
);
create index if not exists process_edges_idx on process_edges (process_id);

-- ============ SOP Y PLAN ============

create table if not exists sops (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references processes(id) on delete cascade,
  objetivo text, disparador text, responsable text,
  pasos jsonb, entradas jsonb, salidas jsonb, estandar text, indicador text, excepciones jsonb,
  created_at timestamptz default now()
);
create index if not exists sops_process_idx on sops (process_id);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  finding_id uuid references findings(id),
  prioridad int,
  fase text check (fase in ('implementacion','monitoreo')) default 'implementacion',
  semana_inicio int,
  semana_cierre int,
  accion text not null,
  responsable text, kpi text, evidencia text,
  impacto text check (impacto in ('alto','medio','bajo')),
  estado text check (estado in ('pendiente','en_curso','hecho','descartado')) default 'pendiente',
  nota text,
  vence_at date,
  updated_at timestamptz default now()
);
create index if not exists actions_company_idx on actions (company_id, estado);

create table if not exists checkpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  numero int,
  fecha date default current_date,
  que_se_hizo text, que_se_trabo text, indicadores jsonb, regresiones jsonb,
  created_at timestamptz default now()
);

-- ============ ENTREGA ============

create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  tipo text check (tipo in ('informe_realidad','diagnostico_4p','mapa_as_is','mapa_to_be','manual_procesos','plan_90','mapa_automatizacion')),
  contenido jsonb,
  version int default 1,
  publicado boolean default false,
  publicado_at timestamptz,
  publicado_por uuid references users(id),
  created_at timestamptz default now()
);
create index if not exists deliverables_company_idx on deliverables (company_id, tipo, version desc);

-- ============ COLA DE TRABAJOS ============

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  tipo text not null,
  payload jsonb,
  prioridad int default 5,
  estado text check (estado in ('pendiente','corriendo','hecho','fallido')) default 'pendiente',
  intentos int default 0,
  max_intentos int default 3,
  lease_expira_at timestamptz,
  idempotency_key text unique,
  progreso text,
  resultado jsonb,
  error text,
  tomado_at timestamptz,
  terminado_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists jobs_cola_idx on jobs (estado, prioridad, created_at);
create index if not exists jobs_company_idx on jobs (company_id, estado);

create table if not exists token_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  job_id uuid references jobs(id),
  agente text,
  tokens_entrada int,
  tokens_salida int,
  modelo text,
  version_prompt text,
  latencia_ms int,
  error text,
  created_at timestamptz default now()
);
create index if not exists token_usage_company_idx on token_usage (company_id);
alter table token_usage add column if not exists modelo text;
alter table token_usage add column if not exists version_prompt text;
alter table token_usage add column if not exists latencia_ms int;
alter table token_usage add column if not exists error text;

-- Invitaciones (P1-16): un cliente que se registra después queda enlazado al entrar.
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  email text not null,
  nivel text check (nivel in ('dueno','lider','participante')) default 'dueno',
  aceptada_at timestamptz,
  created_at timestamptz default now(),
  unique (company_id, email)
);

-- Agent Designer (16): solo la ficha. Sin runtime. Un nodo ia/hibrido puede tener una especificación.
create table if not exists agent_specs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  process_node_id uuid references process_nodes(id) on delete cascade,
  nombre text not null,
  mision text,
  trigger_desc text,
  inputs jsonb, outputs jsonb, conocimiento jsonb, herramientas jsonb, reglas jsonb,
  autoridad text, acciones_prohibidas jsonb, escalamiento text,
  aprobacion_humana boolean default true,
  version int default 1,
  estado text check (estado in ('borrador','aprobado','retirado')) default 'borrador',
  created_at timestamptz default now()
);

-- ============ APRENDIZAJE ============

create table if not exists corrections (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid references findings(id),
  user_id uuid references users(id),
  accion text check (accion in ('aprobado','corregido','rechazado')),
  texto_corregido text,
  motivo text check (motivo in ('sin_evidencia','sintoma_no_causa','impacto_mal_calibrado','ya_resuelto','fuera_de_alcance','contradice_filtro_proposito','otro')),
  comentario text,
  created_at timestamptz default now()
);

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  perfil jsonb, hallazgos_validados jsonb,
  plan_aplicado jsonb, resultado_90d jsonb,
  cerrado_at timestamptz
);

create table if not exists eval_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id),
  version_prompt text,
  cobertura float, precision float, detalle jsonb,
  created_at timestamptz default now()
);

-- ============ VISTA PARA LA BANDEJA ============

drop materialized view if exists company_stats;
create materialized view company_stats as
select
  c.id as company_id,
  (select count(*) from sources s where s.company_id=c.id)                                              as fuentes,
  (select count(*) from claims cl where cl.company_id=c.id)                                             as afirmaciones,
  (select count(*) from claims cl where cl.company_id=c.id and cl.estado='confirmado')                  as confirmadas,
  (select count(*) from claims cl where cl.company_id=c.id and cl.estado='contradicho')                 as contradichas,
  (select count(*) from claims cl where cl.company_id=c.id and cl.estado='sin_verificar')               as sin_verificar,
  (select count(*) from interview_responses ir join interview_sessions ise on ise.id=ir.session_id
     where ise.company_id=c.id and ir.respuesta is null)                                                as preguntas_abiertas,
  (select count(*) from findings f where f.company_id=c.id and f.estado_revision='pendiente')           as hallazgos_por_revisar,
  (select count(*) from jobs j where j.company_id=c.id and j.estado='fallido')                          as trabajos_fallidos,
  (select count(*) from actions a where a.company_id=c.id and a.estado in ('pendiente','en_curso') and a.vence_at < current_date) as frentes_vencidos,
  greatest(
    (select max(created_at) from sources s where s.company_id=c.id),
    (select max(created_at) from claims cl where cl.company_id=c.id),
    (select max(respondido_at) from interview_responses ir join interview_sessions ise on ise.id=ir.session_id where ise.company_id=c.id),
    c.created_at
  ) as ultima_actividad
from companies c;
create unique index if not exists company_stats_pk on company_stats (company_id);

create or replace function refresh_company_stats() returns void
language sql security definer as $$
  refresh materialized view concurrently company_stats;
$$;

-- ============ FUNCIONES DE COLA ============

-- Fairness (13.1): ninguna empresa monopoliza los workers. Un trabajo pesado (prioridad >= 5) solo se toma si su
-- empresa tiene menos de max_pesados_por_empresa corriendo. Los interactivos (p < 5) nunca esperan por esta regla.
-- Tope global (13.2): no se toma nada si ya hay max_global corriendo (suma de todos los workers).
drop function if exists take_job(int);
create or replace function take_job(lease_minutes int default 10, max_pesados_por_empresa int default 2, max_global int default 12)
returns setof jobs language sql security definer as $$
  update jobs
  set estado='corriendo', tomado_at=now(), intentos=intentos+1,
      lease_expira_at = now() + make_interval(mins => lease_minutes)
  where id = (
    select j.id from jobs j
    where j.estado='pendiente'
      and (select count(*) from jobs r where r.estado='corriendo') < max_global
      and (j.prioridad < 5 or (select count(*) from jobs r where r.estado='corriendo' and r.company_id = j.company_id and r.prioridad >= 5) < max_pesados_por_empresa)
    order by j.prioridad, j.created_at
    for update skip locked
    limit 1
  )
  returning *;
$$;

-- Heartbeat (P1-13): el worker renueva el lease de sus trabajos vivos; un trabajo largo no se duplica.
create or replace function heartbeat_jobs(ids uuid[], lease_minutes int default 10) returns int
language sql security definer as $$
  with u as (update jobs set lease_expira_at = now() + make_interval(mins => lease_minutes) where id = any(ids) and estado='corriendo' returning 1)
  select count(*)::int from u;
$$;

create or replace function recover_stale_jobs() returns int
language plpgsql security definer as $$
declare n int;
begin
  with r as (
    update jobs set estado = case when intentos >= max_intentos then 'fallido' else 'pendiente' end,
      error = case when intentos >= max_intentos then coalesce(error,'') || ' [lease vencido]' else error end
    where estado='corriendo' and lease_expira_at < now()
    returning 1
  ) select count(*) into n from r;
  return n;
end $$;

-- ============ PERFIL AUTOMÁTICO AL REGISTRARSE ============

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, nombre, rol)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)), 'cliente')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

create table if not exists company_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  bloque text not null,
  clave text not null,
  estado text check (estado in ('lo_tengo','incompleto','no_lo_tengo','no_se')),
  nota text,
  source_id uuid references sources(id),
  updated_at timestamptz default now(),
  unique (company_id, clave)
);
alter table company_assets enable row level security;
create policy company_assets_cliente on company_assets for all using (company_id in (select mis_empresas())) with check (company_id in (select mis_empresas()));
create policy company_assets_consultor on company_assets for all using (es_consultor()) with check (es_consultor());

-- ============ HELPERS RLS ============

create or replace function es_consultor() returns boolean
language sql stable security definer as $$
  select exists (select 1 from users where id = auth.uid() and rol='consultor');
$$;

create or replace function mis_empresas() returns setof uuid
language sql stable security definer as $$
  select company_id from memberships where user_id = auth.uid();
$$;

-- ============ RLS ============
-- Consultor: todo. Cliente: solo sus empresas y solo lo que la frontera permite.
-- El worker y las rutas de servidor usan la service role (salta RLS) y aplican la frontera en código.

do $$
declare t text;
begin
  foreach t in array array['companies','users','memberships','participants','sources','source_fragments','claims',
    'interview_sessions','interview_responses','know_how','findings','finding_evidence','diagnoses','processes',
    'process_nodes','process_edges','sops','actions','checkpoints','deliverables','jobs','token_usage','corrections','cases','eval_runs',
    'claim_relations','invitations','agent_specs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists consultor_todo on %I', t);
    execute format('create policy consultor_todo on %I for all using (es_consultor()) with check (es_consultor())', t);
  end loop;
end $$;

drop policy if exists cliente_users on users;
create policy cliente_users on users for select using (id = auth.uid());

drop policy if exists cliente_companies on companies;
create policy cliente_companies on companies for select using (id in (select mis_empresas()));

drop policy if exists cliente_memberships on memberships;
create policy cliente_memberships on memberships for select using (user_id = auth.uid());

-- P0-04: el cliente NO lee participants (contiene credenciales). Usa la vista participants_cliente.
drop policy if exists cliente_participants on participants;

drop policy if exists cliente_sources on sources;
create policy cliente_sources on sources for all using (company_id in (select mis_empresas())) with check (company_id in (select mis_empresas()) and origen='cliente');

drop policy if exists cliente_fragments on source_fragments;
create policy cliente_fragments on source_fragments for select using (source_id in (select id from sources where company_id in (select mis_empresas())));

-- P0-02: el cliente NO lee claims (estado, pilar, contradicciones son internos). Usa la vista claims_cliente.
drop policy if exists cliente_claims on claims;

-- P0-03: un usuario solo lee sus propias sesiones y respuestas (participants.user_id = auth.uid()). Las de empleados, nunca.
drop policy if exists cliente_sessions on interview_sessions;
create policy cliente_sessions on interview_sessions for select
  using (participant_id in (select id from participants where user_id = auth.uid()));
drop policy if exists cliente_responses on interview_responses;
create policy cliente_responses on interview_responses for select
  using (session_id in (select s.id from interview_sessions s join participants p on p.id = s.participant_id where p.user_id = auth.uid()));

drop policy if exists cliente_findings on findings;
create policy cliente_findings on findings for select using (company_id in (select mis_empresas()) and estado_revision in ('aprobado','corregido'));
drop policy if exists cliente_evidence on finding_evidence;
create policy cliente_evidence on finding_evidence for select using (finding_id in (select id from findings where company_id in (select mis_empresas()) and estado_revision in ('aprobado','corregido')));

drop policy if exists cliente_processes on processes;
create policy cliente_processes on processes for select using (company_id in (select mis_empresas()));
drop policy if exists cliente_nodes on process_nodes;
create policy cliente_nodes on process_nodes for select using (process_id in (select id from processes where company_id in (select mis_empresas())));
drop policy if exists cliente_edges on process_edges;
create policy cliente_edges on process_edges for select using (process_id in (select id from processes where company_id in (select mis_empresas())));
drop policy if exists cliente_sops on sops;
create policy cliente_sops on sops for select using (process_id in (select id from processes where company_id in (select mis_empresas())));

drop policy if exists cliente_actions on actions;
create policy cliente_actions on actions for select using (company_id in (select mis_empresas()));
drop policy if exists cliente_actions_upd on actions;
create policy cliente_actions_upd on actions for update using (company_id in (select mis_empresas())) with check (company_id in (select mis_empresas()));

drop policy if exists cliente_deliverables on deliverables;
create policy cliente_deliverables on deliverables for select using (company_id in (select mis_empresas()) and publicado = true);

-- corrections, cases, eval_runs, jobs, token_usage, diagnoses, know_how: sin política de cliente → invisibles.

-- ============ STORAGE ============

insert into storage.buckets (id, name, public) values ('fuentes','fuentes', false)
on conflict (id) do nothing;

drop policy if exists fuentes_consultor on storage.objects;
create policy fuentes_consultor on storage.objects for all
  using (bucket_id='fuentes' and es_consultor()) with check (bucket_id='fuentes' and es_consultor());

drop policy if exists fuentes_cliente on storage.objects;
create policy fuentes_cliente on storage.objects for all
  using (bucket_id='fuentes' and (storage.foldername(name))[1]::uuid in (select mis_empresas()))
  with check (bucket_id='fuentes' and (storage.foldername(name))[1]::uuid in (select mis_empresas()));

-- Limpieza de archivos huérfanos (P2-04): la API la llama al borrar una empresa.
create or replace function archivos_de_empresa(p_company_id uuid) returns setof text
language sql security definer as $$
  select name from storage.objects where bucket_id = 'fuentes' and (storage.foldername(name))[1] = p_company_id::text;
$$;
revoke execute on function archivos_de_empresa(uuid) from public, anon, authenticated;
grant execute on function archivos_de_empresa(uuid) to service_role;

-- ============ REALTIME ============

do $$ begin alter publication supabase_realtime add table jobs; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table claims; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table interview_responses; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table sources; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table findings; exception when duplicate_object then null; end $$;

-- ============ VISTAS SEGURAS PARA EL CLIENTE (P0-02, P0-04) ============
-- Las vistas corren como su dueño (no heredan RLS de la tabla); el filtro de pertenencia va dentro.
-- security_barrier evita que un predicado del cliente se evalúe antes del filtro.

drop view if exists claims_cliente;
create view claims_cliente with (security_barrier = true) as
select
  c.id,
  c.company_id,
  c.texto,
  c.fecha_afirmacion,
  s.nombre  as fuente_nombre,
  s.tipo    as fuente_tipo,
  (c.estado = 'contradicho' or (c.estado = 'sin_verificar' and c.prioridad_validacion)) as requiere_validacion,
  case when c.estado = 'contradicho' then 'Aquí hay dos versiones distintas. ¿Cuál es la verdad hoy?'
       else '¿Esto sigue siendo verdad?' end as pregunta,
  array['si','ya_no','nunca']::text[] as opciones
from claims c
join sources s on s.id = c.source_id
where c.company_id in (select mis_empresas())
  and (c.participant_id is null or c.participant_id in (select id from participants where user_id = auth.uid()));
revoke all on claims_cliente from public, anon;
grant select on claims_cliente to authenticated;

drop view if exists participants_cliente;
create view participants_cliente with (security_barrier = true) as
select id, company_id, nombre, puesto, rol, created_at
from participants
where company_id in (select mis_empresas());
revoke all on participants_cliente from public, anon;
grant select on participants_cliente to authenticated;

-- ============ GUARDADO ATÓMICO DEL CANVAS (P0-05) ============
-- Nodos y conexiones en una sola transacción. Los ids temporales (_tmp) se resuelven aquí.
-- Si una conexión apunta a un nodo inexistente → exception → rollback completo.

create or replace function guardar_proceso(p_process_id uuid, p_nombre text, p_area text, p_nodos jsonb, p_edges jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n jsonb; e jsonb;
  mapa jsonb := '{}'::jsonb;
  nuevo_id uuid;
  conservados uuid[] := '{}';
  o uuid; d uuid;
begin
  if p_nombre is not null then update processes set nombre = p_nombre where id = p_process_id; end if;
  if p_area is not null then update processes set area = p_area where id = p_process_id; end if;

  for n in select * from jsonb_array_elements(p_nodos) loop
    if (n->>'id') is not null and exists (select 1 from process_nodes where id = (n->>'id')::uuid and process_id = p_process_id) then
      update process_nodes set
        tipo = n->>'tipo', etiqueta = coalesce(nullif(n->>'etiqueta',''),'…'),
        responsable = n->>'responsable', ejecutor = n->>'ejecutor', tiempo = n->>'tiempo',
        herramienta = n->>'herramienta', problema = n->>'problema', veredicto = nullif(n->>'veredicto',''),
        rol = n->>'rol', espera = n->>'espera', entrada = n->>'entrada', salida = n->>'salida', evidencia = n->>'evidencia', estandar = n->>'estandar',
        know_how_id = nullif(n->>'know_how_id','')::uuid,
        pos_x = coalesce((n->>'pos_x')::float,0), pos_y = coalesce((n->>'pos_y')::float,0)
      where id = (n->>'id')::uuid;
      nuevo_id := (n->>'id')::uuid;
    else
      insert into process_nodes (process_id, tipo, etiqueta, responsable, ejecutor, tiempo, herramienta, problema, veredicto, rol, espera, entrada, salida, evidencia, estandar, know_how_id, pos_x, pos_y)
      values (p_process_id, n->>'tipo', coalesce(nullif(n->>'etiqueta',''),'…'), n->>'responsable', n->>'ejecutor', n->>'tiempo',
              n->>'herramienta', n->>'problema', nullif(n->>'veredicto',''), n->>'rol', n->>'espera', n->>'entrada', n->>'salida', n->>'evidencia', n->>'estandar',
              nullif(n->>'know_how_id','')::uuid, coalesce((n->>'pos_x')::float,0), coalesce((n->>'pos_y')::float,0))
      returning id into nuevo_id;
    end if;
    conservados := conservados || nuevo_id;
    mapa := mapa || jsonb_build_object(coalesce(n->>'_tmp', n->>'id', nuevo_id::text), nuevo_id::text);
  end loop;

  delete from process_nodes where process_id = p_process_id and not (id = any(conservados));
  delete from process_edges where process_id = p_process_id;

  for e in select * from jsonb_array_elements(p_edges) loop
    o := (mapa->>(e->>'origen'))::uuid;
    d := (mapa->>(e->>'destino'))::uuid;
    if o is null or d is null then
      raise exception 'conexion_invalida: % -> %', e->>'origen', e->>'destino';
    end if;
    insert into process_edges (process_id, origen, destino, etiqueta) values (p_process_id, o, d, e->>'etiqueta');
  end loop;

  return mapa;
end $$;

-- ============ PERMISOS DE FUNCIONES (P0-01) ============
-- Las RPC de la cola y el guardado solo las llama el servidor con la service role. Nunca el navegador.
revoke execute on function take_job(int, int, int) from public, anon, authenticated;
revoke execute on function heartbeat_jobs(uuid[], int) from public, anon, authenticated;
grant execute on function heartbeat_jobs(uuid[], int) to service_role;
revoke execute on function recover_stale_jobs() from public, anon, authenticated;
revoke execute on function refresh_company_stats() from public, anon, authenticated;
revoke execute on function guardar_proceso(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function take_job(int, int, int) to service_role;
grant execute on function recover_stale_jobs() to service_role;
grant execute on function refresh_company_stats() to service_role;
grant execute on function guardar_proceso(uuid, text, text, jsonb, jsonb) to service_role;
-- es_consultor() y mis_empresas() deben seguir ejecutables por authenticated: las usan las políticas RLS.
grant execute on function es_consultor() to authenticated;
grant execute on function mis_empresas() to authenticated;

-- ============ PRIMER CONSULTOR ============
-- Tras registrarte en la app con tu correo, ejecuta una vez:
--   update users set rol='consultor' where email='tu@correo.com';

-- La vista de bandeja solo la lee el servidor (service role).
revoke select on company_stats from anon, authenticated;
