-- ============================================================================
-- DERIVA DEL ESQUEMA: EL REPOSITORIO VUELVE A DESCRIBIR LO QUE LA BASE TIENE (13-10-2026).
--
-- QUÉ ES. La base de producción expone 51 relaciones por PostgREST; los archivos supabase/*.sql
-- creaban 44. Siete tablas nacieron por el SQL Editor o por scripts sueltos y nunca entraron al
-- repo; doce columnas de tablas existentes tampoco. Mientras eso siga así no hay forma de levantar
-- la base en otro sitio, ni de auditar sus políticas desde el código, ni de saber qué hace el
-- `alter table org_puestos` de migracion-procedencia.sql:26 sobre una tabla que el repo no conoce.
--
-- DE DÓNDE SALE. De la descripción OpenAPI de PostgREST de producción, leída en solo lectura el
-- 13-10-2026 (scripts/tmp/e0-openapi.mts) y guardada saneada en
-- tests/fixtures/esquema-produccion-2026-10-13.json. Esa descripción trae nombres, tipos,
-- obligatoriedad, defaults escalares, clave primaria y destino de cada clave foránea. NO trae:
-- acciones de borrado de las claves foráneas, defaults de columnas jsonb o array (PostgREST los
-- omite: `decisiones.evidencia` tiene default en el repo y el OpenAPI lo muestra vacío), índices,
-- restricciones check ni políticas RLS. Todo eso aquí va marcado "-- INFERIDO" y se confirma con
-- `pg_dump --schema-only` cuando haya un token válido de la Management API (ver README-ESQUEMA.md).
--
-- LITERAL DEL OPENAPI: nombres de tabla y columna (en su orden), tipos, not null (lista `required`),
--   defaults escalares (gen_random_uuid(), now(), 'actual', 'contado', 0, 'consultor', 'agosto-2026'),
--   claves primarias (<pk/>) y tablas destino de las claves foráneas (<fk/>).
-- LITERAL DEL REPO: el DDL completo de conocimiento_base (scripts/ingestar-base-maestra.mjs:11-21) y
--   el default de org_puestos.fuentes_usadas (supabase/migracion-procedencia.sql:26).
-- INFERIDO: `on delete cascade` en company_id (es el patrón de todo el esquema y el borrado de empresa
--   de src/lib/borrar-empresa.ts no limpia estas tablas: sin cascada, borrar una empresa con puestos
--   fallaría); `on delete set null` en enlaces entre iguales (criterio de migracion-borrado-cascada.sql);
--   ausencia de default en columnas jsonb/array que el repo no declara; los índices; y TODAS las
--   políticas RLS, que siguen el patrón del repo (es_consultor() para la consultora, mis_empresas()
--   para el cliente) pero no se han visto en producción.
--
-- IDEMPOTENTE Y ADITIVA: solo `create ... if not exists`, `add column if not exists` y políticas
-- creadas únicamente si no existen. No quita nada, no toca filas. No se ha aplicado a ninguna base.
-- Requiere schema.sql aplicado antes (usa es_consultor() y mis_empresas()) y va ANTES de migracion-procedencia.sql,
-- que altera org_puestos (tabla que solo este archivo crea). El orden completo está en supabase/orden-aplicacion.json.
-- ============================================================================

-- ---------- 1. LOS NÚMEROS DE LA EMPRESA ----------
-- Un número por (empresa, clave, periodo). El código (extraer.ts, portal/numeros) busca la fila y
-- decide si inserta o actualiza; no hay restricción única en el OpenAPI y no se inventa aquí.
-- `estado` toma en el código los valores contado / verificado / sin_dato (schemas/index.ts:46); el
-- OpenAPI no trae check, así que no se añade.
create table if not exists company_metricas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade, -- INFERIDO: acción de borrado
  clave text not null,
  periodo text not null default 'actual',
  valor numeric,
  valor_texto text,
  estado text not null default 'contado',
  nota text,
  response_id uuid references interview_responses(id) on delete set null, -- INFERIDO: acción de borrado
  source_id uuid references sources(id) on delete set null, -- INFERIDO: acción de borrado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- INFERIDO: índice para la búsqueda que hace el código antes de cada guardado.
create index if not exists company_metricas_company_idx on company_metricas (company_id, clave, periodo);

-- ---------- 2. EL ORGANIGRAMA ----------
-- `origen` distingue lo que el dueño declaró ('cliente') de lo que propone la consultora
-- ('consultor', por defecto). El portal del cliente solo lee origen='cliente' (limite-cliente-consultora).
create table if not exists org_puestos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade, -- INFERIDO: acción de borrado
  nombre text not null,
  mision text,
  decide text,
  persona text,
  respaldo text,
  reporta_a uuid references org_puestos(id) on delete set null, -- INFERIDO: acción de borrado
  por_que text,
  orden integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  origen text not null default 'consultor',
  -- Default literal de migracion-procedencia.sql:26 (el OpenAPI no reporta defaults jsonb).
  fuentes_usadas jsonb not null default '[]'::jsonb
);
-- INFERIDO: el portal y la ruta ordenan por (orden, created_at) dentro de la empresa.
create index if not exists org_puestos_company_idx on org_puestos (company_id, orden);

-- El estudio vigente se reemplaza (upsert por company_id); cada versión queda en su tabla.
create table if not exists org_estudio (
  company_id uuid primary key references companies(id) on delete cascade, -- INFERIDO: acción de borrado
  contenido jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists org_estudio_versiones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade, -- INFERIDO: acción de borrado
  contenido jsonb not null,
  creado_at timestamptz default now()
);
create index if not exists org_estudio_versiones_company_idx on org_estudio_versiones (company_id, creado_at desc); -- INFERIDO

-- ---------- 3. EL MODELO DE ALTO RENDIMIENTO DEL RUBRO (la vara, no evidencia de la empresa) ----------
create table if not exists modelo_alto_rendimiento (
  company_id uuid primary key references companies(id) on delete cascade, -- INFERIDO: acción de borrado
  contenido jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists modelo_versiones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade, -- INFERIDO: acción de borrado
  contenido jsonb not null,
  creado_at timestamptz default now()
);
create index if not exists modelo_versiones_company_idx on modelo_versiones (company_id, creado_at desc); -- INFERIDO

-- ---------- 4. LA BASE MAESTRA (conocimiento de la casa, no de una empresa) ----------
-- DDL literal de scripts/ingestar-base-maestra.mjs:11-21; coincide columna a columna con el OpenAPI.
create table if not exists conocimiento_base (
  id uuid primary key default gen_random_uuid(),
  fuente text not null,
  seccion text not null,
  ejes text[] not null default '{}',
  contenido text not null,
  orden int not null,
  version text not null default 'agosto-2026',
  created_at timestamptz not null default now()
);
-- INFERIDO: índice para la lectura del diagnosticador (diagnostico.ts:65 filtra por fuente y ejes).
create index if not exists conocimiento_base_fuente_idx on conocimiento_base (fuente, orden);

-- ---------- 5. COLUMNAS QUE PRODUCCIÓN TIENE Y EL REPO NO DECLARABA ----------
-- Todas son opcionales en el OpenAPI (no están en `required`). Las jsonb/array quedan sin default
-- porque PostgREST no lo reporta y no hay otra fuente: INFERIDO.

-- companies: la ficha de enrutamiento del Sistema Adaptativo v2 y la aspiración declarada.
alter table companies add column if not exists ficha jsonb;
alter table companies add column if not exists modelo_operativo text[];
alter table companies add column if not exists mapa_motores jsonb;
alter table companies add column if not exists etapa_negocio text;
alter table companies add column if not exists aspiracion text;

-- company_assets: la propuesta de la consultora sobre un documento y su puesta en marcha.
-- `propuesta_estado` toma 'confirmada' en el código (imprimir/documento); sin check en el OpenAPI.
alter table company_assets add column if not exists implementacion jsonb;
alter table company_assets add column if not exists propuesta text;
alter table company_assets add column if not exists propuesta_cambios jsonb;
alter table company_assets add column if not exists propuesta_estado text;

-- processes: cómo se mide el proceso (ficha SIPOC ampliada, api/processes/[id]/ficha).
alter table processes add column if not exists indicador text;
alter table processes add column if not exists meta text;
alter table processes add column if not exists medicion_donde text;

-- ---------- 6. RLS ----------
-- INFERIDO ÍNTEGRAMENTE: el OpenAPI no muestra políticas. Se sigue el patrón del repo: la consultora
-- todo; el cliente solo sus empresas y solo lo que la frontera permite. Los estudios y versiones son
-- deliberación interna de la consultora (regla de Kelin del 27-09) y no reciben política de cliente:
-- quedan invisibles para él, como corrections, cases o know_how en schema.sql. Las políticas se crean
-- solo si no existen, para no pisar las reales si esto se aplicara sobre producción.
do $$
declare t text;
begin
  foreach t in array array['company_metricas','org_puestos','org_estudio','org_estudio_versiones',
    'modelo_alto_rendimiento','modelo_versiones','conocimiento_base']
  loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'consultor_todo') then
      execute format('create policy consultor_todo on %I for all using (es_consultor()) with check (es_consultor())', t);
    end if;
  end loop;
end $$;

do $$
begin
  -- Sus números: el dueño los declara y los corrige desde el portal.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'company_metricas' and policyname = 'cliente_company_metricas') then
    create policy cliente_company_metricas on company_metricas for select using (company_id in (select mis_empresas()));
  end if;
  -- Sus puestos: solo los que él declaró. Los que propone la consultora no llegan a su navegador.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'org_puestos' and policyname = 'cliente_org_puestos') then
    create policy cliente_org_puestos on org_puestos for select using (company_id in (select mis_empresas()) and origen = 'cliente');
  end if;
end $$;
