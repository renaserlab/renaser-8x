/**
 * ARMA EL SQL DE DATOS DEL PRIMER CLIENTE DEL 18-10-2026.
 *
 * Esto NO es una migración de esquema: no crea ni cambia una tabla. Son los datos que convierten el
 * expediente documental de cero filas en el expediente real de una empresa, más dos correcciones de
 * filas que ya existen. Se pega aparte, DESPUÉS de supabase/migracion-correcciones-auditoria.sql,
 * porque necesita la columna `activo_clave` y la tabla `contrato_entregables` que esa migración crea.
 *
 * QUÉ HACE Y POR QUÉ CADA COSA:
 *
 *   1. SIEMBRA EL CONTRATO de esta empresa: sus 16 entregables, por cláusula, con la vara con que se
 *      mide cada uno. Hasta hoy esa lista era una constante del código y la ruta la devolvía para
 *      cualquier empresa; ahora sale de la base, y sembrarla es lo que hace que el tablero de ESTA
 *      empresa diga la verdad y el de las otras cuatro salga vacío diciendo que está vacío.
 *
 *   2. REGISTRA SU MOF en el expediente, con su texto completo, declarado VIGENTE. Es su documento
 *      de gobierno de hoy: lo aprobó la Gerencia General el 28/05/2026 y así está firmado en cada
 *      una de sus seis fichas. Queda vigente aunque falle su vara, y las dos cosas son verdad a la
 *      vez: rige hoy, y está medido como no entregable. Eso es justamente lo que justifica la
 *      versión 04 en vez de un documento nuevo desde cero.
 *
 *   3. GUARDA SU REVISIÓN: los 16 veredictos con evidencia, tal como salieron de medirlo contra la
 *      vara. Sin esto el documento no se puede declarar vigente (`queLeFaltaParaVigencia` lo exige)
 *      y la pantalla del cliente no tendría qué mostrar.
 *
 *   4. SACA EL NOMBRE PROPIO del título de una decisión abierta: llevaba el nombre de quien ocupaba
 *      el puesto, esa persona ya no está, y la decisión sigue siendo la misma. Se trabaja con puestos.
 *
 *   5. ABRE LA DECISIÓN DE CONFIRMAR LA LÍNEA DE MANDO. Ojo con lo que NO dice: la estructura no
 *      está vacía. 14 de los 15 puestos tienen jefatura registrada —solo la Gerencia General no la
 *      tiene, que es lo correcto— y cada fila cita a la dueña: el 29-08-2026 declaró al
 *      administrador y sus reportes directos. Lo que está abierto es que esa declaración nombraba
 *      PERSONAS y dos de ellas ya salieron, así que la estructura por PUESTOS nunca se confirmó por
 *      escrito. Este script NO escribe ni cambia una sola jefatura: eso lo decide la Gerencia.
 *
 * NO BORRA NI VACÍA NADA. Las 12 filas de `company_assets` se quedan como están: son el registro
 * honesto de lo que RENASER construyó. Lo que cambia es que ahora el expediente dice que la empresa
 * YA TENÍA su manual de funciones, y el estado del activo se deriva de ahí — así que el sistema deja
 * de poder construirlo desde cero.
 *
 * Uso: node --import=tsx scripts/produccion/armar-datos-cliente.ts > el-archivo.sql
 */
import { readFileSync, existsSync } from "fs";
import { CONTRATO_SEMILLA } from "../../src/lib/expediente";

/**
 * LA IDENTIDAD DEL CLIENTE VIVE FUERA DEL REPOSITORIO. Este repositorio es público: el nombre de la
 * empresa, su RUC, los identificadores de su base y el nombre de quien firma no entran aquí. Se leen
 * de clientes/8x-produccion/identidad-primer-cliente.json, que está en .gitignore. Si ese archivo no
 * está, el script se detiene diciéndolo: generar SQL de producción con datos inventados es peor que
 * no generarlo.
 */
type Identidad = {
  company_id: string;
  gerencia_user_id: string;
  gerencia_puesto: string;
  decision_caja_id: string;
  /** Los nombres de persona que no pueden quedar en un título. Viven fuera del repositorio. */
  nombres_que_no_pueden_aparecer: string[];
  documento: { nombre: string; version: string; aprobado_el: string; entregable: string; activo_clave: string; clave_vara: string };
  /** Dónde está el texto del documento y su revisión, en el cuaderno de trabajo. */
  archivos: { documento: string; revision: string };
};

const RUTA_IDENTIDAD = "clientes/8x-produccion/identidad-primer-cliente.json";
if (!existsSync(RUTA_IDENTIDAD)) {
  throw new Error(`Falta ${RUTA_IDENTIDAD}. La identidad del cliente no vive en el repositorio porque es público: sin ese archivo no se arma el SQL.`);
}
const I = JSON.parse(readFileSync(RUTA_IDENTIDAD, "utf8")) as Identidad;
const EMPRESA = I.company_id;
const GERENCIA = I.gerencia_user_id;
const DECISION_CAJA = I.decision_caja_id;
const DOC = I.documento;

const SC = `${process.env.TEMP}/claude/C--Users-Usuario-Desktop-RenaserConsulting/32e6e0d5-86e6-428c-b96f-0eda8d2f9c90/scratchpad`;

function leer(archivo: string): string {
  const p = `${SC}/${archivo}`;
  if (!existsSync(p)) {
    // Sin el texto del MOF no se escribe el bloque: un documento vigente sin contenido no se puede
    // medir después, y dejaría a la consultora con una casilla que no se puede destrabar.
    throw new Error(`Falta ${p}. Sin el texto del documento no se escribe su bloque: un documento vigente sin contenido no se puede volver a medir.`);
  }
  return readFileSync(p, "utf8");
}

const documento = leer(I.archivos.documento);
const revision = JSON.parse(leer(I.archivos.revision)) as {
  veredicto: string;
  verdictos: { cumple: string }[];
};
const cumple = revision.verdictos.filter((v) => v.cumple === "si").length;

/** Texto entre comillas de dólar: el MOF trae comillas, acentos y saltos de línea. */
const dolar = (s: string, etiqueta: string) => `$${etiqueta}$${s}$${etiqueta}$`;

const L: string[] = [];
const p = (s = "") => L.push(s);

p("-- " + "═".repeat(98));
p("-- DATOS DEL PRIMER CLIENTE · 18-10-2026");
p("--");
p("-- CÓMO SE USA: pegar TODO este archivo en Supabase → SQL Editor → Run, DESPUÉS de haber aplicado");
p("-- supabase/migracion-correcciones-auditoria.sql (necesita la tabla contrato_entregables y la");
p("-- columna expediente_documental.activo_clave que esa migración crea).");
p("--");
p("-- QUÉ HACE: siembra los 16 entregables del contrato de esta empresa; registra su Manual de");
p("-- Organización y Funciones en el expediente, con su texto");
p("-- completo y declarado VIGENTE porque lo aprobó la Gerencia General y es su documento de gobierno");
p(`-- de hoy; guarda su revisión contra la vara (${cumple} de ${revision.verdictos.length} exigencias, veredicto ${revision.veredicto});`);
p("-- saca un nombre propio del título de una decisión abierta; y abre la decisión de la línea de");
p("-- mando, que la Gerencia nunca declaró.");
p("--");
p("-- NO BORRA NI VACÍA NINGUNA TABLA. Las 12 filas de company_assets se quedan intactas.");
p("-- Se puede ejecutar dos veces sin daño: todo va por clave única o por condición.");
p("-- " + "═".repeat(98));
p();
p("begin;");
p();
p("set local lock_timeout = '5s';");
p("set local statement_timeout = '120s';");
p();

// ── 1 · El contrato ───────────────────────────────────────────────────────────────────────────
p("-- " + "─".repeat(98));
p("-- 1 · LOS 16 ENTREGABLES DEL CONTRATO DE EMPRESA HOME, POR CLÁUSULA");
p("--");
p("-- El contrato dice «de manera enunciativa mas no limitativa»: esta lista es lo nombrado, no el");
p("-- techo. Los cuatro que no son documentos (dos auditorías, la capacitación y el acompañamiento)");
p("-- van marcados como lo que son: se entregan con evidencia, no con un archivo, y el tablero no");
p("-- puede exigirles un documento vigente que nunca va a existir.");
p("-- " + "─".repeat(98));
p("insert into contrato_entregables (company_id, clausula, clave, nombre, clave_vara, tipo, orden) values");
p(
  CONTRATO_SEMILLA.map(
    (e) =>
      `  ('${EMPRESA}', '${e.clausula}', '${e.clave}', ${dolar(e.nombre, "n")}, '${e.clave_vara}', '${e.tipo}', ${e.orden})`
  ).join(",\n")
);
p("on conflict (company_id, clave) do nothing;");
p();

// ── 2 y 3 · El MOF y su revisión ──────────────────────────────────────────────────────────────
p("-- " + "─".repeat(98));
p("-- 2 · SU MANUAL DE ORGANIZACIÓN Y FUNCIONES, EN EL EXPEDIENTE Y VIGENTE");
p("--");
p("-- Seis fichas de puesto, 113 funciones. Lo elaboró RENASER");
p("-- (Coordinación de RR.HH.) y lo aprobó la Gerencia General de esta empresa: así está firmado al pie");
p("-- de cada ficha. Por eso entra como origen `cliente` —es el documento que la empresa tiene— y");
p("-- queda VIGENTE: es lo que rige su forma de trabajar hoy.");
p("--");
p("-- Cubre el activo `personas.funciones`. Esa es la línea que impide que el sistema vuelva a");
p("-- construir un manual de funciones desde cero para esta empresa: con un documento vigente que");
p("-- cubre el activo, la ruta de construir se niega y dice que lo que corresponde es sustituirlo");
p("-- con una versión mejorada, que nace de él.");
p("-- " + "─".repeat(98));
p("insert into expediente_documental");
p("  (company_id, nombre, clave_vara, entregable, activo_clave, origen, estado, version,");
p("   aprobado_por, aprobado_at, vigente_desde, contenido, nota_consultora)");
p("select");
p(`  '${EMPRESA}',`);
p(`  ${dolar(DOC.nombre, "nom")},`);
p(`  '${DOC.clave_vara}',`);
p(`  '${DOC.entregable}',`);
p(`  '${DOC.activo_clave}',`);
p("  'cliente',");
p("  'vigente',");
p(`  '${DOC.version}',`);
p(`  '${GERENCIA}',`);
p(`  '${DOC.aprobado_el}T00:00:00Z',`);
p(`  '${DOC.aprobado_el}',`);
p(`  ${dolar(documento, "doc")},`);
p(
  `  ${dolar(
    `Aprobado por ${I.gerencia_puesto} el ${DOC.aprobado_el}, firmado al pie de las seis fichas. ` +
      `Medido contra la vara de RENASER el 18/10/2026: cumple ${cumple} de ${revision.verdictos.length} exigencias, ` +
      `veredicto ${revision.veredicto}. Rige hoy Y está medido como deficiente: las dos cosas son verdad, y es lo ` +
      `que justifica una versión 04 en vez de un documento nuevo.`,
    "nota"
  )}`
);
p("where not exists (");
p("  select 1 from expediente_documental");
p(`  where company_id = '${EMPRESA}' and entregable = '${DOC.entregable}' and version = '${DOC.version}'`);
p(");");
p();
p("-- " + "─".repeat(98));
p("-- 3 · SU REVISIÓN CONTRA LA VARA: UN VEREDICTO POR CADA EXIGENCIA, CON SU EVIDENCIA");
p("--");
p("-- Sin esta fila el documento no se puede declarar vigente: queLeFaltaParaVigencia() exige que");
p("-- haya pasado por su vara, porque lo que el cliente entrega es materia prima y declararlo");
p("-- oficial sin medirlo es archivarlo tal cual.");
p("-- " + "─".repeat(98));
p("insert into revision_documental (company_id, documento_id, clave_vara, contenido, veredicto, exigencias_total, exigencias_cumple)");
p("select");
p(`  '${EMPRESA}', d.id, '${DOC.clave_vara}', ${dolar(JSON.stringify(revision), "rev")}::jsonb,`);
p(`  '${revision.veredicto}', ${revision.verdictos.length}, ${cumple}`);
p("from expediente_documental d");
p(`where d.company_id = '${EMPRESA}' and d.entregable = '${DOC.entregable}' and d.version = '${DOC.version}'`);
p("  and not exists (select 1 from revision_documental r where r.documento_id = d.id);");
p();

// ── 4 · El nombre propio fuera del título ─────────────────────────────────────────────────────
p("-- " + "─".repeat(98));
p("-- 4 · FUERA EL NOMBRE PROPIO DEL TÍTULO DE UNA DECISIÓN ABIERTA");
p("--");
p("-- Llevaba el nombre de la persona que ocupaba el puesto. Esa persona ya no está en la empresa, y");
p("-- antes de ella estaba otra, y la decisión es exactamente la misma:");
p("-- es del puesto, no de quien lo ocupe. Se trabaja con puestos.");
p("-- " + "─".repeat(98));
p("update decisiones");
p("set titulo = 'Caja principal y el Administrador(a) General: ¿quién mueve el dinero y quién lo revisa?',");
p("    updated_at = now()");
p(`where id = '${DECISION_CAJA}' and company_id = '${EMPRESA}'`);
p(`  and (${I.nombres_que_no_pueden_aparecer.map((n) => `titulo like '%${n}%'`).join(" or ")});`);
p();

// ── 5 · La línea de mando, como pregunta abierta ──────────────────────────────────────────────
p("-- " + "─".repeat(98));
p("-- " + "─".repeat(98));
p("-- 5 · LA LÍNEA DE MANDO: CONFIRMARLA, QUE ES OTRA COSA QUE DECLARARLA");
p("--");
p("-- Lo que hay: 14 de los 15 puestos tienen jefatura registrada (solo la Gerencia General no la");
p("-- tiene, y eso es lo correcto), y el motivo de cada fila cita a la dueña — el 29-08-2026 declaró");
p("-- al administrador y sus reportes directos. La estructura NO está vacía y este archivo no le toca");
p("-- una sola jefatura.");
p("--");
p("-- Lo que falta: esa declaración nombraba PERSONAS, y dos de las que nombró ya salieron de la");
p("-- empresa. Una estructura registrada a partir de nombres que cambiaron no es una estructura");
p("-- confirmada, y es justo la diferencia entre la decisión y la vigencia: alguien lo dijo una vez,");
p("-- y nadie ha dicho desde cuándo rige por puestos. Eso se pregunta, no se deduce.");
p("-- " + "─".repeat(98));
p("insert into decisiones (company_id, titulo, por_que_ahora, faltantes, recomendacion, recomendacion_por_que, estado, origen, requiere_aprobacion)");
p("select");
p(`  '${EMPRESA}',`);
p("  'Línea de mando: confirmar la estructura por puestos, no por personas',");
p(
  `  ${dolar(
    "La estructura existe: 14 de los 15 puestos tienen jefatura registrada, y cada una cita lo que la Gerencia declaró " +
      "el 29-08-2026, cuando nombró al administrador y a sus reportes directos. El problema es que esa declaración " +
      "nombraba PERSONAS, y dos de las nombradas ya salieron de la empresa: el puesto de administrador cambió de titular " +
      "dos veces desde entonces y hoy está vacante. Una estructura levantada de nombres que cambiaron no está confirmada, " +
      "y mientras no lo esté el organigrama no se puede entregar como vigente ni la revisión del manual de funciones puede " +
      "comprobar su exigencia de proporción entre una ficha y la de su jefe.",
    "pq"
  )},`
);
p(
  `  ${dolar(
    JSON.stringify([
      "Si la estructura registrada sigue siendo la que la Gerencia quiere, puesto por puesto.",
      "Qué cambia ahora que el puesto de administrador está vacante: quién recibe mientras tanto lo que le reportaba.",
      "De quién dependen los encargados de tienda y el área virtual, dicho por puesto y no por nombre.",
      "De quién depende el personal de seguridad, y si eso cambia cuando trasladan efectivo.",
      "Desde cuándo rige la estructura confirmada: la fecha de vigencia, que es distinta del día en que se aprueba.",
    ]),
    "f"
  )}::jsonb,`
);
p(
  `  ${dolar(
    "Leerle la estructura que ya está registrada, puesto por puesto, y pedirle que confirme o corrija cada línea. No " +
      "se parte de cero —eso sería volver a preguntarle lo que ya contestó el 29-08— y tampoco se da por confirmada: " +
      "se lee y se firma. Lo que se pregunta por puesto, no por persona: el nombre de quien lo ocupa va aparte.",
    "r"
  )},`
);
p(
  `  ${dolar(
    "El organigrama es de la empresa, no nuestro. Volver a preguntar lo que ya está registrado es exactamente la queja " +
      "que originó el expediente; darlo por confirmado sin firma es entregar como vigente algo que nadie aprobó. La " +
      "salida es la misma en los dos casos: leerle lo que hay.",
    "rp"
  )},`
);
p("  'pendiente',");
p("  'consultora',");  // El check de la tabla admite 'agente' | 'consultora'. La escribe la consultora.
p("  true");
p("where not exists (");
p(`  select 1 from decisiones where company_id = '${EMPRESA}' and titulo like 'Línea de mando:%'`);
p(");");
p();
p("commit;");
p();
p("-- " + "─".repeat(98));
p("-- COMPROBACIÓN: lo que quedó.");
p("-- " + "─".repeat(98));
p("select");
p("  'DATOS DEL CLIENTE APLICADOS' as resultado,");
p(`  (select count(*) from contrato_entregables where company_id = '${EMPRESA}') as entregables_del_contrato_de_16,`);
p(`  (select count(*) from expediente_documental where company_id = '${EMPRESA}') as documentos_en_el_expediente,`);
p(`  (select count(*) from expediente_documental where company_id = '${EMPRESA}' and estado = 'vigente') as vigentes,`);
p(`  (select count(*) from revision_documental where company_id = '${EMPRESA}') as revisiones,`);
p(`  (select count(*) from decisiones where company_id = '${EMPRESA}' and (${I.nombres_que_no_pueden_aparecer.map((n) => `titulo like '%${n}%'`).join(" or ")})) as decisiones_con_nombre_propio_debe_ser_0,`);
p(`  (select count(*) from decisiones where company_id = '${EMPRESA}' and estado = 'pendiente') as decisiones_pendientes,`);
p("  now() as cuando;");

process.stdout.write(L.join("\n") + "\n");
