-- Lo que hay que tener a mano ANTES de empezar (herramientas, formatos, accesos).
-- El agente ya lo redactaba y la pantalla ya lo mostraba ("Tener a mano"); faltaba dónde guardarlo.
alter table public.sops add column if not exists materiales jsonb not null default '[]'::jsonb;
