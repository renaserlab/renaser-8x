-- ============================================================================
-- EVIDENCIA DE IMPLEMENTACIÓN E INDICADORES (30-08-2026). Puntos 5 y 6.
--
-- 5. Las acciones del plan traían un campo `evidencia` que DESCRIBÍA qué evidencia haría falta
--    ("listas de chequeo firmadas por lote despachado") pero no guardaba nada. Las 9 acciones que
--    existían estaban todas en "pendiente" y ningún documento tenía implementación registrada. Sin
--    prueba, "se implementó" es una afirmación del consultor, no un hecho verificado (ISO 9001 7.5,
--    27001 A.5.36).
--
-- 6. En el catálogo estaba escrito "las incidencias son la mina de KPIs" y no había una sola línea
--    que las extrajera. Lo que se repite es lo que hay que medir: aquí esos números dejan de vivir
--    en un párrafo y pasan a ser indicadores que se miden en cada corte.
-- ============================================================================

-- ---------- 5. EVIDENCIA: la prueba de que algo se hizo de verdad ----------
create table if not exists evidencias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- Una evidencia prueba una acción del plan O la implantación de un documento. Nunca las dos.
  action_id uuid references actions(id) on delete cascade,
  asset_clave text,
  tipo text not null check (tipo in ('foto', 'archivo', 'nota')),
  ruta text,                       -- dónde vive el archivo en el bucket; null si es solo nota
  nombre text,
  mime text,
  bytes int,
  nota text,
  subido_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint evidencia_tiene_dueno check (action_id is not null or asset_clave is not null),
  constraint evidencia_archivo_tiene_ruta check (tipo = 'nota' or ruta is not null)
);
create index if not exists evidencias_empresa_idx on evidencias (company_id, created_at desc);
create index if not exists evidencias_accion_idx on evidencias (action_id);

alter table evidencias enable row level security;
drop policy if exists evidencias_cliente on evidencias;
create policy evidencias_cliente on evidencias for select using (company_id in (select mis_empresas()));
drop policy if exists evidencias_consultor on evidencias;
create policy evidencias_consultor on evidencias for all using (es_consultor()) with check (es_consultor());
revoke insert, update, delete on evidencias from anon, authenticated;

-- Una acción se cierra con prueba y con quién la verificó: "hecho" deja de ser una casilla.
alter table actions add column if not exists verificado_at timestamptz;
alter table actions add column if not exists verificado_por uuid references users(id) on delete set null;
alter table actions add column if not exists verificado_nota text;

-- ACUSE DEL EQUIPO (ISO 9001 7.2/7.3): un manual que nadie leyó no está implementado.
create table if not exists acuses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  asset_clave text not null,
  participant_id uuid references participants(id) on delete cascade,
  nombre text,                     -- se guarda el nombre del momento: si la persona se va, el acuse queda
  created_at timestamptz not null default now(),
  unique (company_id, asset_clave, participant_id)
);
create index if not exists acuses_empresa_idx on acuses (company_id, asset_clave);
alter table acuses enable row level security;
drop policy if exists acuses_cliente on acuses;
create policy acuses_cliente on acuses for select using (company_id in (select mis_empresas()));
drop policy if exists acuses_consultor on acuses;
create policy acuses_consultor on acuses for all using (es_consultor()) with check (es_consultor());
revoke insert, update, delete on acuses from anon, authenticated;

-- ---------- 6. INDICADORES: lo que se repite se mide ----------
create table if not exists indicadores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  clave text not null,             -- snake_case; los valores viven en company_metricas con esta clave
  nombre text not null,            -- cómo se le llama al dueño, sin jerga
  como_se_mide text not null,      -- la cuenta concreta, en una frase que se puede ejecutar
  unidad text not null default 'numero' check (unidad in ('soles', 'de_cada_10', 'dias', 'personas', 'numero', 'porcentaje')),
  mejor_si text not null default 'baja' check (mejor_si in ('sube', 'baja', 'neutro')),
  meta_valor numeric,
  meta_texto text,
  frecuencia text not null default 'mensual' check (frecuencia in ('diaria', 'semanal', 'mensual')),
  origen text not null default 'incidencia' check (origen in ('incidencia', 'accion', 'manual')),
  origen_texto text,               -- el problema del que salió: por qué este número importa
  estado text not null default 'propuesto' check (estado in ('propuesto', 'activo', 'archivado')),
  creado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, clave)
);
create index if not exists indicadores_empresa_idx on indicadores (company_id, estado);

alter table indicadores enable row level security;
drop policy if exists indicadores_cliente on indicadores;
create policy indicadores_cliente on indicadores for select using (company_id in (select mis_empresas()));
drop policy if exists indicadores_consultor on indicadores;
create policy indicadores_consultor on indicadores for all using (es_consultor()) with check (es_consultor());
revoke insert, update, delete on indicadores from anon, authenticated;
