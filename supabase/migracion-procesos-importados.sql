-- PROCESOS DE LA LISTA DE LA EMPRESA, SIN DIBUJAR (13-10-2026, R9.2).
--
-- Una empresa que ya tiene sus procesos en un Excel los importa (api/companies/[id]/procesos/importar) en vez de
-- dictarlos uno a uno. Lo importado es un nombre con su área y su responsable: la empresa dijo que existe, nadie lo
-- ha dibujado. No es un AS-IS, y guardarlo como AS-IS hacía que todo lo que lee procesos —la lista del dueño, la
-- Ficha de Dirección, el avance, el diagnóstico— lo contara como un flujo dibujado.
--
-- Por eso version admite un tercer valor, 'sin_dibujar', y origen admite 'importado'. Quien filtra
-- version = 'as_is' no los ve. Cuando al proceso se le guarda el primer paso (el editor o el dibujo de la IA
-- insertan en process_nodes), un disparador lo pasa a 'as_is': desde ese momento es un proceso dibujado como
-- cualquier otro, y conserva origen = 'importado' y su fuente en fuentes_usadas.
--
-- Aditiva: no borra datos. Los únicos drop son de los dos checks, que se vuelven a crear más amplios en la línea
-- siguiente, y del disparador, que se vuelve a crear. Idempotente: se puede aplicar dos veces.

-- 1 · Los dos checks, más amplios. Los nombres son los que Postgres da a un check de columna (tabla_columna_check).
alter table processes drop constraint if exists processes_version_check;
alter table processes add constraint processes_version_check check (version in ('as_is','to_be','sin_dibujar'));
alter table processes drop constraint if exists processes_origen_check;
alter table processes add constraint processes_origen_check check (origen in ('dibujado','generado_ia','importado'));

-- Si en esta base los checks originales tenían otro nombre, siguen vivos y más estrechos que los nuevos: la
-- importación fallaría sin explicar por qué. Se dice aquí, con el nombre, en vez de dejarlo para después.
do $$
declare
  sobrante text;
begin
  select string_agg(conname, ', ') into sobrante
    from pg_constraint
   where conrelid = 'public.processes'::regclass
     and contype = 'c'
     and conname not in ('processes_version_check', 'processes_origen_check')
     and (pg_get_constraintdef(oid) like '%as_is%' or pg_get_constraintdef(oid) like '%generado_ia%');
  if sobrante is not null then
    raise exception 'processes conserva otro check de version u origen (%): hay que quitarlo a mano para que admita sin_dibujar e importado', sobrante;
  end if;
end $$;

-- 2 · El primer paso dibujado convierte el proceso en AS-IS. Solo toca filas 'sin_dibujar': un AS-IS o un TO-BE
-- no cambian. Security definer para que valga igual lo inserte quien lo inserte (el editor escribe con
-- guardar_proceso, el dibujo de la IA con la service role).
create or replace function proceso_pasa_a_dibujado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update processes set version = 'as_is' where id = new.process_id and version = 'sin_dibujar';
  return new;
end;
$$;
revoke execute on function proceso_pasa_a_dibujado() from public, anon, authenticated;

drop trigger if exists process_nodes_dibuja_proceso on process_nodes;
create trigger process_nodes_dibuja_proceso after insert on process_nodes
  for each row execute function proceso_pasa_a_dibujado();
