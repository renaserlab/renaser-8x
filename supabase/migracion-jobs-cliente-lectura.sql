-- EL DUEÑO VE AVANZAR SU PROPIO TRABAJO (13-10-2026, sección 17 «salidas que no llegan al panel»).
--
-- Progreso.tsx se suscribe por Realtime a `jobs` (schema.sql añade la tabla a la publicación), pero `jobs` no tenía
-- ninguna política para el cliente: el canal en vivo del dueño nunca recibía nada y solo funcionaba el sondeo cada
-- 4 segundos a /api/jobs/[id]. Esta política le deja LEER los trabajos de sus empresas; escribir sigue siendo del
-- servidor (service_role). Aditiva: solo crea una política.
alter table jobs enable row level security;
drop policy if exists jobs_cliente_lectura on jobs;
create policy jobs_cliente_lectura on jobs for select using (company_id in (select mis_empresas()));
