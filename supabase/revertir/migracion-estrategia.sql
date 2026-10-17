-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 16-10-2026 · DESHACER migracion-estrategia.sql SIN PERDER NADA (clientes/8x-plan/spec-estrategia-8x.md, §10.3)
--
-- Qué hace, en una sola transacción:
--   · borra las dos funciones de coordinación y aprobación (estrategia_lente_lista, aprobar_estrategia): no guardan datos;
--   · RENOMBRA las tres tablas, con todas sus filas, a estrategias_retirada, estrategia_ediciones_retirada y
--     estrategia_preguntas_retirada;
--   · renombra también sus índices con nombre (y los de su clave primaria y su única) con el sufijo _retirada. Sin esto,
--     volver a aplicar la migración haría `create unique index if not exists estrategias_una_aprobada` contra el nombre
--     que sigue vivo en la tabla retirada, no lo crearía sin decir nada, y las tablas nuevas quedarían sin sus índices
--     únicos (dos estrategias aprobadas a la vez, dos preguntas abiertas de lo mismo);
--   · quita, si quedara de una versión anterior de la migración, la política de cliente de la tabla retirada de
--     preguntas: lo retirado solo lo lee la consultora.
--
-- Qué NO hace: no borra ninguna fila ni ninguna tabla. Los dos checks ampliados (solicitudes_cliente.seccion con
-- 'preguntas_estrategia', deliverables.tipo con 'plan_estrategico') SE QUEDAN: son más anchos, el código anterior no
-- los nota, y estrecharlos exigiría borrar filas. El disparador que impide cambiar el rastro de ediciones sigue
-- protegiendo la tabla retirada, y las tres siguen con RLS.
--
-- Después: el código de antes funciona igual. Volver a aplicar supabase/migracion-estrategia.sql crea tablas nuevas,
-- vacías y con sus índices; las filas retiradas se reincorporan a mano (insert … select … from *_retirada).
--
-- Se puede ejecutar dos veces: la segunda no encuentra nada que renombrar y no cambia nada. Si ya hay tablas retiradas
-- de una reversión anterior Y la migración se volvió a aplicar, se detiene antes de tocar nada y dice qué hacer.
--
-- No está en supabase/orden-aplicacion.json a propósito: no es parte del esquema, es la salida de emergencia. Vive en
-- esta subcarpeta porque tests/sql/aplicar.ts (archivosSqlDe) solo lee la carpeta de arriba.
-- Solo con el «sí» de Kelin, como cualquier cambio en producción.
-- ════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0 · No pisar una reversión anterior: si una tabla viva y su retirada existen a la vez, no se sigue.
do $$
declare t text;
begin
  foreach t in array array['estrategias','estrategia_ediciones','estrategia_preguntas'] loop
    if to_regclass('public.' || t) is not null and to_regclass('public.' || t || '_retirada') is not null then
      raise exception 'Ya existe %_retirada de una reversión anterior y % volvió a crearse. No se cambió nada: renombra o reincorpora a mano la retirada (por ejemplo, con la fecha en el nombre) y vuelve a ejecutar.', t, t;
    end if;
  end loop;
end $$;

-- 1 · Las dos funciones (no guardan datos).
drop function if exists estrategia_lente_lista(uuid, text, jsonb);
drop function if exists aprobar_estrategia(uuid, uuid, jsonb, text, timestamptz);
drop function if exists aprobar_estrategia(uuid, uuid, jsonb, text);

-- 2 · Las tres tablas, con sus filas, cambian de nombre.
alter table if exists estrategias rename to estrategias_retirada;
alter table if exists estrategia_ediciones rename to estrategia_ediciones_retirada;
alter table if exists estrategia_preguntas rename to estrategia_preguntas_retirada;

-- 3 · Sus índices también (renombrar el índice de una clave primaria o única renombra su restricción).
alter index if exists estrategias_una_aprobada rename to estrategias_una_aprobada_retirada;
alter index if exists estrategias_una_en_curso rename to estrategias_una_en_curso_retirada;
alter index if exists estrategias_company_idx rename to estrategias_company_idx_retirada;
alter index if exists estrategias_dia_idx rename to estrategias_dia_idx_retirada;
alter index if exists estrategias_pkey rename to estrategias_pkey_retirada;
alter index if exists estrategias_company_id_version_key rename to estrategias_company_id_version_key_retirada;
alter index if exists estrategia_ediciones_idx rename to estrategia_ediciones_idx_retirada;
alter index if exists estrategia_ediciones_pkey rename to estrategia_ediciones_pkey_retirada;
alter index if exists estrategia_preguntas_una_abierta rename to estrategia_preguntas_una_abierta_retirada;
alter index if exists estrategia_preguntas_company_idx rename to estrategia_preguntas_company_idx_retirada;
alter index if exists estrategia_preguntas_pkey rename to estrategia_preguntas_pkey_retirada;

-- 4 · Lo retirado no lo lee el dueño.
drop policy if exists estrategia_preguntas_cliente on estrategia_preguntas_retirada;

commit;

-- Comprobación: qué quedó retirado y que ya no queda nada vivo (las filas no se tocan: cada tabla retirada tiene las suyas).
select 'MIGRACION ESTRATEGIA RETIRADA' as resultado, now() as cuando,
       (select count(*) from information_schema.tables where table_schema = 'public'
          and table_name in ('estrategias','estrategia_ediciones','estrategia_preguntas')) as tablas_vivas_deben_ser_0,
       (select string_agg(table_name, ', ' order by table_name) from information_schema.tables where table_schema = 'public'
          and table_name in ('estrategias_retirada','estrategia_ediciones_retirada','estrategia_preguntas_retirada')) as tablas_retiradas,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
          and p.proname in ('estrategia_lente_lista','aprobar_estrategia')) as funciones_deben_ser_0;
