-- RENASER OS DENTRO DE 8X (19-10-2026). El trabajo diario de cada empresa: las tareas de cada persona con su
-- cronómetro de foco, la apertura y el cierre del día, el cierre de la semana, el equipo en vivo, el talento, los
-- proyectos, el objetivo de la semana y los avisos que la base genera sola. Prototipo aprobado por Dirección el
-- 19-10-2026; la referencia funcional es el RenaserOs de una empresa (en producción), no la versión multiempresa.
--
-- QUIÉN ENTRA. `os_personas` es el equipo de cada empresa: el dueño y su personal, cada uno con su rol de RENASER OS
-- (dueno, gerente, operaciones, talento = RR.HH., persona = colaborador). El personal NO recibe membresía de la
-- empresa: la membresía abre el portal de la consultoría (diagnóstico, números, plan), que es solo del dueño.
--
-- NADA SE LEE NI SE ESCRIBE DESDE EL NAVEGADOR. Como en el resto de 8X, las páginas leen y las rutas escriben con la
-- credencial del servidor y aplican la frontera en código (src/lib/os/acceso.ts). Por eso cada tabla nace con RLS y
-- SIN políticas, y sin permisos para anon ni authenticated: si alguien habla directo con la base con la clave pública
-- y su sesión, no ve ni toca nada. «Equipo en vivo» se refresca solo desde el servidor en vez de usar realtime, que
-- exigiría abrir la lectura al navegador.
--
-- LOS AVISOS LOS GENERA LA BASE (pg_cron), aunque nadie tenga 8X abierto. Las cinco reglas son funciones que solo
-- ejecuta el servidor; las agenda el bloque del final, y solo si pg_cron existe (en Postgres embebido no existe y el
-- bloque no hace nada). Los horarios de pg_cron van en UTC: Lima es UTC−5 todo el año.
--
-- Solo crea: no toca ninguna tabla ni dato existente. Para deshacerlo: supabase/revertir/migracion-renaser-os.sql.

-- ============ EL EQUIPO ============

create table if not exists os_personas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references users(id) on delete set null,       -- null hasta que la persona entra con su correo
  email text,                                                   -- en minúsculas; con él se enlaza su cuenta
  nombre text not null check (char_length(nombre) between 1 and 120),
  puesto text,
  area text,
  rol text not null default 'persona' check (rol in ('dueno','gerente','operaciones','talento','persona')),
  capacidad_min int not null default 480 check (capacidad_min between 0 and 1440),  -- minutos de trabajo por día
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, user_id),
  unique (company_id, email)
);
create index if not exists os_personas_usuario on os_personas (user_id);

-- ============ EL TRABAJO ============

create table if not exists os_proyectos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 160),
  descripcion text,
  responsable_id uuid references os_personas(id) on delete set null,
  fecha_entrega date,
  cerrado_at timestamptz,
  created_at timestamptz not null default now()
);

-- `fecha_inicio` es el día en que la tarea se trabaja: es lo que cuenta como «trabajo puesto para hoy» (así lo mide
-- RenaserOs). `fecha_limite` es cuándo vence. «Vencida» no es un estado guardado: se calcula con la fecha límite.
create table if not exists os_tareas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  persona_id uuid not null references os_personas(id) on delete cascade,
  proyecto_id uuid references os_proyectos(id) on delete set null,
  titulo text not null check (char_length(titulo) between 1 and 300),
  descripcion text,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_curso','en_revision','completada','bloqueada')),
  prioridad text not null default 'media' check (prioridad in ('alta','media','baja')),
  fecha_inicio date,
  fecha_limite date,
  completada_at timestamptz,
  creada_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists os_tareas_persona_dia on os_tareas (persona_id, fecha_inicio);
create index if not exists os_tareas_empresa on os_tareas (company_id, estado);

create table if not exists os_bloqueos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tarea_id uuid not null references os_tareas(id) on delete cascade,
  persona_id uuid not null references os_personas(id) on delete cascade,
  causa text not null check (char_length(causa) between 1 and 500),
  depende_de text,
  desde timestamptz not null default now(),
  hasta timestamptz,
  avisado_at timestamptz                                        -- la regla de bloqueos avisa una sola vez
);
create unique index if not exists os_un_bloqueo_abierto on os_bloqueos (tarea_id) where hasta is null;

-- Prórroga: se mueve la fecha límite. Aplazamiento: se mueve el día en que se trabaja. Las dos quedan con su motivo.
create table if not exists os_reprogramaciones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tarea_id uuid not null references os_tareas(id) on delete cascade,
  tipo text not null check (tipo in ('prorroga','aplazamiento')),
  antes date,
  despues date,
  motivo text not null check (char_length(motivo) between 1 and 500),
  por uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- El cronómetro de foco: cada tramo es una fila; pausar cierra el tramo y reanudar abre otro. Una persona tiene a lo
-- sumo un cronómetro corriendo (índice parcial).
create table if not exists os_registros_tiempo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tarea_id uuid not null references os_tareas(id) on delete cascade,
  persona_id uuid not null references os_personas(id) on delete cascade,
  inicio timestamptz not null default now(),
  fin timestamptz,
  nota text,
  check (fin is null or fin >= inicio)
);
create unique index if not exists os_un_cronometro_por_persona on os_registros_tiempo (persona_id) where fin is null;
create index if not exists os_registros_persona_inicio on os_registros_tiempo (persona_id, inicio);

-- ============ LOS RITUALES ============

create table if not exists os_aperturas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  persona_id uuid not null references os_personas(id) on delete cascade,
  fecha date not null,
  animo int not null check (animo between 1 and 5),
  compromiso text,
  created_at timestamptz not null default now(),
  unique (persona_id, fecha)
);

create table if not exists os_cierres (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  persona_id uuid not null references os_personas(id) on delete cascade,
  fecha date not null,
  hecho text,
  pendiente text,
  created_at timestamptz not null default now(),
  unique (persona_id, fecha)
);

create table if not exists os_cierres_semanales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  persona_id uuid not null references os_personas(id) on delete cascade,
  semana date not null,                                         -- el lunes de esa semana
  logros text,
  trabas text,
  compromiso text,
  created_at timestamptz not null default now(),
  unique (persona_id, semana)
);

-- ============ LO QUE SE ENTREGA Y LO QUE SE PERSIGUE ============

create table if not exists os_entregables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  persona_id uuid not null references os_personas(id) on delete cascade,
  tarea_id uuid references os_tareas(id) on delete set null,
  titulo text not null check (char_length(titulo) between 1 and 200),
  ruta text not null,                                           -- ruta dentro del bucket privado os-entregables
  mime text,
  tamano int,
  created_at timestamptz not null default now()
);

create table if not exists os_objetivos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  semana date not null,
  texto text not null check (char_length(texto) between 1 and 300),
  meta int check (meta is null or meta > 0),
  logrado int not null default 0 check (logrado >= 0),
  fijado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, semana)
);

-- ============ EL TALENTO ============

create table if not exists os_legajos (
  persona_id uuid primary key references os_personas(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  ingreso date,
  contrato text,
  telefono text,
  documento text,
  notas text,
  updated_at timestamptz not null default now()
);

create table if not exists os_acompanamientos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  persona_id uuid not null references os_personas(id) on delete cascade,
  fecha timestamptz not null,
  tema text not null check (char_length(tema) between 1 and 300),
  acuerdos text,
  hecho boolean not null default false,
  por uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Evaluación 360: un ciclo (p. ej. «2026-10») pide a cada evaluador una respuesta sobre cada evaluado.
create table if not exists os_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  ciclo text not null check (ciclo ~ '^[0-9]{4}-[0-9]{2}$'),
  evaluado_id uuid not null references os_personas(id) on delete cascade,
  evaluador_id uuid not null references os_personas(id) on delete cascade,
  relacion text not null check (relacion in ('auto','jefe','par','equipo')),
  puntajes jsonb,
  comentario text,
  respondida_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ciclo, evaluado_id, evaluador_id)
);

-- ============ LOS AVISOS ============

-- Un aviso va a una persona (persona_id) o a la gestión de la empresa (para_gestion). `clave` evita repetirlo: cada
-- regla arma la suya (p. ej. «bloqueo:<id>») y el insert la ignora si ya existe.
create table if not exists os_avisos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  persona_id uuid references os_personas(id) on delete cascade,
  para_gestion boolean not null default false,
  regla text not null check (regla in ('inactividad','bloqueos','plan','cierre_semanal','diagnostico')),
  titulo text not null,
  detalle text,
  enlace text,
  clave text not null,
  leido_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, clave),
  check (persona_id is not null or para_gestion)
);
create index if not exists os_avisos_empresa_fecha on os_avisos (company_id, created_at desc);

-- Qué reglas apagó cada empresa y cuándo corrió cada una por última vez. Sin fila, la regla está encendida.
create table if not exists os_reglas (
  company_id uuid not null references companies(id) on delete cascade,
  regla text not null check (regla in ('inactividad','bloqueos','plan','cierre_semanal','diagnostico')),
  activa boolean not null default true,
  ultima_corrida_at timestamptz,
  primary key (company_id, regla)
);

-- ============ NADA DESDE EL NAVEGADOR ============

do $$
declare t text;
begin
  foreach t in array array['os_personas','os_proyectos','os_tareas','os_bloqueos','os_reprogramaciones','os_registros_tiempo',
    'os_aperturas','os_cierres','os_cierres_semanales','os_entregables','os_objetivos','os_legajos','os_acompanamientos',
    'os_evaluaciones','os_avisos','os_reglas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

-- Los archivos que sube cada persona. Privado: se descargan con enlaces firmados que da el servidor.
insert into storage.buckets (id, name, public) values ('os-entregables', 'os-entregables', false) on conflict (id) do nothing;

-- ============ LAS REGLAS ============

create or replace function os_regla_activa(p_company uuid, p_regla text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activa from os_reglas where company_id = p_company and regla = p_regla), true);
$$;

-- Anota la corrida en cada empresa que tiene equipo (sin tocar si la regla está encendida o apagada).
create or replace function os_marcar_corrida(p_regla text) returns void
language sql security definer set search_path = public as $$
  insert into os_reglas (company_id, regla, ultima_corrida_at)
  select distinct company_id, p_regla, now() from os_personas
  on conflict (company_id, regla) do update set ultima_corrida_at = excluded.ultima_corrida_at;
$$;

-- INACTIVIDAD (cada 5 minutos). Dos cosas: (1) quien abrió el día, no tiene cronómetro corriendo y no movió nada en
-- la última hora, de lunes a sábado entre las 8 y las 19 de su empresa: un aviso por persona y por hora; (2) un
-- cronómetro que corre hace más de 10 horas: un aviso por cronómetro, a la gestión y a la persona.
create or replace function os_regla_inactividad() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; k int;
begin
  insert into os_avisos (company_id, para_gestion, regla, titulo, detalle, enlace, clave)
  select p.company_id, true, 'inactividad',
         p.nombre || ' no registra actividad desde las ' || to_char(u.ultima at time zone z.zona, 'HH24:MI'),
         'Abrió el día, pero no tiene un cronómetro corriendo ni movió una tarea en la última hora.',
         '/os/equipo',
         'inactividad:' || p.id || ':' || to_char(now() at time zone z.zona, 'YYYY-MM-DD"T"HH24')
  from os_personas p
  join companies c on c.id = p.company_id
  cross join lateral (select coalesce(c.zona_horaria, 'America/Lima') as zona) z
  join os_aperturas a on a.persona_id = p.id and a.fecha = (now() at time zone z.zona)::date
  cross join lateral (
    select greatest(
      a.created_at,
      coalesce((select max(coalesce(r.fin, r.inicio)) from os_registros_tiempo r where r.persona_id = p.id), a.created_at),
      coalesce((select max(t.updated_at) from os_tareas t where t.persona_id = p.id), a.created_at)
    ) as ultima
  ) u
  where p.activo
    and os_regla_activa(p.company_id, 'inactividad')
    and extract(isodow from now() at time zone z.zona) between 1 and 6
    and extract(hour from now() at time zone z.zona) between 8 and 18
    and not exists (select 1 from os_registros_tiempo r where r.persona_id = p.id and r.fin is null)
    and u.ultima < now() - interval '60 minutes'
  on conflict (company_id, clave) do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into os_avisos (company_id, persona_id, para_gestion, regla, titulo, detalle, enlace, clave)
  select r.company_id, r.persona_id, true, 'inactividad',
         'Cronómetro olvidado: ' || p.nombre,
         'Corre desde el ' || to_char(r.inicio at time zone coalesce(c.zona_horaria, 'America/Lima'), 'DD/MM "a las" HH24:MI') || ' en «' || t.titulo || '».',
         '/os/equipo',
         'cronometro:' || r.id
  from os_registros_tiempo r
  join os_personas p on p.id = r.persona_id
  join os_tareas t on t.id = r.tarea_id
  join companies c on c.id = r.company_id
  where r.fin is null and r.inicio < now() - interval '10 hours' and os_regla_activa(r.company_id, 'inactividad')
  on conflict (company_id, clave) do nothing;
  get diagnostics k = row_count; n := n + k;

  perform os_marcar_corrida('inactividad');
  return n;
end $$;

-- BLOQUEOS (cada 5 minutos): una tarea bloqueada hace más de 30 minutos avisa una vez a la gestión.
create or replace function os_regla_bloqueos() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with nuevos as (
    update os_bloqueos b set avisado_at = now()
    where b.hasta is null and b.avisado_at is null and b.desde < now() - interval '30 minutes'
      and os_regla_activa(b.company_id, 'bloqueos')
    returning b.*
  )
  insert into os_avisos (company_id, para_gestion, regla, titulo, detalle, enlace, clave)
  select x.company_id, true, 'bloqueos',
         '«' || t.titulo || '» lleva ' || floor(extract(epoch from now() - x.desde) / 60)::int || ' min bloqueada',
         p.nombre || ' · causa: ' || x.causa || coalesce('. Depende de: ' || x.depende_de, '') || '.',
         '/os/equipo',
         'bloqueo:' || x.id
  from nuevos x
  join os_tareas t on t.id = x.tarea_id
  join os_personas p on p.id = x.persona_id
  on conflict (company_id, clave) do nothing;
  get diagnostics n = row_count;
  perform os_marcar_corrida('bloqueos');
  return n;
end $$;

-- PLAN DEL DÍA SIGUIENTE (lunes a viernes, 17:30 de Lima): a cada persona con cuenta que no tiene ninguna tarea para
-- el próximo día hábil (el viernes, el lunes), un aviso suyo; y a la gestión, uno con todos los nombres.
create or replace function os_regla_plan_manana() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; k int;
begin
  create temp table if not exists os_sin_plan (company_id uuid, persona_id uuid, nombre text, dia date) on commit drop;
  delete from os_sin_plan;
  insert into os_sin_plan
  select p.company_id, p.id, p.nombre, m.dia
  from os_personas p
  join companies c on c.id = p.company_id
  cross join lateral (select (now() at time zone coalesce(c.zona_horaria, 'America/Lima'))::date as hoy) h
  cross join lateral (
    select h.hoy + case extract(isodow from h.hoy)::int when 5 then 3 when 6 then 2 else 1 end as dia
  ) m
  where p.activo and p.user_id is not null and os_regla_activa(p.company_id, 'plan')
    and not exists (select 1 from os_tareas t where t.persona_id = p.id and t.fecha_inicio = m.dia);

  insert into os_avisos (company_id, persona_id, regla, titulo, detalle, enlace, clave)
  select s.company_id, s.persona_id, 'plan',
         'Pon tu trabajo para el ' || to_char(s.dia, 'DD/MM'),
         'Todavía no tienes tareas para ese día. Elige en qué vas a trabajar antes de irte.',
         '/os/mi-trabajo',
         'plan_manana:' || s.persona_id || ':' || s.dia
  from os_sin_plan s
  on conflict (company_id, clave) do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into os_avisos (company_id, para_gestion, regla, titulo, detalle, enlace, clave)
  select s.company_id, true, 'plan',
         'Plan de mañana: ' || count(*) || case when count(*) = 1 then ' persona sin tareas' else ' personas sin tareas' end || ' para el ' || to_char(min(s.dia), 'DD/MM'),
         string_agg(s.nombre, ', ' order by s.nombre) || '.',
         '/os/equipo',
         'plan_equipo:' || s.company_id || ':' || min(s.dia)
  from os_sin_plan s
  group by s.company_id
  on conflict (company_id, clave) do nothing;
  get diagnostics k = row_count; n := n + k;

  perform os_marcar_corrida('plan');
  return n;
end $$;

-- CIERRE SEMANAL (viernes y sábado, 18:00 de Lima): a cada persona con cuenta que no cerró su semana, un recordatorio
-- por día; el sábado, además, uno a la gestión con los nombres.
create or replace function os_regla_cierre_semanal() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; k int;
begin
  create temp table if not exists os_sin_cierre (company_id uuid, persona_id uuid, nombre text, semana date, dia int) on commit drop;
  delete from os_sin_cierre;
  insert into os_sin_cierre
  select p.company_id, p.id, p.nombre, date_trunc('week', h.hoy)::date, extract(isodow from h.hoy)::int
  from os_personas p
  join companies c on c.id = p.company_id
  cross join lateral (select (now() at time zone coalesce(c.zona_horaria, 'America/Lima'))::date as hoy) h
  where p.activo and p.user_id is not null and os_regla_activa(p.company_id, 'cierre_semanal')
    and extract(isodow from h.hoy) in (5, 6)
    and not exists (select 1 from os_cierres_semanales w where w.persona_id = p.id and w.semana = date_trunc('week', h.hoy)::date);

  insert into os_avisos (company_id, persona_id, regla, titulo, detalle, enlace, clave)
  select s.company_id, s.persona_id, 'cierre_semanal', 'Falta tu cierre de la semana',
         'Logros, trabas y tu compromiso para la semana que viene. Son tres respuestas.',
         '/os/apertura',
         'cierre_semanal:' || s.persona_id || ':' || s.semana || ':' || s.dia
  from os_sin_cierre s
  on conflict (company_id, clave) do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into os_avisos (company_id, para_gestion, regla, titulo, detalle, enlace, clave)
  select s.company_id, true, 'cierre_semanal', 'Cierre semanal pendiente: ' || count(*) || case when count(*) = 1 then ' persona' else ' personas' end,
         string_agg(s.nombre, ', ' order by s.nombre) || '. Se les recordó el viernes y el sábado.',
         '/os/reporte',
         'cierre_equipo:' || s.company_id || ':' || s.semana
  from os_sin_cierre s
  where s.dia = 6
  group by s.company_id, s.semana
  on conflict (company_id, clave) do nothing;
  get diagnostics k = row_count; n := n + k;

  perform os_marcar_corrida('cierre_semanal');
  return n;
end $$;

-- DIAGNÓSTICO DIARIO DE TAREAS (lunes a viernes, 06:00 de Lima): por empresa, cuántas tareas abiertas están vencidas,
-- sin fecha límite, prorrogadas tres veces o más y bloqueadas. Sin nada que decir, no avisa.
create or replace function os_regla_diagnostico() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into os_avisos (company_id, para_gestion, regla, titulo, detalle, enlace, clave)
  select d.company_id, true, 'diagnostico', 'Diagnóstico de tareas de hoy',
         d.vencidas || ' vencidas, ' || d.sin_fecha || ' sin fecha límite, ' || d.prorrogadas || ' prorrogadas tres veces o más y ' || d.bloqueadas || ' bloqueadas.',
         '/os/equipo',
         'diagnostico:' || d.company_id || ':' || d.hoy
  from (
    select t.company_id, h.hoy,
           count(*) filter (where t.fecha_limite < h.hoy) as vencidas,
           count(*) filter (where t.fecha_limite is null) as sin_fecha,
           count(*) filter (where (select count(*) from os_reprogramaciones r where r.tarea_id = t.id and r.tipo = 'prorroga') >= 3) as prorrogadas,
           count(*) filter (where t.estado = 'bloqueada') as bloqueadas
    from os_tareas t
    join companies c on c.id = t.company_id
    cross join lateral (select (now() at time zone coalesce(c.zona_horaria, 'America/Lima'))::date as hoy) h
    where t.estado <> 'completada' and os_regla_activa(t.company_id, 'diagnostico')
    group by t.company_id, h.hoy
  ) d
  where d.vencidas + d.sin_fecha + d.prorrogadas + d.bloqueadas > 0
  on conflict (company_id, clave) do nothing;
  get diagnostics n = row_count;
  perform os_marcar_corrida('diagnostico');
  return n;
end $$;

revoke all on function os_regla_activa(uuid, text) from public, anon, authenticated;
revoke all on function os_marcar_corrida(text) from public, anon, authenticated;
revoke all on function os_regla_inactividad() from public, anon, authenticated;
revoke all on function os_regla_bloqueos() from public, anon, authenticated;
revoke all on function os_regla_plan_manana() from public, anon, authenticated;
revoke all on function os_regla_cierre_semanal() from public, anon, authenticated;
revoke all on function os_regla_diagnostico() from public, anon, authenticated;
grant execute on function os_regla_activa(uuid, text) to service_role;
grant execute on function os_marcar_corrida(text) to service_role;
grant execute on function os_regla_inactividad() to service_role;
grant execute on function os_regla_bloqueos() to service_role;
grant execute on function os_regla_plan_manana() to service_role;
grant execute on function os_regla_cierre_semanal() to service_role;
grant execute on function os_regla_diagnostico() to service_role;

-- ============ LA AGENDA (pg_cron, en UTC) ============
-- Solo si la extensión existe. cron.schedule con nombre reemplaza el trabajo si ya estaba: aplicar dos veces no duplica.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('os-inactividad', '*/5 * * * *', 'select public.os_regla_inactividad()');
    perform cron.schedule('os-bloqueos', '*/5 * * * *', 'select public.os_regla_bloqueos()');
    perform cron.schedule('os-plan-manana', '30 22 * * 1-5', 'select public.os_regla_plan_manana()');      -- 17:30 Lima
    perform cron.schedule('os-cierre-semanal', '0 23 * * 5,6', 'select public.os_regla_cierre_semanal()'); -- 18:00 Lima
    perform cron.schedule('os-diagnostico', '0 11 * * 1-5', 'select public.os_regla_diagnostico()');       -- 06:00 Lima
  end if;
end $$;
