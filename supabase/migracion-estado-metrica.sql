-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- EL CANDADO QUE NO ESTABA ESCRITO EN NINGUNA PARTE · 28-10-2026
--
-- QUÉ PASÓ, Y CUÁNTO COSTÓ. La base de producción tiene un check sobre `company_metricas.estado` que
-- NO ESTÁ DECLARADO EN NINGÚN SQL DE ESTE REPOSITORIO. Admite tres valores —contado, verificado y
-- sin_dato— y el código escribe cinco: `EstadoMetrica` en src/lib/metricas.ts:199 añade `extraido` y
-- `descartado`.
--
-- El lector de documentos escribe siempre «extraido». Así que CADA número que sale de un documento es
-- rechazado por la base, el trabajo entero muere, y la fuente queda en «leyendo» para siempre.
--
-- Lo que se midió el 28-10 antes de escribir esto:
--   · 4 fuentes de la primera empresa cliente llevan diez días en «leyendo», y nunca iban a salir.
--   · 124 números guardados en toda la base, TODOS con `origen` en nulo: la columna se escribe en el
--     mismo insert que falla, así que nunca llegó a ponerse. Por eso la cola de conciliación del
--     consultor —que filtra por `origen`— sale vacía siempre, en las cinco empresas.
--   · La primera empresa cliente tiene 2 de sus 9 números vitales. Uno de los que faltan, `caja_hoy`,
--     estaba en un documento ya leído y fue rechazado por este candado.
--
-- Y POR QUÉ NADIE LO PERSIGUIÓ DIEZ DÍAS: el mensaje de error culpa a otra cosa. Dice «¿falta aplicar
-- supabase/migracion-evidencia-dimensiones.sql?», y esa migración SÍ está aplicada. Peor: su propio
-- comentario afirma que «`estado` sigue siendo texto libre (sin check en producción)». Quien la
-- escribió miró y no vio el candado. Un error que acusa al inocente cuesta más que uno que no dice nada.
--
-- QUÉ SE DECIDE AQUÍ: manda el vocabulario del código. `EstadoMetrica` es lo que la aplicación sabe
-- decir, y la base tiene que admitir eso y nada más. Los 124 números que ya existen usan tres de los
-- cinco valores, así que ninguno se queda fuera y ninguna fila cambia.
--
-- NO BORRA NADA Y NO TOCA UN SOLO DATO. Se puede correr dos veces sin daño.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

-- Un check no se amplía: se reemplaza. Se quita por nombre y se vuelve a crear con los cinco valores.
-- `if exists` porque el nombre salió de la base y no de este repositorio: en otro entorno puede no estar.
alter table company_metricas drop constraint if exists company_metricas_estado_check;

alter table company_metricas add constraint company_metricas_estado_check
  check (estado in ('contado', 'verificado', 'extraido', 'descartado', 'sin_dato'));

comment on column company_metricas.estado is
  'Qué tan firme es el número, con el vocabulario de EstadoMetrica (src/lib/metricas.ts): «contado» lo contó alguien, «verificado» se comprobó contra una prueba, «extraido» lo sacó el lector de un documento y está sin conciliar, «descartado» se miró y no sirve, «sin_dato» se preguntó y no lo hay. Esta lista y la del código son la misma: si se agrega un valor allá, hay que agregarlo aquí, y una prueba lo comprueba.';
