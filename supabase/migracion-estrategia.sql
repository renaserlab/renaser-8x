-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 16-10-2026 · LA ESTRATEGIA QUE 8X GENERA SOLA (clientes/8x-plan/spec-estrategia-8x.md, §10)
-- Crea: estrategias (una fila por versión), estrategia_ediciones (rastro de lo que corrige la consultora),
-- estrategia_preguntas (lo que falta saber, convertido en preguntas para el dueño) y dos funciones.
-- No crea vista ni política para el dueño: su página y sus preguntas las arma el servidor, filtrando en la consulta.
-- Desde el navegador nadie escribe en estas tablas (ni la consultora): toda escritura pasa por las rutas de la
-- aplicación, que exigen rol, autoridad, validador y rastro (§8, revisión del 17-10).
-- Amplía dos checks agregando un valor cada uno: solicitudes_cliente.seccion ('preguntas_estrategia') y
-- deliverables.tipo ('plan_estrategico', que plan.ts insertaba y schema.sql no admitía).
-- No borra ni cambia ningún dato. Se puede ejecutar dos veces. Depende de migracion-entrar-hoy.sql.
-- Para deshacerla sin perder filas: supabase/revertir/migracion-estrategia.sql (renombra, no borra).
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- 0 · Lo que esta migración da por hecho. Si falta, se detiene aquí, antes de cambiar nada, y dice qué aplicar primero.
do $$
begin
  if to_regclass('public.solicitudes_cliente') is null then
    raise exception 'Falta aplicar migracion-entrar-hoy.sql antes que esta: no existe la tabla solicitudes_cliente. Esta migración no cambió nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'deliverables' and column_name = 'estado') then
    raise exception 'Falta aplicar migracion-gobierno.sql antes que esta: deliverables no tiene su control documental. Esta migración no cambió nada.';
  end if;
end $$;

-- 1 · Las estrategias de cada empresa.
create table if not exists estrategias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  version int not null check (version >= 1),
  -- Sin 'fallida': una etapa que falla se anota en `errores` y la versión sigue en_curso hasta reintentar o descartar (§5.3).
  estado text not null default 'en_curso' check (estado in ('en_curso','lista','con_observaciones','aprobada','reemplazada','descartada')),
  etapa text not null default 'lentes' check (etapa in ('lentes','equipo_rojo','reparacion','armado','terminada')),
  origen text not null default 'ia' check (origen in ('ia','actualizacion')),
  paquete jsonb not null check (jsonb_typeof(paquete) = 'object'),
  paquete_huella text not null check (paquete_huella ~ '^[0-9a-f]{64}$'),
  calculos jsonb not null check (jsonb_typeof(calculos) = 'object'),
  lente_dinero jsonb check (lente_dinero is null or jsonb_typeof(lente_dinero) = 'object'),
  lente_terreno jsonb check (lente_terreno is null or jsonb_typeof(lente_terreno) = 'object'),
  proyecciones_lentes jsonb check (proyecciones_lentes is null or jsonb_typeof(proyecciones_lentes) = 'object'),
  equipo_rojo jsonb check (equipo_rojo is null or jsonb_typeof(equipo_rojo) = 'object'),
  salida jsonb check (salida is null or jsonb_typeof(salida) = 'object'),     -- lo que escribió 8X: nunca se edita
  vigente jsonb check (vigente is null or jsonb_typeof(vigente) = 'object'),  -- lo que se ve: salida + ediciones
  validacion jsonb not null default '{}'::jsonb check (jsonb_typeof(validacion) = 'object'),
  calidad jsonb not null default '{}'::jsonb check (jsonb_typeof(calidad) = 'object'),
  errores jsonb not null default '[]'::jsonb check (jsonb_typeof(errores) = 'array'),
  trabajos jsonb not null default '{}'::jsonb check (jsonb_typeof(trabajos) = 'object'),  -- { dinero, terreno, rojo }: el último trabajo de cada etapa
  camino_elegido text check (camino_elegido in ('a','b')),
  motivo_eleccion text check (motivo_eleccion is null or length(motivo_eleccion) <= 600),
  para_dueno jsonb check (para_dueno is null or jsonb_typeof(para_dueno) = 'object'),
  basada_en uuid references estrategias(id) on delete set null,
  pedida_por uuid references users(id) on delete set null,
  aprobada_por uuid references users(id) on delete set null,
  aprobada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, version),
  check (estado <> 'aprobada' or (camino_elegido is not null and para_dueno is not null and aprobada_at is not null))
);
create unique index if not exists estrategias_una_aprobada on estrategias (company_id) where estado = 'aprobada';
create unique index if not exists estrategias_una_en_curso on estrategias (company_id) where estado = 'en_curso';
create index if not exists estrategias_company_idx on estrategias (company_id, version desc);
create index if not exists estrategias_dia_idx on estrategias (company_id, created_at desc);

-- 2 · El rastro de lo que corrige la consultora. Solo se agrega; no se cambia.
create table if not exists estrategia_ediciones (
  id uuid primary key default gen_random_uuid(),
  estrategia_id uuid not null references estrategias(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  puntero text not null check (puntero ~ '^(/[a-z0-9_]+)+$' and length(puntero) <= 200),
  tipo text not null check (tipo in ('texto','supuesto','eleccion','quitar','restaurar')),
  antes jsonb,
  despues jsonb,
  autor uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists estrategia_ediciones_idx on estrategia_ediciones (estrategia_id, created_at);
-- Lo único que se deja cambiar es el autor a nulo: es lo que hace Postgres por `on delete set null` al borrar un usuario.
-- Sin esta excepción, borrar la cuenta de una consultora que corrigió una estrategia fallaría.
create or replace function estrategia_ediciones_no_se_cambian_fn() returns trigger language plpgsql as $$
begin
  if new.autor is null and old.autor is not null
     and (new.id, new.estrategia_id, new.company_id, new.puntero, new.tipo, new.antes, new.despues, new.created_at)
         is not distinct from (old.id, old.estrategia_id, old.company_id, old.puntero, old.tipo, old.antes, old.despues, old.created_at) then
    return new;
  end if;
  raise exception 'El rastro de ediciones no se cambia: se agrega una edición nueva.';
end $$;
drop trigger if exists estrategia_ediciones_no_se_cambian on estrategia_ediciones;
create trigger estrategia_ediciones_no_se_cambian before update on estrategia_ediciones
  for each row execute function estrategia_ediciones_no_se_cambian_fn();

-- 3 · Las preguntas para el dueño que salen de lo que falta saber.
create table if not exists estrategia_preguntas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  estrategia_id uuid references estrategias(id) on delete set null,
  espera jsonb not null default '[]'::jsonb check (jsonb_typeof(espera) = 'array'),  -- [{ version, camino, jugada }]: lo que destraba esta respuesta
  clave text not null check (clave ~ '^[a-z][a-z0-9_.]{2,60}$'),
  texto text not null check (length(btrim(texto)) between 8 and 200),
  por_que text check (por_que is null or length(por_que) <= 300),
  -- Sin 'pct': al dueño nunca se le pregunta en porcentaje (§3.3).
  unidad text not null default 'texto' check (unidad in ('soles','de_cada_10','dias','unidades_mes','veces_mes','horas_semana','personas','texto')),
  estado text not null default 'propuesta' check (estado in ('propuesta','enviada','respondida','retirada')),
  respuesta jsonb check (respuesta is null or jsonb_typeof(respuesta) = 'object'),
  respuesta_texto text check (respuesta_texto is null or length(respuesta_texto) <= 1000),
  enviada_por uuid references users(id) on delete set null,
  enviada_at timestamptz,
  respondida_por uuid references users(id) on delete set null,
  respondida_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estado <> 'respondida' or respuesta is not null or respuesta_texto is not null)
);
create unique index if not exists estrategia_preguntas_una_abierta on estrategia_preguntas (company_id, clave) where estado in ('propuesta','enviada');
create index if not exists estrategia_preguntas_company_idx on estrategia_preguntas (company_id, estado, created_at desc);

-- 4 · (Sin vista para el dueño: ver la cabecera.)

-- 5 · Coordinación de etapas, en una sola ida a la base: guarda una lente y dice si ya están las dos.
--     Devuelve true cada vez que, después de guardar, están las dos (un reintento puede volver a recibir true):
--     que el equipo rojo sea uno solo lo garantiza su clave idempotente, no esta función.
--     Solo escribe en una versión en_curso: en una descartada (o que no existe) no toca nada y devuelve false.
create or replace function estrategia_lente_lista(p_id uuid, p_lente text, p_salida jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare v estrategias%rowtype;
begin
  if p_lente is null or p_lente not in ('dinero','terreno') then raise exception 'Lente desconocida: %', p_lente; end if;
  update estrategias set
    lente_dinero  = case when p_lente = 'dinero'  then p_salida else lente_dinero  end,
    lente_terreno = case when p_lente = 'terreno' then p_salida else lente_terreno end,
    updated_at = now()
  where id = p_id and estado = 'en_curso'
  returning * into v;
  if not found then return false; end if;
  return v.lente_dinero is not null and v.lente_terreno is not null;
end $$;

-- 6 · Aprobar: la anterior pasa a reemplazada y esta queda aprobada, en la misma transacción.
--     CON BLOQUEO OPTIMISTA (revisión del 17-10): la página del dueño se arma con lo vigente que se leyó al empezar; si
--     otra pestaña guardó una corrección entre medio, se aprobaría una página que ya no es la de lo vigente. Con
--     p_updated_at, solo se aprueba si la fila sigue como se leyó; si no, se dice que cambió mientras tanto.
--     (La firma vieja, sin p_updated_at, se borra antes: no quedan dos funciones con el mismo nombre.)
drop function if exists aprobar_estrategia(uuid, uuid, jsonb, text);
create or replace function aprobar_estrategia(p_id uuid, p_por uuid, p_para_dueno jsonb, p_motivo text, p_updated_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare v estrategias%rowtype; n int;
begin
  select * into v from estrategias where id = p_id for update;
  if not found then raise exception 'La estrategia no existe.'; end if;
  if p_updated_at is not null and v.updated_at is distinct from p_updated_at then
    raise exception 'La estrategia cambió mientras tanto: vuelve a cargarla antes de aprobar.';
  end if;
  if v.estado <> 'lista' then raise exception 'Solo se aprueba una estrategia lista (esta está en «%»).', v.estado; end if;
  if v.camino_elegido is null then raise exception 'Falta elegir el camino.'; end if;
  if p_para_dueno is null or jsonb_typeof(p_para_dueno) <> 'object' then
    raise exception 'Falta la página del dueño: sin ella no hay nada que aprobar.';
  end if;
  update estrategias set estado = 'reemplazada', updated_at = now() where company_id = v.company_id and estado = 'aprobada';
  update estrategias set estado = 'aprobada', para_dueno = p_para_dueno, aprobada_por = p_por, aprobada_at = now(),
    motivo_eleccion = coalesce(p_motivo, motivo_eleccion), updated_at = now()
  where id = p_id and estado = 'lista';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'La estrategia cambió mientras tanto: vuelve a cargarla antes de aprobar.'; end if;
end $$;
revoke all on function estrategia_lente_lista(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function aprobar_estrategia(uuid, uuid, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function estrategia_lente_lista(uuid, text, jsonb) to service_role;
grant execute on function aprobar_estrategia(uuid, uuid, jsonb, text, timestamptz) to service_role;

-- 7 · Dos checks que se amplían (se agrega un valor; ningún valor que ya existía se quita).
alter table solicitudes_cliente drop constraint if exists solicitudes_cliente_seccion_check;
alter table solicitudes_cliente add constraint solicitudes_cliente_seccion_check check (seccion in (
  'productos','costos','historia','moneda','credito','inventario','corroborar_diagnostico','datos_faltantes',
  'subir_organigrama','subir_manuales','subir_procesos','preguntas_estrategia'));
alter table deliverables drop constraint if exists deliverables_tipo_check;
alter table deliverables add constraint deliverables_tipo_check check (tipo in (
  'informe_realidad','diagnostico_4p','mapa_as_is','mapa_to_be','manual_procesos','plan_90','mapa_automatizacion','plan_estrategico'));

-- 8 · RLS. TODA ESCRITURA PASA POR LA APLICACIÓN (revisión del 17-10; el precedente es
--     migracion-acciones-solo-por-la-api.sql y migracion-mediciones.sql). Las rutas escriben con la credencial del
--     servidor después de exigir el rol, la autoridad de aprobar planes, el validador y el rastro. Con «para todo» desde
--     el navegador, una sesión de consultora podía aprobar sin la autoridad de aprobar planes, escribir la página del
--     dueño o lo vigente sin pasar por el validador, cambiar el estado de las preguntas o firmar el rastro con otro autor.
--     Por eso la consultora solo LEE desde el navegador, y el rol del navegador no tiene permiso de escritura.
--     El dueño no tiene ninguna política: su camino lo arma la página del servidor y sus preguntas las lee y responde
--     la aplicación (que también le esconde lo que es de la consultora: por qué, qué espera, quién la envió). Una
--     política de lectura que ninguna página usa es una superficie que nadie vigila.
alter table estrategias enable row level security;
alter table estrategia_ediciones enable row level security;
alter table estrategia_preguntas enable row level security;
drop policy if exists estrategias_consultor on estrategias;
create policy estrategias_consultor on estrategias for select using (es_consultor());
drop policy if exists estrategia_ediciones_consultor_lee on estrategia_ediciones;
create policy estrategia_ediciones_consultor_lee on estrategia_ediciones for select using (es_consultor());
drop policy if exists estrategia_ediciones_consultor_agrega on estrategia_ediciones;
drop policy if exists estrategia_preguntas_consultor on estrategia_preguntas;
create policy estrategia_preguntas_consultor on estrategia_preguntas for select using (es_consultor());
drop policy if exists estrategia_preguntas_cliente on estrategia_preguntas;
revoke insert, update, delete on estrategias, estrategia_ediciones, estrategia_preguntas from anon, authenticated;
