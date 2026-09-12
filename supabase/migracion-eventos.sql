-- LOS EVENTOS DEL DÍA (RENASER OS, 12-09-2026).
-- Una sola tabla para lo que pasa cada día: tardanzas, facturación, proyectos trabados, incidencias.
-- El catálogo de tipos y sus campos viven en src/lib/eventos.ts, no en la base: así agregar un tipo
-- no requiere una migración, y el código es el único sitio donde se define qué se puede anotar.

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tipo text not null,
  -- La fecha del HECHO, no la de captura: se anota el lunes lo que pasó el viernes.
  fecha date not null default (now() at time zone 'America/Lima')::date,
  monto numeric,
  minutos integer,
  -- A quién se refiere. Se pone en null si la persona se borra: el hecho ocurrió igual.
  persona_id uuid references participants(id) on delete set null,
  datos jsonb not null default '{}'::jsonb,
  creado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists eventos_empresa_fecha_idx on eventos (company_id, fecha desc);
create index if not exists eventos_empresa_tipo_idx on eventos (company_id, tipo, fecha desc);

alter table eventos enable row level security;
drop policy if exists eventos_cliente on eventos;
create policy eventos_cliente on eventos for select using (company_id in (select mis_empresas()));
drop policy if exists eventos_consultor on eventos;
create policy eventos_consultor on eventos for all using (es_consultor()) with check (es_consultor());
