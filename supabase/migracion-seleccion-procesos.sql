-- ============================================================================
-- SELECCIÓN DE PROCESOS: por dónde se empieza (18-10-2026).
--
-- EL HUECO QUE CIERRA. 8X tenía la vara del rubro (modelo_alto_rendimiento: diez a quince procesos
-- que el sector exige) y el arquitecto, que dibuja UNO cuando alguien lo cuenta. En medio no había
-- nada que decidiera CUÁLES. El consultor elegía de memoria, y a la empresa que no tiene nada
-- escrito le caía la lista entera encima.
--
-- DOS LISTAS QUE NO SON LA MISMA COSA, y esa es toda la razón de esta tabla:
--   · para_contar: hasta 8 (tope). Lo que le pedimos contar a quien no tiene nada claro.
--   · mueven_las_ruedas: 1 a 3 (tope). Donde se interviene de verdad.
-- Los números y su razón de ser están en src/lib/metodo.ts, no aquí.
--
-- LA PUERTA DE APROBACIÓN. Regla de Kelin (18-10-2026): la consultora aprueba la selección ANTES
-- de que el cliente la vea. El cliente debe recibir «vamos a conocer estos cinco procesos» ya
-- decidido, no una lista de opciones — porque es la primera cosa que ve de nuestro criterio.
-- Por eso el estado nace en 'propuesta' y solo pasa a 'aprobada' con nombre y fecha.
--
-- ADITIVA E IDEMPOTENTE: crear esta tabla no cambia el comportamiento de nada existente.
-- ============================================================================

create table if not exists seleccion_procesos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,

  -- La salida del agente `selector`, validada contra SalidaSeleccionProcesos antes de llegar aquí.
  contenido jsonb not null,

  -- 'propuesta' = la hizo el sistema y NO puede verla el cliente.
  -- 'aprobada'  = la consultora la firmó; a partir de aquí se le puede entregar.
  -- 'descartada' = se decidió no usarla; se conserva para no perder el criterio de ese momento.
  estado text not null default 'propuesta',

  aprobada_por uuid references users(id) on delete set null,
  aprobada_at timestamptz,

  -- Lo que la consultora cambió o anotó al aprobar. Si corrigió la selección del sistema, aquí
  -- queda por qué: eso es lo que después permite mejorar al selector.
  nota_consultora text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table seleccion_procesos is
  'Por dónde se empieza: hasta 8 procesos para pedir que los cuenten y 1 a 3 claves de intervención. Nace en estado propuesta; la consultora la aprueba antes de que el cliente la vea.';

-- Un estado fuera del vocabulario es un estado fantasma: el cliente podría ver una propuesta sin aprobar.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'seleccion_procesos_estado_conocido') then
    alter table seleccion_procesos add constraint seleccion_procesos_estado_conocido
      check (estado in ('propuesta', 'aprobada', 'descartada'));
  end if;
end $$;

-- Aprobada sin quién ni cuándo no es una aprobación: es un campo cambiado. La firma es el dato.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'seleccion_procesos_aprobada_con_firma') then
    alter table seleccion_procesos add constraint seleccion_procesos_aprobada_con_firma
      check (estado <> 'aprobada' or (aprobada_por is not null and aprobada_at is not null));
  end if;
end $$;

create index if not exists seleccion_procesos_empresa on seleccion_procesos (company_id, created_at desc);

-- Una sola selección aprobada vigente por empresa: dos aprobadas a la vez dejarían al consultor
-- y al cliente mirando listas distintas. Las versiones anteriores se pasan a 'descartada'.
create unique index if not exists seleccion_procesos_una_aprobada
  on seleccion_procesos (company_id) where (estado = 'aprobada');

alter table seleccion_procesos enable row level security;

-- Sin políticas: se accede solo por la API con service_role, igual que el resto del trabajo de la
-- consultora. El cliente nunca lee esta tabla directamente; recibe la versión aprobada por el
-- camino de entregables.
