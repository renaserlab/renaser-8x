-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 19-10-2026 · DESHACER migracion-finanzas.sql SIN PERDER NADA
--
-- Qué hace, en una sola transacción:
--   · quita los disparadores (los de las tablas fin_* y el que hace que la caja mande en company_metricas): desde ese
--     momento «Tus números» vuelve a escribirse como antes;
--   · borra las funciones de Finanzas: no guardan datos;
--   · RENOMBRA las 8 tablas fin_*, con todas sus filas, a fin_*_retirada (y sus índices, para poder volver a aplicar).
--
-- Qué NO hace: no borra filas. Las cifras de company_metricas con origen 'caja' se quedan como están (siguen siendo
-- válidas: el check ampliado con 'caja' se mantiene); desde ahora el dueño las puede corregir a mano como cualquier otra.
-- ════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop trigger if exists company_metricas_la_caja_manda on company_metricas;

do $$
declare t text; i text;
begin
  foreach t in array array['fin_categorias','fin_saldos_iniciales','fin_movimientos','fin_cierres','fin_cobros','fin_cobro_pagos',
    'fin_pagos_recurrentes','fin_pagos_hechos'] loop
    if to_regclass('public.' || t) is not null then
      for i in select tgname from pg_trigger where tgrelid = ('public.' || t)::regclass and not tgisinternal loop
        execute format('drop trigger if exists %I on %I', i, t);
      end loop;
    end if;
  end loop;
end $$;

drop function if exists fin_la_caja_manda();
drop function if exists fin_al_cambiar_hoy();
drop function if exists fin_al_cambiar_cierre();
drop function if exists fin_al_cambiar_movimiento();
drop function if exists fin_movimiento_automatico();
drop function if exists fin_mes_cerrado();
drop function if exists fin_reabrir_mes(uuid, date, text, uuid);
drop function if exists fin_cerrar_mes(uuid, date, numeric, text, uuid);
drop function if exists fin_anular_pago_hecho(uuid);
drop function if exists fin_pagar_recurrente(uuid, numeric, date, uuid);
drop function if exists fin_anular_pago_cobro(uuid);
drop function if exists fin_registrar_pago_cobro(uuid, numeric, date, text, uuid);
drop function if exists fin_sincronizar_actual(uuid);
drop function if exists fin_sincronizar_mes(uuid, date);
drop function if exists fin_retirar_metricas(uuid, text, text[]);
drop function if exists fin_escribir_metrica(uuid, text, text, numeric, text);
drop function if exists fin_asegurar_categorias(uuid);
drop function if exists fin_hoy(uuid);

do $$
declare t text; i text;
begin
  foreach t in array array['fin_pagos_hechos','fin_pagos_recurrentes','fin_cobro_pagos','fin_cobros','fin_cierres','fin_movimientos',
    'fin_saldos_iniciales','fin_categorias'] loop
    if to_regclass('public.' || t) is not null then
      for i in select indexname from pg_indexes where schemaname = 'public' and tablename = t loop
        execute format('alter index %I rename to %I', i, left(i, 54) || '_retirada');
      end loop;
      execute format('alter table %I rename to %I', t, t || '_retirada');
    end if;
  end loop;
end $$;

commit;
