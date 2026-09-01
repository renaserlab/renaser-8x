-- ============================================================================
-- QUE BORRAR UNA EMPRESA NO DEPENDA DEL AZAR (30-08-2026).
--
-- Kelin no pudo eliminar Jardín Renaser: «violates foreign key constraint
-- interview_responses_origen_claim_id_fkey». Al borrar la empresa sus definiciones se van en
-- cascada, pero DIEZ referencias del esquema apuntan a esas filas sin acción de borrado. Cuál salta
-- depende del orden en que Postgres decida cascadear: por eso las empresas vacías se borraban y las
-- trabajadas no, y el síntoma parecía aleatorio.
--
-- Se resolvió por código (lib/borrar-empresa.ts) y esa función sigue siendo correcta. Esto lo cierra
-- donde corresponde: en la propia base, para que ningún camino futuro —un script, una consulta a
-- mano, otra ruta -- se vuelva a topar con el mismo muro.
--
-- CRITERIO: enlaces entre iguales (una definición que contradice a otra, un proceso que deriva de
-- otro) van a SET NULL — el dato sobrevive, solo pierde el enlace. Filas que no significan nada sin
-- su padre (la evidencia de un hallazgo) van a CASCADE.
-- ============================================================================

-- Una respuesta de entrevista nacida de una definición. ESTE es el que bloqueó a Kelin.
alter table interview_responses drop constraint if exists interview_responses_origen_claim_id_fkey;
alter table interview_responses add constraint interview_responses_origen_claim_id_fkey
  foreign key (origen_claim_id) references claims(id) on delete set null;

-- Una definición que contradice a otra: si la contradicha se va, esta sigue valiendo sola.
alter table claims drop constraint if exists claims_contradice_a_fkey;
alter table claims add constraint claims_contradice_a_fkey
  foreign key (contradice_a) references claims(id) on delete set null;

-- La definición sin su fuente no se sostiene: es la fuente la que le da respaldo.
alter table claims drop constraint if exists claims_source_id_fkey;
alter table claims add constraint claims_source_id_fkey
  foreign key (source_id) references sources(id) on delete cascade;

-- Quién dijo cada cosa: si la persona se borra, la afirmación queda sin autor pero no se pierde.
alter table claims drop constraint if exists claims_participant_id_fkey;
alter table claims add constraint claims_participant_id_fkey
  foreign key (participant_id) references participants(id) on delete set null;

-- Una sesión de entrevista sin su participante no existe.
alter table interview_sessions drop constraint if exists interview_sessions_participant_id_fkey;
alter table interview_sessions add constraint interview_sessions_participant_id_fkey
  foreign key (participant_id) references participants(id) on delete cascade;

-- El know-how es de la empresa aunque su autor ya no esté: se conserva sin autor.
alter table know_how drop constraint if exists know_how_participant_id_fkey;
alter table know_how add constraint know_how_participant_id_fkey
  foreign key (participant_id) references participants(id) on delete set null;

-- El proceso TO-BE apunta a su AS-IS: si el original se borra, el mejorado queda suelto, no muerto.
alter table processes drop constraint if exists processes_padre_id_fkey;
alter table processes add constraint processes_padre_id_fkey
  foreign key (padre_id) references processes(id) on delete set null;

-- Una acción del plan nace de un hallazgo, pero se sigue trabajando aunque el hallazgo se archive.
alter table actions drop constraint if exists actions_finding_id_fkey;
alter table actions add constraint actions_finding_id_fkey
  foreign key (finding_id) references findings(id) on delete set null;

-- La corrección de un hallazgo no significa nada sin el hallazgo.
alter table corrections drop constraint if exists corrections_finding_id_fkey;
alter table corrections add constraint corrections_finding_id_fkey
  foreign key (finding_id) references findings(id) on delete cascade;

-- El documento en construcción apunta a la fuente de la que salió; sin ella sigue en pie.
alter table company_assets drop constraint if exists company_assets_source_id_fkey;
alter table company_assets add constraint company_assets_source_id_fkey
  foreign key (source_id) references sources(id) on delete set null;
