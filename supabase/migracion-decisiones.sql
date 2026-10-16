-- LAS DECISIONES QUE KELIN PUEDE CORREGIR (instrucción maestra §10, §16, §17).
--
-- Hasta hoy 8X producía hallazgos, planes y propuestas, pero no había ningún sitio donde la
-- consultora pudiera APROBAR, MODIFICAR, OBJETAR, RECHAZAR, POSPONER o PEDIR EVIDENCIA, ni dónde
-- quedara constancia de qué propuso el sistema y qué decidió ella.
--
-- DOS TABLAS, POR UNA RAZÓN. La decisión guarda lo que se propone; el historial guarda cada
-- intervención humana SIN pisar la anterior. Si la corrección sobrescribiera la propuesta original,
-- se perdería justo lo que el manual quiere medir: «¿la corrección de la consultora produjo mejor
-- resultado?». No se puede responder eso si no queda qué dijo cada uno.

create table if not exists decisiones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,

  -- QUÉ SE DEBE DECIDIR
  titulo text not null,
  por_que_ahora text not null,
  -- Evidencia por REFERENCIA: [{ tipo, id, texto }]. El hallazgo o la afirmación que la sostiene.
  evidencia jsonb not null default '[]'::jsonb,
  -- Lo que NO se sabe y cambiaría la decisión. Un hueco nombrado no es un hueco escondido.
  faltantes jsonb not null default '[]'::jsonb,
  supuestos jsonb not null default '[]'::jsonb,
  -- [{ clave, titulo, que_implica, impacto, costo, velocidad, riesgo, reversibilidad }]
  alternativas jsonb not null default '[]'::jsonb,
  recomendacion text,
  recomendacion_por_que text,
  impacto_esperado text,
  riesgos jsonb not null default '[]'::jsonb,
  confianza text check (confianza in ('alta','media','baja')),
  confianza_por_que text,
  que_pasa_si_se_aprueba text,

  -- QUIÉN LA PRODUJO: agente y versión de contrato, o la consultora a mano.
  origen text not null default 'agente' check (origen in ('agente','consultora')),
  agente text,
  agente_version text,
  job_id uuid references jobs(id) on delete set null,

  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobada','modificada','objetada','rechazada','pospuesta','pide_evidencia')),
  -- Una decisión rutinaria ya autorizada no debe hacer cola: el manual pide no convertir a Kelin
  -- en aprobadora de cada paso.
  requiere_aprobacion boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decisiones_empresa_idx on decisiones (company_id, estado, created_at desc);

-- CADA INTERVENCIÓN HUMANA, SIN PISAR LA ANTERIOR.
create table if not exists decision_historial (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references decisiones(id) on delete cascade,
  accion text not null check (accion in ('aprobar','modificar','objetar','rechazar','posponer','pedir_evidencia')),
  -- Lo que decía la decisión ANTES de esta intervención. Sin esto no hay con qué comparar después.
  antes jsonb,
  -- Lo que la consultora puso en su lugar, si modificó.
  despues jsonb,
  motivo text not null,
  actor_id uuid references users(id) on delete set null,
  actor_rol text,
  -- EL RESULTADO POSTERIOR, que se rellena cuando se sabe. Nace nulo a propósito: nadie puede
  -- afirmar el día de la decisión si fue acertada.
  resultado text,
  resultado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists decision_historial_idx on decision_historial (decision_id, created_at);

alter table decisiones enable row level security;
alter table decision_historial enable row level security;

drop policy if exists decisiones_cliente on decisiones;
create policy decisiones_cliente on decisiones for select using (company_id in (select mis_empresas()));
drop policy if exists decisiones_consultor on decisiones;
create policy decisiones_consultor on decisiones for all using (es_consultor()) with check (es_consultor());

drop policy if exists historial_cliente on decision_historial;
create policy historial_cliente on decision_historial for select
  using (decision_id in (select id from decisiones where company_id in (select mis_empresas())));
drop policy if exists historial_consultor on decision_historial;
create policy historial_consultor on decision_historial for all using (es_consultor()) with check (es_consultor());
