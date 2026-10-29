-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 18-10-2026 · DESHACER migracion-correcciones-auditoria.sql SIN PERDER NADA
--
-- Qué hace, en una sola transacción:
--   · RENOMBRA contrato_entregables, con todas sus filas, a contrato_entregables_retirada, y renombra con el
--     sufijo _retirada su clave primaria, su única y su índice con nombre. Sin eso, volver a aplicar la
--     migración haría `create index if not exists contrato_por_empresa` contra un nombre que sigue vivo en
--     la tabla retirada: no lo crearía, no diría nada, y la tabla nueva quedaría sin su índice;
--   · quita las tres restricciones que la migración añadió a org_puestos (estado conocido, cobertura con
--     quién, cobertura no circular). Son solo reglas: quitarlas no borra una fila;
--   · quita la restricción de tipo de contrato_entregables_retirada, por la misma razón que los índices: su
--     nombre tiene que quedar libre para volver a aplicar la migración.
--
-- Qué NO hace: no borra ninguna fila y no quita NINGUNA COLUMNA. Las seis columnas nuevas
-- (expediente_documental.activo_clave; org_puestos.estado, cubierto_por y estado_desde;
-- companies.proxima_sesion y enlace_reunion) SE QUEDAN. Quitarlas borraría lo que ya se hubiera escrito en
-- ellas, y el código anterior no las nota: son nulas para él. Una columna de más no rompe nada; una columna
-- menos pierde datos.
--
-- Después: el código de antes funciona igual. La ruta del expediente vuelve a quedarse sin tablero de
-- contrato para las empresas que no lo tengan — y eso se verá como un tablero vacío que lo dice, no como el
-- contrato de otra empresa, que era justo el defecto que la migración vino a corregir.
-- ════════════════════════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  -- Las reglas de org_puestos: se quitan por nombre y solo si están.
  if exists (select 1 from pg_constraint where conname = 'org_puestos_estado_conocido') then
    alter table org_puestos drop constraint org_puestos_estado_conocido;
  end if;
  if exists (select 1 from pg_constraint where conname = 'org_puestos_cobertura_con_quien') then
    alter table org_puestos drop constraint org_puestos_cobertura_con_quien;
  end if;
  if exists (select 1 from pg_constraint where conname = 'org_puestos_cobertura_no_circular') then
    alter table org_puestos drop constraint org_puestos_cobertura_no_circular;
  end if;
end $$;

do $$
begin
  if to_regclass('public.contrato_entregables') is not null then
    -- Primero la restricción con nombre: tiene que quedar libre para volver a aplicar la migración.
    if exists (select 1 from pg_constraint where conname = 'contrato_tipo_conocido') then
      alter table contrato_entregables drop constraint contrato_tipo_conocido;
    end if;

    -- Los índices con nombre, incluidos los que sostienen la clave primaria y la única.
    if to_regclass('public.contrato_por_empresa') is not null then
      alter index contrato_por_empresa rename to contrato_por_empresa_retirada;
    end if;
    if to_regclass('public.contrato_entregables_pkey') is not null then
      alter index contrato_entregables_pkey rename to contrato_entregables_pkey_retirada;
    end if;
    if to_regclass('public.contrato_entregables_company_id_clave_key') is not null then
      alter index contrato_entregables_company_id_clave_key rename to contrato_entregables_company_id_clave_key_retirada;
    end if;

    -- Y la tabla al final, con sus filas intactas.
    alter table contrato_entregables rename to contrato_entregables_retirada;
  end if;
end $$;

commit;

-- Lo retirado conserva su RLS y sigue sin políticas: solo lo lee el servidor.
-- Para reincorporar las filas después de volver a aplicar la migración:
--   insert into contrato_entregables (company_id, clausula, clave, nombre, clave_vara, orden, tipo)
--   select company_id, clausula, clave, nombre, clave_vara, orden, tipo from contrato_entregables_retirada;
