-- ============================================================================
-- AUTORIDAD: quién puede aprobar (13-10-2026, requisito R18.2).
-- Hasta hoy la única pregunta era «¿tiene sesión y pertenece a la empresa?». Esta columna guarda la
-- tercera: qué puede comprometer cada persona con una aprobación. Vocabulario en src/lib/autoridad.ts.
--
-- ADITIVA E IDEMPOTENTE. Vacía ('{}') significa «no configurada»: rige lo que cada rol podía hacer
-- hasta hoy, así que aplicarla no cambia el comportamiento de nadie. 'ninguna' es el valor explícito
-- para «no aprueba nada» (distinto de no configurado).
-- ============================================================================

alter table users add column if not exists autoridad text[] not null default '{}'::text[];

comment on column users.autoridad is
  'Autoridades explícitas: aprobar_plan | aprobar_hallazgo | cerrar_medicion | administrar | ninguna. Vacía = la del rol (compatibilidad).';

-- Solo valores del vocabulario: un error de tipeo no puede convertirse en una autoridad fantasma.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_autoridad_conocida') then
    alter table users add constraint users_autoridad_conocida
      check (autoridad <@ array['aprobar_plan', 'aprobar_hallazgo', 'cerrar_medicion', 'administrar', 'ninguna']::text[]);
  end if;
end $$;
