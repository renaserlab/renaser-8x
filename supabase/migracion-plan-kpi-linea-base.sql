-- EL PLAN SE APRUEBA, SE ASIGNA, SE SIGUE Y SE COMPRUEBA; LA LÍNEA BASE NO SE PISA (instrucción de Dirección 13-10-2026, secciones 12, 13 y 14).
--
-- Tres cosas que hoy no existen: (1) la línea base se BORRABA al recongelar (migracion-mediciones.sql:59), así que
-- una corrección cambiaba en silencio todas las comparaciones; (2) las acciones (`actions`) no tienen objetivo,
-- línea base, resultado esperado, aprobador, criterio de aceptación ni historial de quién decidió qué; (3) los
-- indicadores (`indicadores`) no tienen fórmula, fuente, línea base, meta con plazo, valor actual, validación ni
-- umbral. Aditiva salvo dos cosas declaradas: se reemplaza el cuerpo de `congelar_medicion` (ya no borra) y se
-- amplían tres checks (estados de acción, unidades y frecuencias de indicador). Nada se borra ni se renombra.

-- ───────────────────────── 1 · LÍNEA BASE VERSIONADA ─────────────────────────
alter table mediciones add column if not exists version int not null default 1;
alter table mediciones add column if not exists vigente boolean not null default true;
alter table mediciones add column if not exists reemplaza_a uuid references mediciones(id);
alter table mediciones add column if not exists linea_base_id uuid references mediciones(id);  -- un corte referencia la versión EXACTA contra la que se midió
alter table mediciones add column if not exists motivo_version text;                          -- por qué se volvió a congelar («costos completos tras conciliar»)
alter table mediciones add column if not exists periodo_desde date;
alter table mediciones add column if not exists periodo_hasta date;
alter table mediciones add column if not exists condiciones jsonb not null default '{}'::jsonb; -- cambios de condiciones (temporada, local nuevo, precio) que afectan la comparación
alter table mediciones add column if not exists hash_contenido text;                           -- huella de valores+derivados para el acta

-- La unicidad pasa de «una línea base por empresa» a «una línea base VIGENTE por empresa».
drop index if exists mediciones_una_base;
create unique index if not exists mediciones_una_base_vigente on mediciones (company_id) where tipo = 'linea_base' and vigente;

create or replace function congelar_medicion(
  p_company uuid, p_tipo text, p_valores jsonb, p_derivados jsonb, p_nota text, p_por uuid
) returns mediciones
language plpgsql security definer set search_path = public as $$
declare v_num int; v_fila mediciones; v_prev mediciones; v_version int := 1; v_base uuid;
begin
  if p_tipo not in ('linea_base', 'corte') then raise exception 'tipo de medición no válido'; end if;

  if p_tipo = 'linea_base' then
    -- Volver a congelar NO borra: la anterior deja de estar vigente y la nueva la referencia. Los cortes
    -- que se midieron contra la anterior siguen apuntando a ella: una corrección posterior no altera
    -- en silencio comparaciones históricas (sección 14).
    select * into v_prev from mediciones m where m.company_id = p_company and m.tipo = 'linea_base' and m.vigente limit 1;
    if found then
      update mediciones set vigente = false where id = v_prev.id;
      v_version := v_prev.version + 1;
    end if;
    v_num := 0;
  else
    select coalesce(max(m.numero), 0) + 1 into v_num
      from mediciones m where m.company_id = p_company and m.tipo = 'corte';
    select id into v_base from mediciones m where m.company_id = p_company and m.tipo = 'linea_base' and m.vigente limit 1;
  end if;

  insert into mediciones (company_id, tipo, numero, valores, derivados, nota, creado_por, version, vigente, reemplaza_a, linea_base_id, hash_contenido)
  values (p_company, p_tipo, v_num, coalesce(p_valores, '{}'::jsonb), coalesce(p_derivados, '{}'::jsonb), p_nota, p_por,
          v_version, true, case when p_tipo = 'linea_base' then v_prev.id else null end, v_base,
          md5(coalesce(p_valores, '{}'::jsonb)::text || coalesce(p_derivados, '{}'::jsonb)::text))
  returning * into v_fila;
  return v_fila;
end $$;
revoke execute on function congelar_medicion(uuid, text, jsonb, jsonb, text, uuid) from public, anon, authenticated;

-- ───────────────────────── 2 · ACTAS DE ACEPTACIÓN ─────────────────────────
-- Quién aceptó qué, cuándo, qué versión y con qué contenido exacto. El documento exportado se liga a la versión.
-- El mecanismo contractual queda sujeto a revisión jurídica antes de uso real: lo dice la columna, no una promesa.
create table if not exists actas_aceptacion (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tipo text not null check (tipo in ('linea_base','plan','ficha_direccion','corte')),
  referencia_id uuid not null,                 -- id de la medición, del plan (acciones agrupadas) o de la ficha
  version int not null default 1,
  contenido jsonb not null,                    -- copia literal de lo aceptado
  hash_contenido text not null,
  aceptado_por uuid references users(id),
  aceptado_nombre text,
  aceptado_rol text,
  aceptado_at timestamptz default now(),
  documento_path text,                         -- export en storage, ligado a esta versión
  nota_juridica text not null default 'Mecanismo de aceptación sujeto a revisión jurídica antes de uso contractual.',
  created_at timestamptz default now()
);
create index if not exists actas_company_idx on actas_aceptacion (company_id, tipo, version desc);
alter table actas_aceptacion enable row level security;
drop policy if exists actas_consultor on actas_aceptacion;
create policy actas_consultor on actas_aceptacion for all using (es_consultor()) with check (es_consultor());
drop policy if exists actas_cliente on actas_aceptacion;
create policy actas_cliente on actas_aceptacion for select using (company_id in (select mis_empresas()));

-- ───────────────────────── 3 · EL PLAN Y SUS ACCIONES ─────────────────────────
alter table companies add column if not exists limite_frentes int not null default 3 check (limite_frentes between 1 and 10);  -- 3 a 5 prioridades activas; configurable

alter table actions drop constraint if exists actions_estado_check;
alter table actions add constraint actions_estado_check
  check (estado in ('pendiente','en_curso','hecho','descartado','propuesto','aprobado','en_ejecucion','reportado','verificado','rechazado','pospuesto','bloqueado'));
-- Correspondencia con los estados de Dirección: propuesto → aprobado → en_ejecucion → reportado → verificado.
-- Los valores antiguos (pendiente, en_curso, hecho, descartado) se conservan para las filas existentes.
alter table actions add column if not exists objetivo_empresarial text;
alter table actions add column if not exists linea_base_id uuid references mediciones(id);
alter table actions add column if not exists resultado_esperado text;
alter table actions add column if not exists restriccion_oportunidad text;
alter table actions add column if not exists evidencia_ids uuid[] not null default '{}';     -- afirmaciones o fuentes que sustentan la acción
alter table actions add column if not exists entregable text;
alter table actions add column if not exists responsable_participant_id uuid references participants(id);  -- persona identificada, no texto libre
alter table actions add column if not exists aprobador_id uuid references users(id);
alter table actions add column if not exists aprobado_at timestamptz;
alter table actions add column if not exists recursos text;
alter table actions add column if not exists fecha_inicio date;
alter table actions add column if not exists depende_de uuid[] not null default '{}';
alter table actions add column if not exists indicador_id uuid references indicadores(id);
alter table actions add column if not exists criterio_aceptacion text;
alter table actions add column if not exists riesgos text;
alter table actions add column if not exists supuestos text;
alter table actions add column if not exists obligaciones_cliente text;
alter table actions add column if not exists obligaciones_renaser text;
alter table actions add column if not exists bloqueo text;
alter table actions add column if not exists bloqueado_at timestamptz;
alter table actions add column if not exists escalado_a uuid references users(id);
alter table actions add column if not exists escalado_at timestamptz;
alter table actions add column if not exists reportado_at timestamptz;
alter table actions add column if not exists reportado_por uuid references users(id);
alter table actions add column if not exists es_prioridad boolean not null default false;   -- cuenta para el límite de frentes activos
create index if not exists actions_company_estado_idx on actions (company_id, estado);

-- Quién decidió qué sobre una acción, por qué y qué implica. Nunca pisa la fila: es historial.
create table if not exists accion_historial (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions(id) on delete cascade,
  accion text not null check (accion in ('proponer','aprobar','rechazar','posponer','modificar','iniciar','reportar','verificar','rechazar_verificacion','bloquear','desbloquear','escalar','comentar')),
  antes jsonb,
  despues jsonb,
  motivo text,
  implica text,                                -- qué cambia por esta decisión (plazo, recursos, otra acción)
  actor_id uuid references users(id),
  actor_rol text,
  created_at timestamptz default now()
);
create index if not exists accion_historial_action_idx on accion_historial (action_id, created_at desc);
alter table accion_historial enable row level security;
drop policy if exists accion_historial_consultor on accion_historial;
create policy accion_historial_consultor on accion_historial for all using (es_consultor()) with check (es_consultor());
drop policy if exists accion_historial_cliente on accion_historial;
create policy accion_historial_cliente on accion_historial for select
  using (exists (select 1 from actions a where a.id = action_id and a.company_id in (select mis_empresas())));

-- ───────────────────────── 4 · INDICADORES (KPI) COMPLETOS ─────────────────────────
alter table indicadores drop constraint if exists indicadores_unidad_check;
alter table indicadores add constraint indicadores_unidad_check
  check (unidad in ('soles','de_cada_10','dias','personas','numero','porcentaje','horas','unidades','moneda','soles_por_hora'));
alter table indicadores drop constraint if exists indicadores_frecuencia_check;
alter table indicadores add constraint indicadores_frecuencia_check
  check (frecuencia in ('diaria','semanal','quincenal','mensual','trimestral'));
alter table indicadores add column if not exists definicion text;
alter table indicadores add column if not exists formula text;
alter table indicadores add column if not exists moneda text;                       -- solo si la unidad es moneda/soles
alter table indicadores add column if not exists fuente text;                       -- de dónde sale el dato (cuaderno de caja, Excel, sistema)
alter table indicadores add column if not exists responsable_participant_id uuid references participants(id);
alter table indicadores add column if not exists tipo_indicador text check (tipo_indicador in ('ejecucion','resultado'));
alter table indicadores add column if not exists linea_base_valor numeric;
alter table indicadores add column if not exists linea_base_periodo text;
alter table indicadores add column if not exists linea_base_medicion_id uuid references mediciones(id);
alter table indicadores add column if not exists meta_plazo date;
alter table indicadores add column if not exists valor_actual numeric;
alter table indicadores add column if not exists valor_actual_periodo text;
alter table indicadores add column if not exists valor_actual_at timestamptz;
alter table indicadores add column if not exists estado_validacion text check (estado_validacion in ('declarado','extraido','conciliado','verificado','sin_dato'));
alter table indicadores add column if not exists umbral_alerta numeric;
alter table indicadores add column if not exists umbral_sentido text check (umbral_sentido in ('por_debajo','por_encima'));
alter table indicadores add column if not exists accion_asociada_id uuid references actions(id);
alter table indicadores add column if not exists decision_asociada text;           -- qué decisión dispara cruzar el umbral

-- Historia de valores: cada medición de un indicador con su período, fuente y validación. La falta de dato no es cero: no se inserta fila.
create table if not exists indicador_valores (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references indicadores(id) on delete cascade,
  periodo text not null,
  valor numeric not null,
  fuente text,
  estado_validacion text not null default 'declarado' check (estado_validacion in ('declarado','extraido','conciliado','verificado')),
  medicion_id uuid references mediciones(id),
  registrado_por uuid references users(id),
  nota text,
  created_at timestamptz default now(),
  unique (indicador_id, periodo)
);
alter table indicador_valores enable row level security;
drop policy if exists indicador_valores_consultor on indicador_valores;
create policy indicador_valores_consultor on indicador_valores for all using (es_consultor()) with check (es_consultor());
drop policy if exists indicador_valores_cliente on indicador_valores;
create policy indicador_valores_cliente on indicador_valores for select
  using (exists (select 1 from indicadores i where i.id = indicador_id and i.company_id in (select mis_empresas())));

-- ───────────────────────── 5 · REVISIÓN SEMANAL ─────────────────────────
create table if not exists revisiones_semanales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  semana date not null,                        -- lunes de la semana revisada
  que_debia_ocurrir jsonb not null default '[]'::jsonb,
  que_ocurrio jsonb not null default '[]'::jsonb,
  evidencia jsonb not null default '[]'::jsonb,
  desvios jsonb not null default '[]'::jsonb,   -- retrasos, datos desactualizados, acciones sin responsable, metas sin plan
  explicacion text,
  decision_necesaria text,
  siguiente text,
  creada_por uuid references users(id),
  created_at timestamptz default now(),
  unique (company_id, semana)
);
alter table revisiones_semanales enable row level security;
drop policy if exists revisiones_consultor on revisiones_semanales;
create policy revisiones_consultor on revisiones_semanales for all using (es_consultor()) with check (es_consultor());
drop policy if exists revisiones_cliente on revisiones_semanales;
create policy revisiones_cliente on revisiones_semanales for select using (company_id in (select mis_empresas()));
