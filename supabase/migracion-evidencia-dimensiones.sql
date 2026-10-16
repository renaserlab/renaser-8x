-- LAS DIMENSIONES DE LA EVIDENCIA SE GUARDAN POR SEPARADO (instrucción de Dirección 13-10-2026, secciones 10 y 11).
--
-- Hasta hoy una fuente era «fuerte» o «débil» por su tipo, y una afirmación era confirmada o no. Eso mezcla
-- cosas distintas: quién lo dijo, de cuándo es, qué tan fiel fue la extracción, si alguien confirmó lo declarado,
-- si el hecho se comprobó contra un dato, y cuánta confianza merece la conclusión. Aquí cada cosa tiene su columna.
-- Un hallazgo separa su IMPACTO POTENCIAL (qué tan grave sería si es cierto) de su CONFIANZA (qué tan seguro es),
-- y puede ser PROVISIONAL: visible con su incertidumbre, nunca escondido.
-- Aditiva e idempotente: solo add column if not exists. Nada se borra ni se renombra. No cambia ningún check existente.
-- Se verifica sobre Postgres embebido (tests/sql); en producción se aplica solo con aprobación de Dirección.

-- Fuentes: autor, período que cubre, fidelidad de la extracción y revisión antes de consolidar.
alter table sources add column if not exists autor text;                      -- quién produjo el documento o dio la observación
alter table sources add column if not exists periodo_desde date;              -- qué período cubre la información (si se sabe)
alter table sources add column if not exists periodo_hasta date;
alter table sources add column if not exists fidelidad_extraccion text check (fidelidad_extraccion in ('alta','media','baja','no_analizado'));
alter table sources add column if not exists fidelidad_nota text;             -- por qué: «PDF escaneado sin texto», «hoja con celdas vacías»
alter table sources add column if not exists revision text check (revision in ('pendiente','consolidada'));  -- null = no aplica (entrevistas, audio)
alter table sources add column if not exists revisada_por uuid references users(id);
alter table sources add column if not exists revisada_at timestamptz;

-- Afirmaciones: comprobación del hecho (distinta de la confirmación de lo declarado, que ya vive en `estado`) y confianza.
alter table claims add column if not exists comprobacion text check (comprobacion in ('no_comprobado','comprobado_con_dato','comprobado_por_consultor','refutado'));
alter table claims add column if not exists comprobacion_nota text;
alter table claims add column if not exists confianza numeric check (confianza >= 0 and confianza <= 1);
alter table claims add column if not exists vigente_hasta date;               -- cuándo deja de valer (tarifario 2025, contrato a plazo)

-- Hallazgos: impacto potencial ≠ confianza; provisional visible.
alter table findings add column if not exists impacto_potencial text check (impacto_potencial in ('alto','medio','bajo'));
alter table findings add column if not exists confianza numeric check (confianza >= 0 and confianza <= 1);
alter table findings add column if not exists confianza_motivo text;
alter table findings add column if not exists provisional boolean default false;

-- Números: de dónde salió cada cifra y si ya se concilió. `estado` sigue siendo texto libre (sin check en producción):
-- se añade el valor 'extraido' por convención del código (metricas.ts), no por constraint.
alter table company_metricas add column if not exists origen text check (origen in ('declarado','extraido','conciliado','calculado'));
alter table company_metricas add column if not exists conciliado_at timestamptz;
alter table company_metricas add column if not exists conciliado_por uuid references users(id);

comment on column findings.provisional is 'true = se formó con afirmaciones no confirmadas; se muestra con su incertidumbre, no se esconde';
comment on column findings.impacto_potencial is 'qué tan grave sería si es cierto; independiente de cuán seguro es (confianza)';
