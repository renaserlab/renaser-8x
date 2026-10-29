-- ============================================================================
-- EL EXPEDIENTE DOCUMENTAL Y SUS REVISIONES (18-10-2026).
--
-- EL HUECO QUE CIERRA. El 18-10 entramos a la primera empresa cliente y el sistema no sabía que existían su MOF, su
-- Reglamento Interno, siete procedimientos de personal, su FODA, su plan estratégico ni su
-- organigrama. Estaban en Drive desde agosto. Hubo que encontrarlos a mano con un navegador.
-- 8X producía y no recibía: todo lo que generaba quedaba adentro, nada de lo que ya existía entraba.
--
-- LA REGLA (Kelin, 18-10-2026): lo que el cliente entrega es MATERIA PRIMA, no producto terminado.
-- Entra al expediente, se mide contra la vara de su tipo (src/lib/metodo/varas.ts) y sale una
-- propuesta de mejora. El expediente no es un archivador: es la puerta de entrada al trabajo.
--
-- APROBACIÓN NO ES VIGENCIA, y por eso son columnas distintas:
--   · aprobado_por / aprobado_at  = la DECISIÓN: alguien con autoridad dijo que sí.
--   · vigente_desde               = el ESTADO INSTITUCIONAL: desde cuándo ese documento RIGE.
-- Un documento se aprueba el lunes y puede entrar en vigor el día 1 del mes siguiente. Y sigue
-- vigente aunque quien lo aprobó ya no esté. Juntarlos borra la diferencia entre «lo decidimos» y
-- «esto manda hoy», que es lo que hace que el cliente vea como oficial algo que nadie firmó.
--
-- ADITIVA: crear estas dos tablas no cambia el comportamiento de nada existente.
-- ============================================================================

create table if not exists expediente_documental (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,

  nombre text not null,
  -- Con qué vara se mide: mof | procesos | atencion | seleccion | reglamento | estrategia.
  -- El vocabulario vive en src/lib/metodo/varas.ts, no aquí: un enum en la base obligaría a una
  -- migración cada vez que la biblioteca maestra crezca.
  clave_vara text,
  -- A qué entregable del contrato responde. Vocabulario en src/lib/expediente.ts.
  entregable text,

  -- cliente = lo tenía la empresa (materia prima) · consultora = lo produjo RENASER
  -- plantilla_adaptada = salió de una plantilla maestra con la información real de la empresa
  origen text not null default 'cliente',

  -- recibido → borrador → en_revision → aprobado → vigente → sustituido | archivado
  estado text not null default 'recibido',

  version text,
  -- La versión anterior a la que reemplaza. Sin esto se pierde el historial, y sin historial no
  -- se sabe qué cambió ni por qué.
  sustituye_a uuid references expediente_documental(id) on delete set null,

  -- La decisión.
  aprobado_por uuid references users(id) on delete set null,
  aprobado_at timestamptz,
  -- El estado institucional: desde cuándo rige.
  vigente_desde date,

  -- Dónde vive el archivo de verdad y de dónde salió su texto.
  drive_id text,
  source_id uuid references sources(id) on delete set null,
  contenido text,

  nota_consultora text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table expediente_documental is
  'Lo que cada empresa YA tiene, con su estado real. Un documento vigente rige: de él salen los que se produzcan después. Aprobación y vigencia son columnas distintas a propósito.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expediente_estado_conocido') then
    alter table expediente_documental add constraint expediente_estado_conocido
      check (estado in ('recibido', 'borrador', 'en_revision', 'aprobado', 'vigente', 'sustituido', 'archivado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expediente_origen_conocido') then
    alter table expediente_documental add constraint expediente_origen_conocido
      check (origen in ('cliente', 'consultora', 'plantilla_adaptada'));
  end if;
  -- Aprobado sin quién ni cuándo no es una aprobación: es un campo cambiado.
  if not exists (select 1 from pg_constraint where conname = 'expediente_aprobado_con_firma') then
    alter table expediente_documental add constraint expediente_aprobado_con_firma
      check (estado not in ('aprobado', 'vigente') or (aprobado_por is not null and aprobado_at is not null));
  end if;
  -- Vigente sin fecha desde la que rige no es vigencia: es una etiqueta.
  if not exists (select 1 from pg_constraint where conname = 'expediente_vigente_con_fecha') then
    alter table expediente_documental add constraint expediente_vigente_con_fecha
      check (estado <> 'vigente' or vigente_desde is not null);
  end if;
end $$;

create index if not exists expediente_empresa on expediente_documental (company_id, estado);
create index if not exists expediente_entregable on expediente_documental (company_id, entregable);

-- Un solo documento vigente por entregable y empresa: dos vigentes a la vez dejarían al consultor
-- y al cliente mirando reglas distintas. Las versiones anteriores pasan a 'sustituido'.
create unique index if not exists expediente_un_vigente_por_entregable
  on expediente_documental (company_id, entregable) where (estado = 'vigente' and entregable is not null);

-- ============================================================================
-- LAS REVISIONES: la medición de un documento contra su vara.
-- Se conservan todas. Revisar dos veces el mismo documento después de mejorarlo es cómo se
-- comprueba que la mejora sirvió; si la revisión se sobrescribe, esa comparación se pierde.
-- ============================================================================

create table if not exists revision_documental (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  documento_id uuid not null references expediente_documental(id) on delete cascade,

  clave_vara text not null,
  -- La salida del agente `revisor`, validada contra SalidaRevisionDocumental.
  contenido jsonb not null,

  -- cumple | entregable_con_observaciones | no_entregable
  veredicto text not null,
  exigencias_total int not null default 0,
  exigencias_cumple int not null default 0,

  created_at timestamptz not null default now()
);

comment on table revision_documental is
  'Un veredicto por cada exigencia de la vara, con su evidencia. No reescribe el documento: propone. Se conservan todas las revisiones para poder comparar antes y después.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'revision_veredicto_conocido') then
    alter table revision_documental add constraint revision_veredicto_conocido
      check (veredicto in ('cumple', 'entregable_con_observaciones', 'no_entregable'));
  end if;
  -- No se puede cumplir más exigencias de las que tiene la vara.
  if not exists (select 1 from pg_constraint where conname = 'revision_conteo_coherente') then
    alter table revision_documental add constraint revision_conteo_coherente
      check (exigencias_cumple <= exigencias_total);
  end if;
end $$;

create index if not exists revision_documento on revision_documental (documento_id, created_at desc);

alter table expediente_documental enable row level security;
alter table revision_documental enable row level security;

-- Sin políticas: se accede por la API con service_role. El cliente nunca lee estas tablas: recibe
-- lo vigente por el camino de entregables, y las revisiones son trabajo interno de la consultora.
