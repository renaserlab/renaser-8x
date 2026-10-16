-- LA ENTRADA BREVE, LA FICHA DE DIRECCIÓN Y LO QUE VENDE LA EMPRESA (instrucción de Dirección 13-10-2026, secciones 7, 8, 9 y 16).
--
-- Una sesión de entrada breve es una entrevista más (reutiliza interview_sessions/responses, el transcriptor y el
-- extractor): por eso se amplía el check de `tipo` en vez de crear otra tabla. Cada respuesta dice con qué certeza
-- se dio (exacta, aproximada, «no lo sé») y si ya la sabíamos por un documento. La Ficha de Dirección Empresarial es
-- versionada y distingue declaración (lo dijo el dueño), interpretación (lo leyó la consultora o el modelo) y acuerdo
-- (lo firmaron ambos). La empresa declara país, moneda, idioma y zona horaria: hoy todo está clavado a Perú y no se
-- declara compatibilidad internacional que no esté probada. Las líneas de producto/servicio alimentan el costeo
-- determinista (src/lib/finanzas.ts). Aditiva: nada se borra; el único drop es del check que se vuelve a crear más amplio.

-- 1 · Entrada breve como tipo de sesión; plan fijo y síntesis corregible.
alter table interview_sessions drop constraint if exists interview_sessions_tipo_check;
alter table interview_sessions add constraint interview_sessions_tipo_check
  check (tipo in ('sueno_dueno','empresa_dueno','lider','personal','know_how','validacion','entrada_breve'));
alter table interview_sessions add column if not exists plan jsonb;                 -- lista fija de claves de pregunta de la sesión
alter table interview_sessions add column if not exists sintesis jsonb;             -- lo que entendimos, para que el dueño lo corrija
alter table interview_sessions add column if not exists sintesis_confirmada_at timestamptz;
alter table interview_responses add column if not exists certeza text check (certeza in ('exacta','aproximada','no_lo_se'));
alter table interview_responses add column if not exists sabida_por text;           -- «ya lo sabíamos por: <fuente>»: no se vuelve a preguntar, se confirma
alter table interview_responses add column if not exists clave_pregunta text;       -- clave estable de la pregunta del plan (p. ej. entrada.negocio_hoy)

-- 2 · Ficha de Dirección Empresarial, versionada.
create table if not exists ficha_direccion (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  version int not null default 1,
  estado text not null default 'borrador' check (estado in ('borrador','acordada','reemplazada')),
  -- nueve bloques: proposito, empresa_deseada, clientes_reputacion, rol_futuro, resultados_deseados, tiempo,
  -- limites, fortalezas, distancia, decisiones_pendientes. Cada ítem: { texto, tipo: declaracion|interpretacion|acuerdo, fuentes: [ids], fecha }
  bloques jsonb not null default '{}'::jsonb,
  -- ocho dimensiones de dependencia: comercial, operativa, financiera, decisiones, conocimiento, equipo, relaciones, continuidad.
  -- Cada una: { que_se_detiene, podria_delegarse, capacidad_falta, aporta_valor, evidencia: [ids], nota }. Es descripción, no índice.
  dependencia jsonb not null default '{}'::jsonb,
  creada_por uuid references users(id),
  acordada_por uuid references users(id),
  acordada_at timestamptz,
  reemplaza_a uuid references ficha_direccion(id),
  created_at timestamptz default now(),
  unique (company_id, version)
);
create index if not exists ficha_direccion_company_idx on ficha_direccion (company_id, version desc);
alter table ficha_direccion enable row level security;
drop policy if exists ficha_direccion_consultor on ficha_direccion;
create policy ficha_direccion_consultor on ficha_direccion for all using (es_consultor()) with check (es_consultor());
drop policy if exists ficha_direccion_cliente on ficha_direccion;
create policy ficha_direccion_cliente on ficha_direccion for select using (company_id in (select mis_empresas()) and estado = 'acordada');

-- 3 · Configuración por empresa (sección 16): se declara, no se promete.
alter table companies add column if not exists pais text default 'PE';
alter table companies add column if not exists moneda text default 'PEN';
alter table companies add column if not exists idioma text default 'es';
alter table companies add column if not exists zona_horaria text default 'America/Lima';

-- 4 · Lo que vende la empresa: líneas de producto o servicio para el costeo por SKU y por servicio.
create table if not exists lineas_producto (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  codigo text,
  nombre text not null,
  tipo text not null check (tipo in ('producto','servicio')),
  cliente_objetivo text,
  necesidad text,
  promesa text,
  precio numeric,
  costo_variable_unitario numeric,
  unidades_periodo numeric,                 -- unidades vendidas o casos atendidos en el período
  horas_por_unidad numeric,                 -- solo servicios: horas que consume una unidad
  periodo text,                             -- p. ej. 2026-09 o 2026-S1
  origen text check (origen in ('declarado','extraido','conciliado')),
  source_id uuid references sources(id),
  decision text check (decision in ('conservar','mejorar','ampliar','reposicionar','retirar')),
  decision_motivo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, codigo)
);
create index if not exists lineas_producto_company_idx on lineas_producto (company_id);
alter table lineas_producto enable row level security;
drop policy if exists lineas_producto_consultor on lineas_producto;
create policy lineas_producto_consultor on lineas_producto for all using (es_consultor()) with check (es_consultor());
drop policy if exists lineas_producto_cliente on lineas_producto;
create policy lineas_producto_cliente on lineas_producto for select using (company_id in (select mis_empresas()));
