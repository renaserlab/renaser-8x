-- LO QUE EL CLIENTE LLENA HOY (16-10-2026, pedido de Kelin: «que mi cliente entre hoy y lo llene»).
--
-- Qué hace. Deja a la empresa contar cómo gana dinero sin que sea tedioso para el dueño, y a la consultora abrirle
-- solo lo que necesita que llene:
--   · companies: cómo gana dinero (uno o dos modelos), qué trabajo compró, cuándo arrancó su ruta y a qué hora
--     cierra (desde esa hora se puede anotar el valor de HOY de un indicador diario).
--   · lineas_producto: dos precios (por mayor o mínimo) y cuántas de cada 10 ventas van al segundo, el costo por
--     partes, cuánto se vende en un mes normal (exacto, en rango o «de cada 10» de su grupo) y el estado de cada
--     dato (a ojo, anotado, comprobado). La vista del dueño se rehace con esas columnas.
--   · costos_mes: los gastos fijos y los de vender, uno por fila, con monto, rango o «no lo sé».
--   · ficha_negocio: lo que la empresa responde una vez (historia, módulos, totales, moneda, crédito, inventario).
--   · operaciones_moneda: una fila por venta cobrada en otra moneda, para ver cuánto se queda en el camino.
--   · solicitudes_cliente: lo que la consultora le pide al cliente; sin solicitud activa, el cliente no escribe.
--   · ruta_marcas: las marcas y veredictos de compuerta de la consultora. Trabajo interno: el dueño no los lee.
--   · process_versiones: la copia de un proceso antes de volver a dibujarlo con un archivo, para poder volver atrás.
--
-- Para quién. La consultora lee y escribe todo. El dueño solo LEE lo suyo, y nunca ruta_marcas; lo que escribe
-- entra por las rutas de la aplicación (protegido(), con la solicitud abierta), no directo a la base.
--
-- Qué NO hace. No borra ni cambia ningún dato. Los únicos drop son de la vista del dueño (se vuelve a crear con las
-- columnas nuevas, con el mismo revoke) y de dos checks que se vuelven a crear en la línea siguiente. costos_mes no
-- admite tipo «variable»: lo variable por unidad vive en las partes del costo de cada producto, y el total variable
-- del mes ya tiene su clave (company_metricas.costo_variable_mes). Idempotente: se puede aplicar dos veces.

-- 1 · La empresa: cómo gana dinero, qué trabajo compró, cuándo arrancó su ruta y a qué hora cierra.
alter table companies add column if not exists modelo_negocio text[] check (
  modelo_negocio is null or (cardinality(modelo_negocio) between 1 and 2 and modelo_negocio <@ array[
    'fabrica_y_vende','compra_y_revende','vende_horas_o_casos','vende_proyectos','intermedia_comision','prepara_y_sirve']::text[]));
alter table companies add column if not exists tipo_trabajo text check (tipo_trabajo in ('estructurar','sistematizar_directo','estructurar_y_sistematizar'));
alter table companies add column if not exists ruta_inicio date;
alter table companies add column if not exists hora_cierre text check (hora_cierre ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- 2 · Lo que vende: dos precios, costo por partes, volumen mensual (exacto, rango o «de cada 10»), estado de cada dato.
alter table lineas_producto add column if not exists modelo text check (modelo is null or modelo in (
  'fabrica_y_vende','compra_y_revende','vende_horas_o_casos','vende_proyectos','intermedia_comision','prepara_y_sirve'));
alter table lineas_producto add column if not exists grupo text check (grupo is null or length(grupo) <= 60);
alter table lineas_producto add column if not exists canal text check (canal is null or length(canal) <= 120);
alter table lineas_producto add column if not exists precio_segundo numeric check (precio_segundo >= 0);
alter table lineas_producto add column if not exists segundo_precio_es text check (segundo_precio_es in ('por_mayor','minimo'));
alter table lineas_producto add column if not exists de_cada_10_segundo numeric check (de_cada_10_segundo between 0 and 10);
alter table lineas_producto add column if not exists componentes_costo jsonb not null default '[]'::jsonb check (jsonb_typeof(componentes_costo) = 'array');
alter table lineas_producto add column if not exists unidades_mes numeric check (unidades_mes >= 0);
alter table lineas_producto add column if not exists unidades_mes_desde numeric check (unidades_mes_desde >= 0);
alter table lineas_producto add column if not exists unidades_mes_hasta numeric check (unidades_mes_hasta >= 0);
alter table lineas_producto add column if not exists participacion_de_10 numeric check (participacion_de_10 between 0 and 10);
alter table lineas_producto add column if not exists estados jsonb not null default '{}'::jsonb check (jsonb_typeof(estados) = 'object');
alter table lineas_producto add column if not exists datos_modelo jsonb check (datos_modelo is null or jsonb_typeof(datos_modelo) = 'object');
alter table lineas_producto add column if not exists creada_por uuid references users(id) on delete set null;
alter table lineas_producto drop constraint if exists lineas_producto_unidades_mes_forma;
alter table lineas_producto add constraint lineas_producto_unidades_mes_forma check (
  (unidades_mes is null or (unidades_mes_desde is null and unidades_mes_hasta is null))
  and ((unidades_mes_desde is null) = (unidades_mes_hasta is null))
  and (unidades_mes_desde is null or unidades_mes_desde <= unidades_mes_hasta));
alter table lineas_producto drop constraint if exists lineas_producto_segundo_precio_forma;
alter table lineas_producto add constraint lineas_producto_segundo_precio_forma check ((precio_segundo is null) = (segundo_precio_es is null));

-- 3 · La vista del dueño se rehace con las columnas nuevas (mismo patrón y mismo revoke que migracion-lineas-producto-cliente.sql).
-- Una vista de una sola tabla es actualizable: sin el revoke, el dueño escribiría en lineas_producto a través de ella.
drop view if exists lineas_producto_cliente;
create view lineas_producto_cliente with (security_barrier = true) as
select
  id, company_id, codigo, nombre, tipo, cliente_objetivo, necesidad, promesa,
  precio, costo_variable_unitario, unidades_periodo, horas_por_unidad, periodo,
  origen, source_id, created_at, updated_at,
  modelo, grupo, canal, precio_segundo, segundo_precio_es, de_cada_10_segundo, componentes_costo,
  unidades_mes, unidades_mes_desde, unidades_mes_hasta, participacion_de_10, estados, datos_modelo, creada_por
from lineas_producto
where company_id in (select mis_empresas());
revoke all on lineas_producto_cliente from public, anon, authenticated;
grant select on lineas_producto_cliente to authenticated;

-- 4 · Gastos del mes. Un monto, un rango (desde-hasta) o «no lo sé»: nunca un cero puesto por nosotros.
create table if not exists costos_mes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  periodo text not null default 'mes_tipico' check (periodo = 'mes_tipico' or periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  tipo text not null check (tipo in ('fijo','comercializacion')),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  monto numeric check (monto >= 0),
  monto_desde numeric check (monto_desde >= 0),
  monto_hasta numeric check (monto_hasta >= 0),
  estado text not null default 'estimado' check (estado in ('estimado','contado','comprobado','no_lo_se')),
  nota text check (nota is null or length(nota) <= 600),
  orden int not null default 0,
  creado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (monto is null or (monto_desde is null and monto_hasta is null)),
  check ((monto_desde is null) = (monto_hasta is null)),
  check (monto_desde is null or monto_desde <= monto_hasta),
  check (estado <> 'no_lo_se' or (monto is null and monto_desde is null))
);
create index if not exists costos_mes_company_idx on costos_mes (company_id, periodo, orden);

-- 5 · Lo que la empresa responde una vez: historia, módulos, totales para «de cada 10», moneda, crédito, inventario.
-- Cada bloque es un objeto; su forma la valida la aplicación (src/lib/esquemas-negocio.ts) antes de escribir.
create table if not exists ficha_negocio (
  company_id uuid primary key references companies(id) on delete cascade,
  historia jsonb not null default '{}'::jsonb,
  modulos jsonb not null default '{}'::jsonb,
  totales jsonb not null default '{}'::jsonb,
  moneda jsonb not null default '{}'::jsonb,
  credito jsonb not null default '{}'::jsonb,
  inventario jsonb not null default '{}'::jsonb,
  actualizado_por uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(historia) = 'object' and jsonb_typeof(modulos) = 'object' and jsonb_typeof(totales) = 'object'
     and jsonb_typeof(moneda) = 'object' and jsonb_typeof(credito) = 'object' and jsonb_typeof(inventario) = 'object')
);

-- 6 · Ventas cobradas en otra moneda: una fila por operación.
create table if not exists operaciones_moneda (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  fecha_venta date,
  fecha_cobro date,
  dias_cobro int check (dias_cobro between 0 and 730),
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  monto numeric not null check (monto > 0),          -- en la moneda de la venta
  tc_cotizado numeric check (tc_cotizado > 0),       -- moneda local por 1 de la moneda de venta, con el que se puso el precio
  tc_cobro numeric check (tc_cobro > 0),             -- moneda local por 1, de referencia, el día que se cobró
  recibido numeric check (recibido >= 0),            -- lo que llegó a la cuenta, en moneda local
  comisiones numeric check (comisiones >= 0),        -- en moneda local
  conversiones smallint check (conversiones in (1,2)),
  estado text not null default 'estimado' check (estado in ('estimado','contado','comprobado')),
  source_id uuid references sources(id) on delete set null,
  nota text check (nota is null or length(nota) <= 600),
  creado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_cobro is null or fecha_venta is null or fecha_cobro >= fecha_venta)
);
create index if not exists operaciones_moneda_company_idx on operaciones_moneda (company_id, fecha_venta desc);

-- 7 · Lo que la consultora le pide al cliente. Una sola solicitud activa por sección y empresa.
create table if not exists solicitudes_cliente (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  seccion text not null check (seccion in ('productos','costos','historia','moneda','credito','inventario',
    'corroborar_diagnostico','datos_faltantes','subir_organigrama','subir_manuales','subir_procesos')),
  nota text check (nota is null or length(nota) <= 600),
  estado text not null default 'activa' check (estado in ('activa','completada','retirada')),
  activada_por uuid references users(id) on delete set null,
  activada_at timestamptz not null default now(),
  completada_por uuid references users(id) on delete set null,
  completada_at timestamptz,
  retirada_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists solicitudes_cliente_una_activa on solicitudes_cliente (company_id, seccion) where estado = 'activa';
create index if not exists solicitudes_cliente_company_idx on solicitudes_cliente (company_id, estado, activada_at desc);

-- 8 · Marcas y veredictos de compuerta: trabajo de la consultora, el dueño no los lee.
create table if not exists ruta_marcas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  clave text not null check (clave ~ '^[a-z_0-9]+\.[a-z_0-9]+$'),   -- '<etapa>.<criterio>' o '<etapa>.compuerta'
  valor text not null check (valor in ('cumple','no_cumple','verde','ambar','rojo')),
  nota text check (nota is null or length(nota) <= 600),
  marcado_por uuid references users(id) on delete set null,
  marcado_at timestamptz not null default now(),
  unique (company_id, clave)
);

-- 9 · RLS. La consultora todo; el cliente solo lee lo suyo. ruta_marcas: sin política de cliente.
alter table costos_mes enable row level security;
alter table ficha_negocio enable row level security;
alter table operaciones_moneda enable row level security;
alter table solicitudes_cliente enable row level security;
alter table ruta_marcas enable row level security;
drop policy if exists costos_mes_consultor on costos_mes;
create policy costos_mes_consultor on costos_mes for all using (es_consultor()) with check (es_consultor());
drop policy if exists costos_mes_cliente on costos_mes;
create policy costos_mes_cliente on costos_mes for select using (company_id in (select mis_empresas()));
drop policy if exists ficha_negocio_consultor on ficha_negocio;
create policy ficha_negocio_consultor on ficha_negocio for all using (es_consultor()) with check (es_consultor());
drop policy if exists ficha_negocio_cliente on ficha_negocio;
create policy ficha_negocio_cliente on ficha_negocio for select using (company_id in (select mis_empresas()));
drop policy if exists operaciones_moneda_consultor on operaciones_moneda;
create policy operaciones_moneda_consultor on operaciones_moneda for all using (es_consultor()) with check (es_consultor());
drop policy if exists operaciones_moneda_cliente on operaciones_moneda;
create policy operaciones_moneda_cliente on operaciones_moneda for select using (company_id in (select mis_empresas()));
drop policy if exists solicitudes_cliente_consultor on solicitudes_cliente;
create policy solicitudes_cliente_consultor on solicitudes_cliente for all using (es_consultor()) with check (es_consultor());
drop policy if exists solicitudes_cliente_cliente on solicitudes_cliente;
create policy solicitudes_cliente_cliente on solicitudes_cliente for select using (company_id in (select mis_empresas()) and estado <> 'retirada');
drop policy if exists ruta_marcas_consultor on ruta_marcas;
create policy ruta_marcas_consultor on ruta_marcas for all using (es_consultor()) with check (es_consultor());

-- 10 · La versión anterior de un proceso, antes de volver a dibujarlo con un archivo (api/processes/[id]/dibujar).
-- Dibujarlo otra vez borra sus pasos (y con ellos lo que colgaba de cada paso); antes se guarda aquí una copia de los
-- pasos, las conexiones y la ficha tal como estaban, para poder volver atrás. La escribe la aplicación; el dueño lee
-- las de sus empresas y no escribe.
create table if not exists process_versiones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  process_id uuid not null references processes(id) on delete cascade,
  motivo text not null check (length(btrim(motivo)) between 1 and 200),
  contenido jsonb not null check (jsonb_typeof(contenido) = 'object'),
  creado_por uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists process_versiones_proceso_idx on process_versiones (process_id, created_at desc);
alter table process_versiones enable row level security;
drop policy if exists process_versiones_consultor on process_versiones;
create policy process_versiones_consultor on process_versiones for all using (es_consultor()) with check (es_consultor());
drop policy if exists process_versiones_cliente on process_versiones;
create policy process_versiones_cliente on process_versiones for select using (company_id in (select mis_empresas()));
