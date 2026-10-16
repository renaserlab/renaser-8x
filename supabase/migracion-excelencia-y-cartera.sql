-- NIVEL 2 COMO CAPACIDADES, Y LA CARTERA DE RENASER (instrucción de Dirección 13-10-2026, secciones 15 y 16).
--
-- El Nivel 2 (excelencia, servicio y aceleración) no son «más indicadores»: son iniciativas con hipótesis, evidencia,
-- recursos, plazo, medida de éxito y criterio para continuar, ajustar o detener. Si la investigación externa no puede
-- hacerse, se aceptan fuentes aportadas y queda registrado lo pendiente; no se inventa mercado ni competidores.
-- La cartera necesita saber quién lleva cada empresa y qué nivel y alcance se contrató; lo demás (fase, prioridades,
-- próxima decisión, compromisos, entregas, bloqueos, resultados, carga) se deriva de tablas que ya existen.
-- Aditiva: solo create table if not exists y add column if not exists.

-- ───────────────────────── 1 · INICIATIVAS DE NIVEL 2 ─────────────────────────
create table if not exists iniciativas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  dominio text not null check (dominio in (
    'mercado_y_competencia','clientes_prioritarios','posicionamiento_y_diferenciacion','propuesta_de_alto_valor',
    'portafolio_y_precios','adquisicion','conversion','retencion','expansion','experiencia_y_promesa_de_servicio',
    'estandares_de_calidad','liderazgo_y_capacidades','escenarios_de_crecimiento','capacidad_operativa_y_financiera','riesgos_de_expansion')),
  titulo text not null,
  hipotesis text not null,                          -- qué creemos que pasará y por qué
  evidencia_ids uuid[] not null default '{}',       -- afirmaciones, fuentes o hallazgos que la sustentan
  fuentes_aportadas jsonb not null default '[]'::jsonb,  -- [{ nombre, quien_la_aporto, fecha, que_dice }] cuando no hay investigación externa
  pendiente_investigacion text,                     -- lo que no se pudo investigar y queda dicho
  recursos text,
  plazo_inicio date,
  plazo_fin date,
  medida_exito text not null,                       -- cómo sabremos que funcionó (indicador o hecho observable)
  indicador_id uuid references indicadores(id),
  criterio_continuar text,
  criterio_ajustar text,
  criterio_detener text,
  estado text not null default 'propuesta' check (estado in ('propuesta','aprobada','en_curso','continuar','ajustar','detener','cerrada')),
  decision_at timestamptz,
  decision_por uuid references users(id),
  decision_motivo text,
  responsable_participant_id uuid references participants(id),
  creada_por uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists iniciativas_company_idx on iniciativas (company_id, estado);
alter table iniciativas enable row level security;
drop policy if exists iniciativas_consultor on iniciativas;
create policy iniciativas_consultor on iniciativas for all using (es_consultor()) with check (es_consultor());
drop policy if exists iniciativas_cliente on iniciativas;
create policy iniciativas_cliente on iniciativas for select using (company_id in (select mis_empresas()) and estado <> 'propuesta');

-- Historial de decisiones sobre una iniciativa: continuar, ajustar o detener, con quién y por qué.
create table if not exists iniciativa_historial (
  id uuid primary key default gen_random_uuid(),
  iniciativa_id uuid not null references iniciativas(id) on delete cascade,
  de_estado text,
  a_estado text not null,
  motivo text,
  evidencia jsonb,
  actor_id uuid references users(id),
  created_at timestamptz default now()
);
alter table iniciativa_historial enable row level security;
drop policy if exists iniciativa_historial_consultor on iniciativa_historial;
create policy iniciativa_historial_consultor on iniciativa_historial for all using (es_consultor()) with check (es_consultor());

-- ───────────────────────── 2 · CARTERA ─────────────────────────
alter table companies add column if not exists consultor_responsable_id uuid references users(id);
alter table companies add column if not exists nivel_contratado text check (nivel_contratado in ('nivel_1','nivel_2'));
alter table companies add column if not exists alcance_contratado text;
alter table companies add column if not exists proxima_decision text;            -- la próxima decisión que Dirección debe tomar sobre esta empresa
alter table companies add column if not exists proxima_decision_fecha date;
create index if not exists companies_consultor_idx on companies (consultor_responsable_id);
