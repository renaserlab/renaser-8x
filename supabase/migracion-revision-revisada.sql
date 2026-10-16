-- LA REVISIÓN SEMANAL DICE QUIÉN LA REVISÓ Y CUÁNDO (instrucción de Dirección 13-10-2026, sección 13, R13.2).
--
-- Hasta hoy «Marcar revisada» escribía a la consultora en `creada_por`: la columna que dice quién creó la fila
-- hacía de marca de revisión, sin fecha, y una fila guardada por una persona y revisada por otra no se podía contar.
-- Desde aquí `revisada_por` es quien la marcó como revisada y `revisada_at` el momento en que lo hizo;
-- `creada_por` vuelve a significar lo que dice su nombre.
--
-- Aditiva: dos columnas nuevas en una tabla que ya existe (supabase/migracion-plan-kpi-linea-base.sql). No borra ni
-- cambia nada de lo guardado. Se puede aplicar más de una vez.

-- Quién la revisó. Las filas que YA estaban marcadas (lo estaban si tenían `creada_por`, que era la única marca)
-- conservan a su revisora: se copia UNA sola vez, en el momento en que nace la columna. Volver a aplicar este
-- archivo no copia nada, porque desde hoy `creada_por` ya no significa «revisada».
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'revisiones_semanales' and column_name = 'revisada_por'
  ) then
    alter table revisiones_semanales add column revisada_por uuid references users(id);
    update revisiones_semanales set revisada_por = creada_por where creada_por is not null;
  end if;
end $$;

-- Cuándo se revisó. Las filas marcadas antes de hoy quedan sin fecha: nadie la guardó, y no se inventa una.
alter table revisiones_semanales add column if not exists revisada_at timestamptz;

comment on column revisiones_semanales.creada_por is 'Quién guardó la fila por primera vez. No dice quién la revisó.';
comment on column revisiones_semanales.revisada_por is 'Quién marcó la semana como revisada. Null: nadie la ha marcado.';
comment on column revisiones_semanales.revisada_at is 'Cuándo se marcó como revisada. Null: sin marcar, o marcada antes de que se guardara la fecha.';
