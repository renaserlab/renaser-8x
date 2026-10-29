/**
 * QUE 8X NO VUELVA A COBRAR POR LO QUE LA EMPRESA YA TENÍA.
 *
 * La auditoría del 18-10-2026 encontró dos defectos del mismo origen, y los dos se pagan con
 * trabajo duplicado:
 *
 *   1. HABÍA DOS EXPEDIENTES y ninguno sabía del otro. `company_assets` marcaba como «construido»
 *      y confirmado nueve documentos de la primera empresa cliente —funciones, selección, reglamento, organigrama,
 *      evaluación, inducción— que la empresa YA TENÍA en su Drive desde agosto. El sistema
 *      registró como obra propia lo que la clienta había pagado por tener, y produjo encima.
 *
 *   2. EL CONTRATO ERA UNA CONSTANTE CON NOMBRE DE CLIENTE. `CONTRATO_SEMILLA` vivía en el código
 *      y la ruta del expediente la devolvía para cualquier empresa: las cinco de la base veían el
 *      tablero del contrato de la primera empresa cliente.
 *
 * Lo que sostienen estas pruebas: que el estado de un activo se DERIVE de sus documentos en vez de
 * escribirse aparte y contradecirlos; que construir desde cero sea imposible cuando ya hay algo; y
 * que el contrato salga de la base, por empresa.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  estadoDelActivo,
  porQueNoSeConstruye,
  queLeerAntesDeConstruir,
  puedePasar,
  ESTADOS,
  CONTRATO_SEMILLA,
  type DocDelActivo,
} from "@/lib/expediente";
import { CLAVES_VARA } from "@/lib/metodo/varas";
import { BLOQUES_ACTIVOS } from "@/lib/activos";

const RAIZ = path.resolve(__dirname, "..");
const RUTA_EXP = readFileSync(path.join(RAIZ, "src/app/api/companies/[id]/expediente/route.ts"), "utf8");
const RUTA_CONSTRUIR = readFileSync(path.join(RAIZ, "src/app/api/companies/[id]/assets/construir/route.ts"), "utf8");
const MIGRACION = readFileSync(path.join(RAIZ, "supabase/migracion-correcciones-auditoria.sql"), "utf8");
const MIGRACION_INSUMO = readFileSync(path.join(RAIZ, "supabase/migracion-insumo.sql"), "utf8");

const doc = (over: Partial<DocDelActivo> = {}): DocDelActivo => ({
  estado: "recibido",
  origen: "cliente",
  revisado_contra_vara: false,
  ...over,
});

describe("el estado de un activo sale de sus documentos", () => {
  it("sin documentos, no hay nada: se produce desde la plantilla maestra", () => {
    expect(estadoDelActivo([]).estado).toBe("no_hay_nada");
  });

  it("un documento del cliente sin medir es materia prima sin examinar, y se cuenta", () => {
    const r = estadoDelActivo([doc()]);
    expect(r.estado).toBe("lo_tiene_sin_medir");
    expect(r.sin_medir).toBe(1);
  });

  it("medido contra su vara, lo que toca es mejorarlo, no reescribirlo", () => {
    const r = estadoDelActivo([doc({ revisado_contra_vara: true })]);
    expect(r.estado).toBe("lo_tiene_medido");
    expect(r.sin_medir).toBe(0);
  });

  it("lo vigente manda sobre todo lo demás, aunque haya otros sin medir al lado", () => {
    expect(estadoDelActivo([doc(), doc({ estado: "vigente", revisado_contra_vara: true })]).estado).toBe("vigente");
  });

  it("un borrador nuestro sin nada del cliente es una mejora en curso", () => {
    expect(estadoDelActivo([doc({ estado: "borrador", origen: "consultora" })]).estado).toBe("en_mejora");
  });

  it("lo archivado y lo sustituido no cuentan: dejaron de aplicar, pero se conservan", () => {
    expect(estadoDelActivo([doc({ estado: "archivado" }), doc({ estado: "sustituido" })]).estado).toBe("no_hay_nada");
  });

  it("un documento del cliente sin medir pesa más que un borrador nuestro: primero se mira lo que ya existe", () => {
    const r = estadoDelActivo([doc({ estado: "borrador", origen: "consultora" }), doc()]);
    expect(r.estado).toBe("lo_tiene_sin_medir");
  });
});

describe("no se construye desde cero lo que ya existe", () => {
  it("sin nada en el expediente, se construye", () => {
    expect(porQueNoSeConstruye([])).toBeNull();
  });

  // Este es el caso exacto del 18-10-2026: se escribió un Manual de Selección para la primera empresa cliente sin
  // ver que su procedimiento APO-REC-01 ya estaba en su Drive.
  it("con un documento del cliente sin medir, NO se construye, y la razón dice qué hacer en su lugar", () => {
    const r = porQueNoSeConstruye([doc()]);
    expect(r).not.toBeNull();
    expect(r).toMatch(/materia prima/i);
    expect(r, "la razón tiene que decir que se mide primero, no solo que no se puede").toMatch(/se mide/i);
  });

  it("dice cuántos documentos están esperando medición, en plural cuando son varios", () => {
    expect(porQueNoSeConstruye([doc(), doc()])).toMatch(/2 documentos/);
    expect(porQueNoSeConstruye([doc()])).toMatch(/un documento/);
  });

  it("con un documento vigente, NO se construye: se sustituye o se declara sustituido primero", () => {
    const r = porQueNoSeConstruye([doc({ estado: "vigente", revisado_contra_vara: true })]);
    expect(r).toMatch(/VIGENTE/);
    expect(r).toMatch(/sustituirlo|sustituido/i);
  });

  it("con una mejora nuestra ya en curso, NO se construye otra: dos borradores son dos verdades", () => {
    expect(porQueNoSeConstruye([doc({ estado: "borrador", origen: "consultora" })])).toMatch(/en curso/i);
  });

  // La mejora SÍ es trabajo: lo que se prohíbe es partir de cero, no partir del documento medido.
  it("medido contra su vara, sí se construye: la mejora nace de él", () => {
    expect(porQueNoSeConstruye([doc({ revisado_contra_vara: true })])).toBeNull();
  });
});

/**
 * EL INSUMO: lo que la empresa aportó y que no es un entregable.
 *
 * Lo destapó el revisor el 19-10-2026 midiendo la biblioteca del primer cliente: cuatro de los
 * documentos no eran documentos, eran apuntes y la transcripción de una entrevista. Antes de este
 * estado, cada uno de ellos se contaba como un entregable que falló su vara.
 */
describe("un insumo no es un entregable, y no se cuenta como uno", () => {
  const insumo = (over: Partial<DocDelActivo> = {}) => doc({ estado: "insumo", ...over });

  it("un insumo solo no cubre el activo: lo aportado no es lo entregado", () => {
    expect(estadoDelActivo([insumo()]).estado).toBe("no_hay_nada");
  });

  it("y no se cuenta como documento sin medir: ninguna vara lo mide, así que no está esperando a nadie", () => {
    expect(estadoDelActivo([insumo()]).sin_medir).toBe(0);
  });

  it("se cuenta aparte, porque un insumo que no se ve se lee como que no hay nada", () => {
    expect(estadoDelActivo([insumo(), insumo()]).insumos).toBe(2);
    expect(estadoDelActivo([doc()]).insumos).toBe(0);
  });

  it("no bloquea la construcción: lo que impide construir es un entregable, no la materia prima", () => {
    expect(porQueNoSeConstruye([insumo()])).toBeNull();
    expect(porQueNoSeConstruye([insumo(), insumo()])).toBeNull();
  });

  it("pero avisa que hay que leerlo antes, y eso es un aviso, no un bloqueo", () => {
    expect(queLeerAntesDeConstruir([])).toBeNull();
    expect(queLeerAntesDeConstruir([doc()])).toBeNull();
    expect(queLeerAntesDeConstruir([insumo()])).toMatch(/no impide construir/);
    expect(queLeerAntesDeConstruir([insumo(), insumo()])).toMatch(/2 materiales/);
  });

  it("no tapa un documento de verdad: si hay uno vigente, manda el vigente", () => {
    expect(estadoDelActivo([insumo(), doc({ estado: "vigente", revisado_contra_vara: true })]).estado).toBe("vigente");
  });

  it("el cliente no lo ve en su lista de documentos: esa lista es la de lo que rige", () => {
    expect(ESTADOS.insumo.lo_ve_el_cliente).toBe(false);
  });

  it("se llega a insumo desde recibido y desde revisión —ahí es donde se descubre— y nunca desde vigente", () => {
    expect(puedePasar("recibido", "insumo")).toBe(true);
    expect(puedePasar("en_revision", "insumo")).toBe(true);
    expect(puedePasar("vigente", "insumo")).toBe(false);
    expect(puedePasar("aprobado", "insumo")).toBe(false);
  });

  it("de insumo se vuelve a recibido si se marcó mal, pero no se salta a borrador ni a vigente", () => {
    expect(puedePasar("insumo", "recibido")).toBe(true);
    expect(puedePasar("insumo", "archivado")).toBe(true);
    expect(puedePasar("insumo", "borrador")).toBe(false);
    expect(puedePasar("insumo", "vigente")).toBe(false);
  });

  /**
   * EL VOCABULARIO DEL CÓDIGO CONTRA EL DE LA BASE.
   *
   * Son dos listas de las mismas palabras escritas en dos archivos distintos, y nada las ataba. El
   * fallo que esto evita no se ve al escribirlo: alguien agrega un estado a `ESTADOS`, la pantalla
   * lo ofrece, el usuario lo elige y la base lo rechaza con un error de restricción que nadie
   * entiende. Se descubre en producción, con el cliente delante.
   *
   * Se compara contra el check que de verdad rige hoy, el de `migracion-insumo.sql`, que reemplaza
   * entero al que creó la tabla.
   */
  it("cada estado del código está en el check de la base, y cada uno del check está en el código", () => {
    const lista = MIGRACION_INSUMO.match(/check \(estado in \(([^)]+)\)\)/);
    expect(lista, "no se pudo leer la lista de estados del check").not.toBeNull();
    const enLaBase = [...lista![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const enElCodigo = Object.keys(ESTADOS).sort();
    expect(enLaBase, "la base admite estados que el código no conoce, o al revés").toEqual(enElCodigo);
  });

  it("la base admite el estado: sin el check ampliado, el update falla en producción y no aquí", () => {
    expect(MIGRACION_INSUMO).toMatch(/expediente_estado_conocido/);
    expect(MIGRACION_INSUMO).toMatch(/'insumo'/);
    // El check se reemplaza entero, no se le añade un valor: un check no se amplía.
    expect(MIGRACION_INSUMO).toMatch(/drop constraint if exists expediente_estado_conocido/);
  });

  it("la ruta de construir devuelve el aviso junto con el trabajo encolado, no en vez de él", () => {
    expect(RUTA_CONSTRUIR).toMatch(/queLeerAntesDeConstruir/);
    expect(RUTA_CONSTRUIR).toMatch(/leer_antes/);
    // El aviso se calcula después del bloqueo: si no se construye, no hay nada que leer antes.
    expect(RUTA_CONSTRUIR.indexOf("porQueNoSeConstruye")).toBeLessThan(RUTA_CONSTRUIR.indexOf("queLeerAntesDeConstruir"));
  });
});

describe("la ruta de construir consulta el expediente antes de gastar una llamada", () => {
  it("lee los documentos del activo y aplica la guarda", () => {
    expect(RUTA_CONSTRUIR).toMatch(/from\("expediente_documental"\)/);
    expect(RUTA_CONSTRUIR).toMatch(/\.eq\("activo_clave", b\.clave\)/);
    expect(RUTA_CONSTRUIR).toMatch(/porQueNoSeConstruye/);
  });

  it("la guarda corre ANTES de encolar: una llamada de IA gastada no se devuelve", () => {
    expect(RUTA_CONSTRUIR.indexOf("porQueNoSeConstruye")).toBeLessThan(RUTA_CONSTRUIR.indexOf("encolar("));
  });

  it("si el expediente no se puede leer, no se construye a ciegas", () => {
    expect(RUTA_CONSTRUIR).toMatch(/errExp/);
    expect(RUTA_CONSTRUIR).toMatch(/No se pudo leer el expediente/);
  });
});

describe("el contrato es de cada empresa, no una constante con nombre de cliente", () => {
  it("la ruta lee contrato_entregables de ESTA empresa", () => {
    expect(RUTA_EXP).toMatch(/from\("contrato_entregables"\)/);
    expect(RUTA_EXP).toMatch(/\.eq\("company_id", id\)/);
  });

  it("la ruta ya no usa la lista cableada de la primera empresa cliente", () => {
    expect(RUTA_EXP, "mientras la importe, el contrato de una empresa gobierna a las demás").not.toMatch(/CONTRATO_SEMILLA/);
  });

  it("si el contrato no se puede leer, se dice: un tablero vacío se lee como «no falta nada»", () => {
    expect(RUTA_EXP).toMatch(/No se pudo leer el contrato/);
    expect(RUTA_EXP).toMatch(/contrato_cargado/);
  });

  it("la tabla existe en la migración, con una sola fila por entregable y empresa", () => {
    expect(MIGRACION).toMatch(/create table if not exists contrato_entregables/);
    expect(MIGRACION).toMatch(/unique \(company_id, clave\)/);
  });

  it("la semilla de la primera empresa cliente tiene los 16 entregables del contrato, cada uno con su cláusula y una vara real", () => {
    expect(CONTRATO_SEMILLA.length).toBe(16);
    for (const e of CONTRATO_SEMILLA) {
      expect(e.clausula, e.clave).toMatch(/^2\.\d$/);
      expect(CLAVES_VARA, `${e.clave} apunta a la vara ${e.clave_vara}`).toContain(e.clave_vara);
      expect(e.nombre.length, e.clave).toBeGreaterThan(5);
    }
  });

  it("lo que el contrato promete y no es un documento está marcado como lo que es", () => {
    // Una auditoría se entrega con sus hallazgos y una capacitación con su evidencia: exigirles un
    // documento vigente deja el tablero con tres casillas que nunca se van a poder cerrar.
    const noDocumentos = CONTRATO_SEMILLA.filter((e) => e.tipo !== "documento").map((e) => e.clave);
    expect(noDocumentos).toEqual([
      "auditoria_diagnostico",
      "auditoria_interna",
      "capacitacion_general",
      "acompanamiento_induccion",
    ]);
    expect(MIGRACION).toMatch(/contrato_tipo_conocido/);
  });
});

describe("el puente entre los dos expedientes existe de verdad", () => {
  it("un documento puede decir qué activo cubre, y la migración lo indexa", () => {
    expect(MIGRACION).toMatch(/alter table expediente_documental add column if not exists activo_clave/);
    expect(MIGRACION).toMatch(/create index if not exists expediente_por_activo/);
  });

  it("la ruta acepta la clave del activo al registrar un documento", () => {
    expect(RUTA_EXP).toMatch(/activo_clave: z\.string\(\)/);
    expect(RUTA_EXP).toMatch(/activo_clave: b\.activo_clave/);
  });

  it("la ruta devuelve el estado derivado de cada activo, no uno escrito aparte", () => {
    expect(RUTA_EXP).toMatch(/estadoDelActivo/);
    expect(RUTA_EXP).toMatch(/activos,/);
  });

  // Si el puente apunta a claves que no existen, no une nada. Las nueve que la auditoría encontró
  // marcadas como «construido» en la primera empresa cliente son todas del bloque de personas.
  it("las claves que el defecto afectaba existen como activos de verdad", () => {
    const claves = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`)));
    for (const c of [
      "personas.funciones",
      "personas.seleccion",
      "personas.reglamento",
      "personas.organigrama",
      "personas.evaluacion",
      "personas.onboarding",
      "personas.mvv",
      "personas.cultura",
      "personas.plan_personal",
    ]) {
      expect(claves, c).toContain(c);
    }
  });
});

describe("cuando alguien renuncia, el puesto sigue existiendo", () => {
  it("el puesto tiene estado, y nulo es un valor legítimo porque hoy ninguno lo declaró", () => {
    expect(MIGRACION).toMatch(/alter table org_puestos add column if not exists estado text/);
    expect(MIGRACION).toMatch(/estado is null or estado in \('ocupado', 'vacante', 'en_seleccion', 'cobertura_temporal'\)/);
  });

  it("quien cubre es un PUESTO, no una persona: el organigrama tiene que sobrevivir a una renuncia", () => {
    expect(MIGRACION).toMatch(/cubierto_por uuid references org_puestos\(id\)/);
  });

  it("un puesto «cubierto» sin decir por quién no está cubierto: está sin dueño con una etiqueta tranquilizadora", () => {
    expect(MIGRACION).toMatch(/org_puestos_cobertura_con_quien/);
    expect(MIGRACION).toMatch(/estado is distinct from 'cobertura_temporal' or cubierto_por is not null/);
  });

  it("un puesto no se cubre a sí mismo", () => {
    expect(MIGRACION).toMatch(/org_puestos_cobertura_no_circular/);
  });
});

describe("la próxima sesión y su enlace son dos campos a mano", () => {
  // Se construyó un contador de sesiones del contrato y Kelin pidió lo contrario: «el contrato ya
  // se venció… eso yo debería de poder añadirlo a mano, próxima sesión y enlace de reunión».
  it("están en la empresa, no deducidos de un contrato que puede estar vencido", () => {
    expect(MIGRACION).toMatch(/alter table companies add column if not exists proxima_sesion date/);
    expect(MIGRACION).toMatch(/alter table companies add column if not exists enlace_reunion text/);
  });

  it("no vuelve a aparecer un contador de sesiones en el código", () => {
    const expediente = readFileSync(path.join(RAIZ, "src/lib/expediente.ts"), "utf8");
    expect(expediente).not.toMatch(/sesiones_(usadas|restantes|consumidas)|contador_sesiones/);
  });
});
