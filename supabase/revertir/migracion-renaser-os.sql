-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 19-10-2026 · DESHACER migracion-renaser-os.sql SIN PERDER NADA
--
-- Qué hace, en una sola transacción:
--   · quita de pg_cron los cinco trabajos de RENASER OS (si pg_cron existe): la base deja de generar avisos;
--   · borra las siete funciones de las reglas: no guardan datos;
--   · RENOMBRA las 16 tablas os_*, con todas sus filas, a os_*_retirada. Sus índices con nombre se renombran también,
--     para que volver a aplicar la migración los cree de nuevo en vez de encontrarlos «ya existentes» en la retirada.
--
-- Qué NO hace: no borra ninguna fila ni ninguna tabla, ni los archivos del bucket os-entregables. Lo retirado sigue con
-- RLS y sin permisos para el navegador.
--
-- Después: el código de antes de RENASER OS funciona igual. Volver a aplicar supabase/migracion-renaser-os.sql crea
-- tablas nuevas y vacías; lo retirado se consulta aparte.
-- ════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare j text;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    foreach j in array array['os-inactividad','os-bloqueos','os-plan-manana','os-cierre-semanal','os-diagnostico'] loop
      if exists (select 1 from cron.job where jobname = j) then
        perform cron.unschedule(j);
      end if;
    end loop;
  end if;
end $$;

drop function if exists os_regla_inactividad();
drop function if exists os_regla_bloqueos();
drop function if exists os_regla_plan_manana();
drop function if exists os_regla_cierre_semanal();
drop function if exists os_regla_diagnostico();
drop function if exists os_marcar_corrida(text);
drop function if exists os_regla_activa(uuid, text);

-- Todos los índices de cada tabla (los con nombre propio y los de su clave primaria y sus únicas) llevan el sufijo:
-- si no, volver a aplicar la migración chocaría con un nombre que sigue vivo en la tabla retirada.
do $$
declare t text; i text;
begin
  foreach t in array array['os_personas','os_proyectos','os_tareas','os_bloqueos','os_reprogramaciones','os_registros_tiempo',
    'os_aperturas','os_cierres','os_cierres_semanales','os_entregables','os_objetivos','os_legajos','os_acompanamientos',
    'os_evaluaciones','os_avisos','os_reglas'] loop
    if to_regclass('public.' || t) is not null then
      for i in select indexname from pg_indexes where schemaname = 'public' and tablename = t loop
        execute format('alter index %I rename to %I', i, left(i, 54) || '_retirada');
      end loop;
      execute format('alter table %I rename to %I', t, t || '_retirada');
    end if;
  end loop;
end $$;

commit;
