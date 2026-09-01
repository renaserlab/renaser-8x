-- Segunda pasada: las que quedaron tras la primera. Mismo criterio.

-- La definición nace de un trozo concreto de la fuente. Si la fuente se va, sus trozos también, y
-- la definición pierde el ancla pero se conserva con su texto.
alter table claims drop constraint if exists claims_fragment_id_fkey;
alter table claims add constraint claims_fragment_id_fkey
  foreign key (fragment_id) references source_fragments(id) on delete set null;

-- QUIÉN HIZO QUÉ: si algún día se borra una cuenta, el rastro de lo que validó, corrigió, publicó o
-- aprobó NO se borra con ella. Queda sin autor, que es lo honesto: el hecho ocurrió.
alter table claims drop constraint if exists claims_validado_por_fkey;
alter table claims add constraint claims_validado_por_fkey
  foreign key (validado_por) references users(id) on delete set null;

alter table corrections drop constraint if exists corrections_user_id_fkey;
alter table corrections add constraint corrections_user_id_fkey
  foreign key (user_id) references users(id) on delete set null;

alter table deliverables drop constraint if exists deliverables_publicado_por_fkey;
alter table deliverables add constraint deliverables_publicado_por_fkey
  foreign key (publicado_por) references users(id) on delete set null;

alter table deliverables drop constraint if exists deliverables_aprobado_por_fkey;
alter table deliverables add constraint deliverables_aprobado_por_fkey
  foreign key (aprobado_por) references users(id) on delete set null;

-- La versión anterior de un documento: si se borra, la nueva queda sin predecesor pero sigue viva.
alter table deliverables drop constraint if exists deliverables_reemplaza_a_fkey;
alter table deliverables add constraint deliverables_reemplaza_a_fkey
  foreign key (reemplaza_a) references deliverables(id) on delete set null;

-- Tercera pasada.

-- LA PERSONA ENTREVISTADA Y SU CUENTA. Si se borra una cuenta —Kelin quiere liberar dos correos de
-- prueba— el participante NO debe irse con ella: sus respuestas son de la empresa, no del login.
-- Sin esto, borrar la cuenta fallaba con un error de clave foránea.
alter table participants drop constraint if exists participants_user_id_fkey;
alter table participants add constraint participants_user_id_fkey
  foreign key (user_id) references users(id) on delete set null;

-- Una corrida de evaluación sin su caso no significa nada.
alter table eval_runs drop constraint if exists eval_runs_case_id_fkey;
alter table eval_runs add constraint eval_runs_case_id_fkey
  foreign key (case_id) references cases(id) on delete cascade;

-- El consumo de tokens se cuenta para saber cuánto cuesta cada empresa. Si el trabajo se borra, el
-- gasto ya ocurrido no se borra con él: queda sin trabajo asociado, pero sigue contando.
alter table token_usage drop constraint if exists token_usage_job_id_fkey;
alter table token_usage add constraint token_usage_job_id_fkey
  foreign key (job_id) references jobs(id) on delete set null;
