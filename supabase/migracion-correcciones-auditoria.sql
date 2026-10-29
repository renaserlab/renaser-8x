-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- CORRECCIONES DE LA AUDITORÍA DEL 18-10-2026
--
-- Cuatro huecos encontrados midiendo el producto contra la base de producción, no contra la
-- especificación. Cada bloque dice qué estaba mal y con qué se comprobó.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · EL CONTRATO DE CADA EMPRESA
--
-- Lo que estaba mal: los entregables comprometidos vivían en una constante del código llamada
-- CONTRATO_SEMILLA, y la ruta del expediente la aplicaba a CUALQUIER empresa. Las cinco empresas
-- de la base veían el tablero del contrato de la primera empresa cliente. El requisito es el contrario: cada
-- empresa se rige por SU contrato y su alcance.
--
-- Por qué es una tabla y no una columna jsonb: el tablero se cruza con el expediente por la clave
-- del entregable, y eso tiene que poder consultarse, no desarmarse en memoria cada vez.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists contrato_entregables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- La cláusula del contrato que lo compromete. Es lo que permite decirle al cliente de dónde
  -- sale cada entregable en vez de pedirle que confíe en una lista nuestra.
  clausula text not null,
  clave text not null,
  nombre text not null,
  -- Con qué vara se mide este entregable cuando llegue. Sin vara no se puede medir, así que un
  -- entregable sin vara es un entregable que nadie va a poder revisar.
  clave_vara text not null,
  orden integer not null default 0,
  -- Lo que el contrato promete que NO es un documento: una auditoría, una capacitación, un
  -- acompañamiento. Se entregan con evidencia, no con un archivo, y el tablero no puede
  -- exigirles un documento vigente.
  tipo text not null default 'documento',
  created_at timestamptz not null default now(),
  unique (company_id, clave)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contrato_tipo_conocido') then
    alter table contrato_entregables add constraint contrato_tipo_conocido
      check (tipo in ('documento', 'auditoria', 'capacitacion', 'acompanamiento'));
  end if;
end $$;

create index if not exists contrato_por_empresa on contrato_entregables (company_id, orden);

comment on table contrato_entregables is
  'Lo que el contrato de ESTA empresa compromete, por cláusula. Un contrato que dice «de manera enunciativa mas no limitativa» no tiene techo: esta lista es lo nombrado, no el límite. Sin filas para una empresa, su tablero sale vacío y lo dice — no hereda el de otra.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · EL DOCUMENTO SABE QUÉ PARTE DE LA EMPRESA CUBRE
--
-- Lo que estaba mal: había DOS expedientes y ninguno sabía del otro. `company_assets` (41 filas en
-- producción) marcaba como «construido» nueve documentos de la primera empresa cliente —funciones, selección,
-- reglamento, organigrama, evaluación, inducción— que la empresa YA TENÍA en su Drive desde
-- agosto. `expediente_documental` tenía los estados y las varas, y cero filas. El sistema
-- registró como obra propia lo que la clienta ya había pagado por tener.
--
-- Esta columna es el puente: un documento del expediente declara qué activo de la empresa cubre
-- (`personas.funciones`, `procesos.politicas`…), y así el estado del activo se puede DERIVAR del
-- expediente en vez de escribirse por separado y contradecirlo.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table expediente_documental add column if not exists activo_clave text;

comment on column expediente_documental.activo_clave is
  'Qué activo de la empresa cubre este documento (clave de BLOQUES_ACTIVOS, p. ej. personas.funciones). De aquí sale el estado del activo: si el cliente ya tiene un documento vigente que lo cubre, el activo NO se vuelve a construir desde cero.';

create index if not exists expediente_por_activo on expediente_documental (company_id, activo_clave);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 3 · EL PUESTO TIENE ESTADO, Y LA COBERTURA TIENE DUEÑO
--
-- Lo que estaba mal: los 15 puestos de la primera empresa cliente no tenían dónde decir que estaban vacantes, y
-- `respaldo` estaba vacío en los 15 — en una empresa donde renunciaron dos personas este año y
-- una sede opera con una sola persona. Cuando alguien renuncia, el puesto sigue existiendo: lo
-- que cambia es su estado, y hay procesos que quedan sin dueño ese mismo día.
--
-- `cubierto_por` apunta a un PUESTO, no a una persona: es la misma regla que ya cumple el resto
-- de la tabla (los 15 puestos tienen `persona` vacía a propósito). Un organigrama hecho de
-- nombres se cae cada vez que alguien se va.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table org_puestos add column if not exists estado text;
alter table org_puestos add column if not exists cubierto_por uuid references org_puestos(id) on delete set null;
alter table org_puestos add column if not exists estado_desde date;

do $$
begin
  -- Nulo es un valor legítimo y es el de hoy: de los 17 puestos de la base, ninguno declaró su
  -- estado. Poner 'ocupado' por defecto habría inventado que los dos vacantes están cubiertos.
  if not exists (select 1 from pg_constraint where conname = 'org_puestos_estado_conocido') then
    alter table org_puestos add constraint org_puestos_estado_conocido
      check (estado is null or estado in ('ocupado', 'vacante', 'en_seleccion', 'cobertura_temporal'));
  end if;

  -- Un puesto «cubierto temporalmente» sin decir por qué puesto no está cubierto: está sin dueño
  -- con una etiqueta tranquilizadora, que es peor que estar vacante a la vista.
  if not exists (select 1 from pg_constraint where conname = 'org_puestos_cobertura_con_quien') then
    alter table org_puestos add constraint org_puestos_cobertura_con_quien
      check (estado is distinct from 'cobertura_temporal' or cubierto_por is not null);
  end if;

  -- Un puesto no se cubre a sí mismo.
  if not exists (select 1 from pg_constraint where conname = 'org_puestos_cobertura_no_circular') then
    alter table org_puestos add constraint org_puestos_cobertura_no_circular
      check (cubierto_por is null or cubierto_por <> id);
  end if;
end $$;

comment on column org_puestos.estado is
  'Estado del PUESTO, no de la persona: ocupado, vacante, en_seleccion o cobertura_temporal. Nulo significa que todavía nadie lo declaró, y eso se dice así en pantalla en vez de suponer que está ocupado.';
comment on column org_puestos.cubierto_por is
  'Qué OTRO PUESTO cubre a este mientras esté vacante o en cobertura temporal. Es un puesto y no una persona, por la misma razón que el resto de la tabla: el organigrama tiene que sobrevivir a una renuncia.';
comment on column org_puestos.estado_desde is
  'Desde cuándo está en ese estado. Sin fecha, una vacante de tres días y una de tres meses se ven igual.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 4 · LA PRÓXIMA SESIÓN Y SU ENLACE, A MANO
--
-- Lo que estaba mal: se había construido un contador de sesiones del contrato, y lo que la
-- consultora pidió fue lo contrario — «el contrato ya se venció… eso yo debería de poder añadirlo
-- a mano, próxima sesión y enlace de reunión». Dos campos que ella escribe, no un número que el
-- sistema deduce.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table companies add column if not exists proxima_sesion date;
alter table companies add column if not exists enlace_reunion text;

comment on column companies.proxima_sesion is
  'La fecha de la próxima sesión con esta empresa, escrita a mano por la consultora. No se deduce del contrato: hay empresas sin contrato vigente y sesiones que se mueven.';
comment on column companies.enlace_reunion is
  'El enlace de la reunión, escrito a mano. Vive aquí para que esté donde está la empresa y no en la agenda de una sola persona.';


-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 5 · ADMINISTRADOR DE 8X: UNA AUTORIDAD MÁS
--
-- Lo que falta: 8X pasa a tener más de una consultora, y cada una trabaja su cartera —su entorno—.
-- Quien ADMINISTRA la casa necesita dos cosas que una consultora de cartera no tiene: ver cualquier
-- empresa, esté asignada a quien esté, y ver el registro de quién cambió qué. Eso es `ver_todo`.
--
-- El check de users.autoridad se amplía con ese valor. Ampliar un check no toca una sola fila: lo
-- que antes se admitía se sigue admitiendo. Y nadie gana la autoridad por esta migración — se da
-- persona por persona, que es lo que la hace significar algo.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'users_autoridad_conocida') then
    alter table users drop constraint users_autoridad_conocida;
  end if;
  alter table users add constraint users_autoridad_conocida
    check (autoridad <@ array['aprobar_plan', 'aprobar_hallazgo', 'cerrar_medicion', 'administrar', 'ver_todo', 'ninguna']::text[]);
end $$;

comment on column users.autoridad is
  'Qué puede comprometer esta persona con una aprobación. Vocabulario en src/lib/autoridad.ts. Vacío = las de su rol; «ninguna» = ninguna, a propósito. «ver_todo» es quien administra 8X: ve todas las empresas y el registro de modificaciones.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table contrato_entregables enable row level security;

-- Sin políticas: se accede por la API con service_role. El contrato es materia de la consultora;
-- el cliente ve el resultado (su documentación vigente), no el tablero de lo que falta.
