-- ============================================================================
-- GOBIERNO, TRAZABILIDAD Y CONTROL — hallazgos de la auditoría del 29-08-2026.
-- Cierra: registro de auditoría (ISO 27001 A.8.15), límite de peticiones (A.8.6),
-- registro de errores (A.8.16), control documental (ISO 9001 7.5) y
-- consentimiento de datos personales (Ley 29733 Perú).
-- ============================================================================

-- ---------- 1. REGISTRO DE AUDITORÍA: quién hizo qué, cuándo y sobre qué ----------
create table if not exists audit_log (
  id bigserial primary key,
  company_id uuid references companies(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  actor_rol text,
  accion text not null,          -- 'ver' | 'crear' | 'editar' | 'eliminar' | 'publicar' | 'aprobar' | 'descargar' | 'entrar' | 'salir'
  entidad text,                  -- tabla o recurso afectado
  entidad_id text,
  detalle jsonb default '{}'::jsonb,
  ruta text,
  ip text,
  created_at timestamptz default now()
);
create index if not exists audit_company_idx on audit_log (company_id, created_at desc);
create index if not exists audit_actor_idx on audit_log (actor_id, created_at desc);
create index if not exists audit_accion_idx on audit_log (accion, created_at desc);

-- El registro es inmutable: nadie edita ni borra su propio rastro.
alter table audit_log enable row level security;
drop policy if exists audit_cliente on audit_log;
create policy audit_cliente on audit_log for select using (company_id in (select mis_empresas()));
drop policy if exists audit_consultor on audit_log;
create policy audit_consultor on audit_log for select using (es_consultor());
revoke insert, update, delete on audit_log from anon, authenticated;

-- ---------- 2. LÍMITE DE PETICIONES: ventana deslizante por clave ----------
create table if not exists rate_limits (
  clave text primary key,
  ventana_inicio timestamptz not null default now(),
  conteo int not null default 0
);
alter table rate_limits enable row level security;
revoke all on rate_limits from anon, authenticated;

-- Cuenta y decide en UNA sola ida a la base (atómico: sin carreras entre instancias).
create or replace function consumir_cupo(p_clave text, p_max int, p_ventana_seg int)
returns table (permitido boolean, restantes int, reinicia_en int)
language plpgsql security definer set search_path = public as $$
declare v_inicio timestamptz; v_conteo int;
begin
  insert into rate_limits (clave, ventana_inicio, conteo) values (p_clave, now(), 0)
  on conflict (clave) do nothing;

  update rate_limits
     set ventana_inicio = case when now() - ventana_inicio >= make_interval(secs => p_ventana_seg) then now() else ventana_inicio end,
         conteo = case when now() - ventana_inicio >= make_interval(secs => p_ventana_seg) then 1 else conteo + 1 end
   where clave = p_clave
   returning ventana_inicio, conteo into v_inicio, v_conteo;

  return query select
    v_conteo <= p_max,
    greatest(0, p_max - v_conteo),
    greatest(0, p_ventana_seg - extract(epoch from (now() - v_inicio))::int);
end $$;
revoke execute on function consumir_cupo(text, int, int) from public, anon, authenticated;
grant execute on function consumir_cupo(text, int, int) to service_role;

-- Higiene: las ventanas vencidas no se guardan para siempre.
create or replace function limpiar_rate_limits()
returns int language sql security definer set search_path = public as $$
  with borradas as (delete from rate_limits where ventana_inicio < now() - interval '1 day' returning 1)
  select count(*)::int from borradas;
$$;
revoke execute on function limpiar_rate_limits() from public, anon, authenticated;
grant execute on function limpiar_rate_limits() to service_role;

-- ---------- 3. REGISTRO DE ERRORES: los fallos dejan de morir en la consola ----------
create table if not exists error_log (
  id bigserial primary key,
  ruta text,
  metodo text,
  mensaje text,
  detalle text,
  actor_id uuid references users(id) on delete set null,
  company_id uuid references companies(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists error_fecha_idx on error_log (created_at desc);
alter table error_log enable row level security;
drop policy if exists error_consultor on error_log;
create policy error_consultor on error_log for select using (es_consultor());
revoke insert, update, delete on error_log from anon, authenticated;

-- ---------- 4. CONTROL DOCUMENTAL (ISO 9001 7.5): versión, aprobación, historial ----------
alter table deliverables add column if not exists estado text default 'borrador';
alter table deliverables add column if not exists aprobado_por uuid references users(id);
alter table deliverables add column if not exists aprobado_at timestamptz;
alter table deliverables add column if not exists aprobado_nombre text;
alter table deliverables add column if not exists reemplaza_a uuid references deliverables(id);
alter table deliverables add column if not exists motivo_cambio text;
do $$ begin
  alter table deliverables add constraint deliverables_estado_check
    check (estado in ('borrador','vigente','obsoleto'));
exception when duplicate_object then null; end $$;
create index if not exists deliverables_vigente_idx on deliverables (company_id, tipo, estado);

-- Un solo documento VIGENTE por empresa y tipo: al aprobar uno, el anterior queda obsoleto.
create or replace function aprobar_documento(p_id uuid, p_por uuid, p_nombre text, p_motivo text)
returns table (id uuid, version int, estado text)
language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_tipo text; v_ver int;
begin
  select company_id, tipo into v_company, v_tipo from deliverables where deliverables.id = p_id;
  if v_company is null then raise exception 'documento no encontrado'; end if;

  update deliverables set estado = 'obsoleto'
   where company_id = v_company and tipo = v_tipo and estado = 'vigente' and deliverables.id <> p_id;

  select coalesce(max(deliverables.version), 0) + 1 into v_ver
    from deliverables where company_id = v_company and tipo = v_tipo and estado = 'obsoleto';

  return query
    update deliverables
       set estado = 'vigente', aprobado_por = p_por, aprobado_nombre = p_nombre,
           aprobado_at = now(), motivo_cambio = p_motivo,
           version = greatest(coalesce(deliverables.version, 1), v_ver),
           publicado = true, publicado_at = coalesce(publicado_at, now())
     where deliverables.id = p_id
    returning deliverables.id, deliverables.version, deliverables.estado;
end $$;
revoke execute on function aprobar_documento(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function aprobar_documento(uuid, uuid, text, text) to service_role;

-- ---------- 5. LEY 29733: consentimiento informado y su fecha ----------
alter table users add column if not exists acepto_privacidad_at timestamptz;
alter table users add column if not exists acepto_privacidad_version text;
alter table participants add column if not exists consentimiento_at timestamptz;
alter table participants add column if not exists consentimiento_texto text;
