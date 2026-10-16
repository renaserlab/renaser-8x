-- ============================================================================
-- ARCHIVO DE AFIRMACIONES (13-10-2026).
-- Reextraer una fuente borraba sus afirmaciones anteriores antes de volver a leerla
-- (`api/sources/[id]/extract`). Si la nueva lectura salía peor o fallaba —como el
-- 27-09 con un documento de una empresa cliente, sin crédito— la fuente quedaba con menos
-- de lo que tenía y sin rastro de lo perdido. Desde ahora cada versión anterior se
-- guarda aquí entera, con su número y su motivo, antes de borrarse de `claims`.
-- Aditiva e idempotente: no toca ninguna tabla existente.
--
-- ORDEN DE DESPLIEGUE: esta migración va ANTES que el código. La ruta de reextracción
-- (`api/sources/[id]/extract`) consulta `claims_archivo` y, si la tabla no existe, responde
-- 500 sin borrar nada (mejor no reextraer que perder afirmaciones). Hasta aplicarla, el botón
-- «Reintentar extracción» de /torre devuelve ese error con la causa escrita.
-- ============================================================================

create table if not exists claims_archivo (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  -- Versión por fuente: 1 es lo que había la primera vez que se reextrajo.
  version int not null,
  -- Las filas de `claims` tal cual estaban, en bloque. Es un archivo, no una tabla de trabajo.
  claims jsonb not null default '[]'::jsonb,
  archivado_at timestamptz not null default now(),
  -- Por qué se archivó: 'reextraccion' hoy; mañana puede haber otros motivos.
  motivo text not null,
  archivado_por uuid references users(id),
  unique (source_id, version)
);
create index if not exists claims_archivo_source_idx on claims_archivo (source_id, version desc);
create index if not exists claims_archivo_company_idx on claims_archivo (company_id);

-- Solo el servidor (service_role) lee y escribe: es trabajo interno de la consultora.
alter table claims_archivo enable row level security;
revoke all on claims_archivo from anon, authenticated;
