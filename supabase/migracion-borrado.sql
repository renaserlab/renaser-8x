-- ============================================================================
-- QUE UNA EMPRESA SE PUEDA BORRAR SIEMPRE (30-08-2026).
--
-- `cases` (el aprendizaje del sistema) apuntaba a companies SIN acción al borrar: en cuanto una
-- empresa tuviera un caso de aprendizaje, eliminarla habría fallado con un error de clave foránea
-- que nadie entiende. Hoy la tabla está vacía, así que es una bomba de tiempo, no un fallo actual.
--
-- Va a SET NULL, no a cascade: el aprendizaje del sistema es anónimo y tiene que SOBREVIVIR a la
-- empresa que lo originó. Eso es justamente lo que lo hace aprendizaje y no historial.
-- ============================================================================

alter table cases alter column company_id drop not null;
alter table cases drop constraint if exists cases_company_id_fkey;
alter table cases add constraint cases_company_id_fkey
  foreign key (company_id) references companies(id) on delete set null;
