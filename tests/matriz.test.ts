/**
 * LA MATRIZ YA ESCUCHA AL MODELO OPERATIVO (R9.2), Y SIN MODELO DICE EXACTAMENTE LO DE ANTES.
 *
 * Hasta el 13-10-2026 `matrizDe` recorría los rasgos del perfil y nunca `p.modelos`: el sistema sabía que
 * Modas Lucero es una tienda y que Vargas es un estudio (rules/matrices.ts · clasificarModelo) y aun así
 * les pedía los mismos procesos, salvo por sus rasgos. Aquí se prueba que el modelo agrega lo suyo y que
 * un perfil sin modelo recibe lo mismo que recibía.
 *
 * La no regresión se prueba contra LITERALES: las listas de abajo se sacaron ejecutando el matriz.ts del
 * commit 607cfda (el anterior al cambio) sobre estos mismos perfiles. Comparar la función consigo misma
 * no probaría nada. Los perfiles de los pilotos salen de tests/fixtures/pilotos/declaraciones.json: son
 * empresas ficticias y lo que se prueba es software.
 *
 * Al final, la lectura del organigrama (R9.1): vive en este archivo porque tests/organigrama.test.ts no
 * es de este encargo. Es la misma entrega —personas, procesos y producto— y no se quiso dejar sin prueba.
 */
import { describe, it, expect } from "vitest";
import declaraciones from "./fixtures/pilotos/declaraciones.json";
import { perfilDe, RASGOS, type Perfil } from "@/lib/perfil";
import { matrizDe, piezasDelModelo, CLAVES_MODELO, MODELOS_CLASIFICABLES } from "@/lib/matriz";
import { BLOQUES_ACTIVOS } from "@/lib/activos";
import { CATEGORIA } from "@/lib/pcf";
import { lecturaOrganigrama, lecturaDePersonas, compararConObjetivo, objetivoDelEstudio, PUESTOS_TOLERADOS_POR_PERSONA, type Puesto } from "@/lib/rules/organigrama";

const perfil = (extra: Partial<Perfil> = {}): Perfil => ({ rasgos: [], modelos: [], personas: null, sedes: null, sinDatos: [], ...extra });

/** El perfil de un piloto, leído de lo que su dueño declaró en la entrada breve. Nada más. */
const perfilDePiloto = (p: { sector: string; personas: number; entrada_breve: Record<string, unknown> }): Perfil =>
  perfilDe({ ficha: { personas: String(p.personas) }, sector: p.sector, textos: Object.values(p.entrada_breve).filter((v): v is string => typeof v === "string") });

const LUCERO = perfilDePiloto(declaraciones.modas_lucero);
const VARGAS = perfilDePiloto(declaraciones.estudio_vargas);

const procesos = (p: Perfil) => matrizDe(p).procesos.map((x) => [x.nombre, x.prioridad, x.disparado_por]);
const documentos = (p: Perfil) => matrizDe(p).documentos.map((x) => [x.clave, x.prioridad, x.disparado_por]);

describe("el modelo operativo agrega lo que ningún rasgo pide", () => {
  it("un perfil con modelos [\"retail\"] recibe procesos que sin modelo no aparecen", () => {
    const sin = new Set(matrizDe(perfil()).procesos.map((p) => p.nombre));
    const nuevos = matrizDe(perfil({ modelos: ["retail"] })).procesos.filter((p) => !sin.has(p.nombre));
    expect(nuevos.map((p) => [p.nombre, p.disparado_por])).toEqual([
      ["Cómo se fija el precio y se decide una oferta", "modelo:retail"],
      ["Cómo se repone lo que falta en el estante", "modelo:retail"],
      ["Qué se hace con lo que no rota", "modelo:retail"],
    ]);
    // Y lo que ya estaba sigue estando: el modelo suma, no reemplaza.
    for (const nombre of sin) expect(matrizDe(perfil({ modelos: ["retail"] })).procesos.map((p) => p.nombre)).toContain(nombre);
  });

  it("también agrega documentos, y dice que los pidió el modelo y no un rasgo", () => {
    const docs = matrizDe(perfil({ modelos: ["retail"] })).documentos.filter((d) => d.disparado_por === "modelo:retail");
    expect(docs.map((d) => [d.clave, d.prioridad])).toEqual([
      ["producto.catalogo", 1],
      ["resultados.margen", 1],
      ["procesos.indicadores", 2],
    ]);
  });

  it("si un rasgo y el modelo piden el mismo documento, gana la prioridad más alta", () => {
    // El rasgo «inventario» pide el catálogo como «después» (2); en una tienda es «ahora» (1).
    const soloRasgo = matrizDe(perfil({ rasgos: [RASGOS.inventario] })).documentos.find((d) => d.clave === "producto.catalogo");
    const conModelo = matrizDe(perfil({ rasgos: [RASGOS.inventario], modelos: ["retail"] })).documentos.find((d) => d.clave === "producto.catalogo");
    expect(soloRasgo).toMatchObject({ prioridad: 2, disparado_por: "inventario" });
    expect(conModelo).toMatchObject({ prioridad: 1, disparado_por: "modelo:retail" });
    expect(matrizDe(perfil({ rasgos: [RASGOS.inventario], modelos: ["retail"] })).documentos.filter((d) => d.clave === "producto.catalogo")).toHaveLength(1);
  });

  it("dos modelos a la vez suman los dos catálogos sin repetir filas", () => {
    const m = matrizDe(perfil({ modelos: ["retail", "restaurante"] }));
    const nombres = m.procesos.map((p) => p.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
    expect(nombres).toContain("Qué se hace con lo que no rota");
    expect(nombres).toContain("Cómo se toma el pedido y llega a cocina");
    expect(new Set(m.documentos.map((d) => d.clave)).size).toBe(m.documentos.length);
  });

  it("un modelo que no existe no agrega nada ni rompe: la matriz queda como sin modelo", () => {
    expect(piezasDelModelo("franquicia")).toBeNull();
    expect(matrizDe(perfil({ modelos: ["franquicia"] }))).toEqual(matrizDe(perfil()));
  });

  it("lo que falta averiguar no cambia con el modelo: sale de los rasgos sin dato", () => {
    const sinDatos = [RASGOS.efectivo, RASGOS.credito];
    expect(matrizDe(perfil({ sinDatos, modelos: ["retail"] })).porAveriguar).toEqual(matrizDe(perfil({ sinDatos })).porAveriguar);
  });
});

describe("sin modelo, la matriz es exactamente la de antes (literales del commit 607cfda)", () => {
  it("perfil vacío: la base de toda empresa, y nada más", () => {
    expect(procesos(perfil())).toEqual([
      ["Cómo llega un cliente nuevo", 1, "base"],
      ["Cómo se atiende a un cliente", 1, "base"],
      ["Cómo se entrega lo que se vendió", 1, "base"],
      ["Cómo se cobra", 1, "base"],
      ["Qué pasa cuando algo sale mal", 2, "base"],
    ]);
    expect(documentos(perfil())).toEqual([
      ["procesos.mapa_procesos", 1, "base"],
      ["procesos.incidencias", 1, "base"],
      ["personas.funciones", 1, "base"],
      ["marketing.cliente_ideal", 2, "base"],
      ["producto.reclamos", 2, "base"],
      ["direccion.plan_empresarial", 2, "base"],
    ]);
  });

  it("los rasgos de Modas Lucero sin su modelo: diez procesos y dieciséis documentos, los mismos de antes", () => {
    const sinModelo = { ...LUCERO, modelos: [] };
    expect(LUCERO.rasgos.map((r) => r.clave)).toEqual(["equipo", "inventario", "canales_digitales", "atencion_publico"]);
    expect(procesos(sinModelo)).toEqual([
      ["Cómo llega un cliente nuevo", 1, "base"],
      ["Cómo se atiende a un cliente", 1, "base"],
      ["Cómo se entrega lo que se vendió", 1, "base"],
      ["Cómo se cobra", 1, "base"],
      ["Cómo se compra y se abastece", 1, "inventario"],
      ["Recepción de mercadería", 1, "inventario"],
      ["Cómo se atiende por WhatsApp o redes", 1, "canales_digitales"],
      ["Qué pasa cuando algo sale mal", 2, "base"],
      ["Cómo se contrata e induce a alguien nuevo", 2, "equipo"],
      ["Control de stock y mermas", 2, "inventario"],
    ]);
    expect(documentos(sinModelo)).toEqual([
      ["procesos.mapa_procesos", 1, "base"],
      ["procesos.incidencias", 1, "base"],
      ["personas.funciones", 1, "base"],
      ["personas.organigrama", 1, "equipo"],
      ["personas.cultura", 1, "atencion_publico"],
      ["procesos.controles", 1, "inventario"],
      ["marketing.proceso_comercial", 1, "canales_digitales"],
      ["marketing.cliente_ideal", 2, "base"],
      ["producto.reclamos", 2, "base"],
      ["direccion.plan_empresarial", 2, "base"],
      ["personas.onboarding", 2, "equipo"],
      ["personas.disciplina", 2, "equipo"],
      ["personas.habilidades", 2, "equipo"],
      ["producto.catalogo", 2, "inventario"],
      ["marketing.canales", 2, "canales_digitales"],
      ["producto.calidad", 2, "atencion_publico"],
    ]);
  });

  it("sin modelo ninguna pieza dice venir de un modelo, con todos los rasgos a la vez", () => {
    const todo = matrizDe(perfil({ rasgos: Object.values(RASGOS) }));
    expect(todo.procesos).toHaveLength(30);
    expect(todo.documentos).toHaveLength(27);
    for (const p of [...todo.procesos, ...todo.documentos]) expect(String(p.disparado_por)).not.toMatch(/^modelo:/);
  });
});

describe("los dos pilotos reciben los procesos de su oficio", () => {
  it("Modas Lucero se clasifica como tienda y recibe los tres procesos de una tienda", () => {
    expect(LUCERO.modelos).toEqual(["retail"]);
    const sin = new Set(matrizDe({ ...LUCERO, modelos: [] }).procesos.map((p) => p.nombre));
    expect(matrizDe(LUCERO).procesos.filter((p) => !sin.has(p.nombre)).map((p) => p.nombre)).toEqual([
      "Cómo se fija el precio y se decide una oferta",
      "Cómo se repone lo que falta en el estante",
      "Qué se hace con lo que no rota",
    ]);
    // Su dueña declaró stock parado de la temporada pasada: ese proceso ya no depende de que alguien se acuerde.
    expect(declaraciones.modas_lucero.entrada_breve.recursos_desaprovechados).toMatch(/stock parado/);
  });

  it("Estudio Vargas se clasifica como servicio profesional y recibe plazos, alcance, horas y cobro final", () => {
    expect(VARGAS.modelos).toEqual(["profesional"]);
    const sin = new Set(matrizDe({ ...VARGAS, modelos: [] }).procesos.map((p) => p.nombre));
    expect(matrizDe(VARGAS).procesos.filter((p) => !sin.has(p.nombre)).map((p) => p.nombre).sort()).toEqual(
      [
        "Cómo se abre un caso y se define su alcance",
        "Cómo se cobra la parte final del honorario",
        "Cómo se controlan plazos y vencimientos",
        "Cómo se registran las horas por caso",
      ].sort()
    );
    // Lo que el socio declaró —dos plazos vencidos, la segunda mitad sin cobrar, horas que nadie anota— tiene ahora su proceso.
    expect(declaraciones.estudio_vargas.entrada_breve.principal_problema).toMatch(/se nos han pasado dos plazos/);
    expect(declaraciones.estudio_vargas.entrada_breve.deuda_clientes).toMatch(/segunda mitad/);
  });

  it("una tienda y un estudio ya no reciben lo mismo por el modelo: ningún proceso de modelo se comparte", () => {
    const deModelo = (p: Perfil) => matrizDe(p).procesos.filter((x) => String(x.disparado_por).startsWith("modelo:")).map((x) => x.nombre);
    expect(deModelo(LUCERO).filter((n) => deModelo(VARGAS).includes(n))).toEqual([]);
  });
});

describe("el catálogo por modelo no nombra lo que no existe ni repite lo que ya hay", () => {
  const claves = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`)));

  it("cada modelo que el sistema clasifica tiene catálogo, y no hay catálogo de un modelo que no se clasifica", () => {
    expect([...CLAVES_MODELO].sort()).toEqual([...MODELOS_CLASIFICABLES].sort());
    for (const m of MODELOS_CLASIFICABLES) {
      const piezas = piezasDelModelo(m);
      expect(piezas, m).not.toBeNull();
      expect(piezas!.procesos.length, `${m} sin procesos`).toBeGreaterThanOrEqual(3);
      expect(piezas!.docs.length, `${m} sin documentos`).toBeGreaterThanOrEqual(2);
    }
  });

  it("todo documento que pide un modelo existe en el inventario: ninguno se descarta en silencio", () => {
    for (const m of CLAVES_MODELO) for (const [clave] of piezasDelModelo(m)!.docs) expect(claves.has(clave), `${m} pide «${clave}», que no existe`).toBe(true);
  });

  it("ningún proceso de modelo se llama igual que uno de la base, de un rasgo o de otro modelo", () => {
    const yaHay = new Set(matrizDe(perfil({ rasgos: Object.values(RASGOS) })).procesos.map((p) => p.nombre));
    const vistos = new Map<string, string>();
    for (const m of CLAVES_MODELO) {
      for (const [nombre] of piezasDelModelo(m)!.procesos) {
        expect(yaHay.has(nombre), `«${nombre}» (${m}) repite un proceso de la base o de un rasgo`).toBe(false);
        expect(vistos.get(nombre), `«${nombre}» está en ${vistos.get(nombre)} y en ${m}`).toBeUndefined();
        vistos.set(nombre, m);
      }
    }
  });

  it("cada pieza trae su porqué y su lugar en el mapa, y habla como el dueño", () => {
    for (const m of CLAVES_MODELO) {
      const piezas = piezasDelModelo(m)!;
      for (const [nombre, prioridad, porque, categoria] of piezas.procesos) {
        expect([1, 2, 3], nombre).toContain(prioridad);
        expect(porque.length, `${nombre}: sin porqué`).toBeGreaterThan(25);
        expect(CATEGORIA.has(categoria), `${nombre}: categoría «${categoria}» no existe`).toBe(true);
        expect(`${nombre} ${porque}`, nombre).not.toMatch(/\b(SKU|KPI|pilar|claim|matriz|driver|stakeholder|margen de contribución)\b/i);
      }
      for (const [clave, , porque] of piezas.docs) expect(porque.length, `${clave}: sin porqué`).toBeGreaterThan(25);
    }
  });
});

// ─────────────────────── Personas (R9.1): la lectura del organigrama ───────────────────────

const puesto = (id: string, nombre: string, extra: Partial<Puesto> = {}): Puesto => ({
  id, nombre, mision: `misión de ${nombre}`, decide: `decisión de ${nombre}`, persona: `Persona de ${nombre}`, respaldo: "Alguien", reporta_a: null, ...extra,
});

describe("personas · lo que la estructura deja ver, como listas y no como veredicto", () => {
  // Los cuatro puestos de Modas Lucero según su Word de funciones (README de los pilotos): la gerente
  // y Rosa fijan precios; Jorge tiene las funciones «por definir». Las personas son ficticias.
  const lucero: Puesto[] = [
    puesto("g", "Gerente", { persona: "Lucero", decide: "Fija precios" }),
    puesto("r", "Encargada de tienda", { persona: "Rosa", reporta_a: "g", decide: "fija  PRECIOS" }),
    puesto("c", "Vendedora", { persona: "Carmen", reporta_a: "r" }),
    puesto("j", "Apoyo de almacén", { persona: "", reporta_a: "r", mision: "", decide: "" }),
  ];

  it("vacíos: el puesto sin persona aparece con a quién reporta; los ocupados no", () => {
    const { vacios } = lecturaOrganigrama(lucero);
    expect(vacios).toHaveLength(1);
    expect(vacios[0]).toMatchObject({ id: "j", puesto: "Apoyo de almacén", reporta_a: "Encargada de tienda" });
    expect(vacios[0].detalle).toContain("no tiene quién lo ocupe");
  });

  it("duplicidades: dos puestos con la misma decisión, aunque esté escrita distinto; lo vacío no cuenta como igual", () => {
    const { duplicidades } = lecturaOrganigrama(lucero);
    expect(duplicidades).toHaveLength(1);
    expect(duplicidades[0]).toMatchObject({ campo: "decide", puestos: ["Gerente", "Encargada de tienda"] });
    expect(duplicidades[0].detalle).toContain("la frontera entre ellos no está escrita");
    // Dos puestos sin misión no «comparten» misión: la falta de dato no es una coincidencia.
    const dosVacios = lecturaOrganigrama([puesto("a", "A", { mision: "" }), puesto("b", "B", { mision: " " })]);
    expect(dosVacios.duplicidades.filter((d) => d.campo === "mision")).toEqual([]);
  });

  it("sobrecarga: una persona con más puestos de los tolerados, y el tope se puede cambiar", () => {
    const tres = [puesto("a", "Compras", { persona: "Lucero" }), puesto("b", "Caja", { persona: "lucero " }), puesto("c", "Precios", { persona: "LUCERO" }), puesto("d", "Ventas", { persona: "Rosa" })];
    const lectura = lecturaOrganigrama(tres);
    expect(PUESTOS_TOLERADOS_POR_PERSONA).toBe(2);
    expect(lectura.sobrecarga).toHaveLength(1);
    expect(lectura.sobrecarga[0]).toMatchObject({ persona: "Lucero", cuantos: 3, puestos: ["Compras", "Caja", "Precios"] });
    expect(lecturaOrganigrama(tres, { toleradosPorPersona: 3 }).sobrecarga).toEqual([]);
    expect(lecturaOrganigrama(tres.slice(0, 2)).sobrecarga).toEqual([]); // dos sombreros se toleran
  });

  it("una estructura sin puestos no produce nada, y la misma entrada da siempre la misma lectura", () => {
    expect(lecturaOrganigrama([])).toEqual({ vacios: [], duplicidades: [], sobrecarga: [], tolerados_por_persona: 2 });
    expect(lecturaOrganigrama(lucero)).toEqual(lecturaOrganigrama(lucero));
  });
});

describe("personas · la estructura de hoy frente a la del estudio guardado, sin cambiar org_puestos", () => {
  const hoy: Puesto[] = [puesto("g", "Gerente"), puesto("r", "Encargada de tienda"), puesto("c", "Vendedora")];
  // La forma de org_estudio.contenido (schemas · SalidaEstudioOrganigrama), con lo mínimo que se lee.
  const estudio = {
    opcion_a: { nombre: "Tienda con encargada", puestos: [{ nombre: "gerente", cuando: "ahora" }, { nombre: "Encargada de Tienda", cuando: "ahora" }, { nombre: "Responsable de compras", cuando: "tres_meses" }, { nombre: "Encargada de la segunda tienda", cuando: "al_crecer" }] },
    opcion_b: { nombre: "Tienda con la dueña al frente", puestos: [{ nombre: "Gerente", cuando: "ahora" }, { nombre: "Cajera", cuando: "ahora" }] },
    recomendacion: { opcion: "a", por_que: "…" },
  };

  it("toma la opción recomendada del estudio, o la que se pida", () => {
    const a = objetivoDelEstudio(estudio);
    expect(a).toMatchObject({ opcion: "a", nombre: "Tienda con encargada" });
    expect(a!.rotulo).toContain("la recomendada");
    expect(a!.puestos).toHaveLength(4);
    const b = objetivoDelEstudio(estudio, "b");
    expect(b).toMatchObject({ opcion: "b", nombre: "Tienda con la dueña al frente" });
    expect(b!.rotulo).not.toContain("la recomendada");
  });

  it("sin estudio, o con uno que no tiene la forma esperada, no hay objetivo: null, no un invento", () => {
    for (const malo of [null, undefined, "texto", {}, { recomendacion: { opcion: "c" } }, { recomendacion: { opcion: "a" } }, { recomendacion: { opcion: "a" }, opcion_a: { puestos: [] } }, { recomendacion: { opcion: "a" }, opcion_a: { puestos: [{ nombre: " " }] } }]) {
      expect(objetivoDelEstudio(malo)).toBeNull();
    }
  });

  it("compara por nombre sin mayúsculas ni tildes: qué coincide, qué hay solo hoy y qué falta, en orden de cuándo", () => {
    const objetivo = objetivoDelEstudio(estudio)!;
    const r = compararConObjetivo(hoy, objetivo.puestos, objetivo.rotulo);
    expect(r.coinciden).toEqual(["Gerente", "Encargada de tienda"]);
    expect(r.solo_hoy).toEqual(["Vendedora"]);
    expect(r.solo_objetivo.map((p) => p.nombre)).toEqual(["Responsable de compras", "Encargada de la segunda tienda"]);
    expect(r.transicion).toEqual([
      { cuando: "tres_meses", rotulo: "En tres meses", puestos: ["Responsable de compras"] },
      { cuando: "al_crecer", rotulo: "Cuando la empresa crezca", puestos: ["Encargada de la segunda tienda"] },
    ]);
    // No afirma lo que la base no sabe: qué opción se adoptó no está guardado en ninguna tabla.
    expect(r.nota).toContain("No consta en la base qué opción se adoptó");
    expect(r.nota).toContain("Tienda con encargada");
  });

  it("un puesto del objetivo sin fecha dicha va al final, rotulado, no escondido", () => {
    const r = compararConObjetivo(hoy, [{ nombre: "Contador externo" }, { nombre: "Cajera", cuando: "ahora" }]);
    expect(r.transicion).toEqual([
      { cuando: "ahora", rotulo: "Ahora", puestos: ["Cajera"] },
      { cuando: "sin_fecha", rotulo: "Sin fecha dicha", puestos: ["Contador externo"] },
    ]);
  });
});

describe("personas · la lectura lista para mostrar: lo que la página del organigrama pinta, en una llamada", () => {
  const lucero: Puesto[] = [
    puesto("g", "Gerente", { persona: "Lucero", decide: "Fija precios" }),
    puesto("r", "Encargada de tienda", { persona: "Rosa", reporta_a: "g", decide: "fija  PRECIOS" }),
    puesto("c", "Vendedora", { persona: "Carmen", reporta_a: "r" }),
    puesto("j", "Apoyo de almacén", { persona: "", reporta_a: "r", mision: "", decide: "" }),
  ];
  const estudio = {
    opcion_a: { nombre: "Tienda con encargada", puestos: [{ nombre: "gerente", cuando: "ahora" }, { nombre: "Encargada de Tienda", cuando: "ahora" }, { nombre: "Responsable de compras", cuando: "tres_meses" }] },
    opcion_b: { nombre: "Tienda con la dueña al frente", puestos: [{ nombre: "Gerente", cuando: "ahora" }, { nombre: "Cajera", cuando: "ahora" }] },
    recomendacion: { opcion: "a", por_que: "…" },
  };

  it("tres secciones en orden, con una frase por hallazgo; la que no tiene nada lo dice en vez de quedar en blanco", () => {
    const r = lecturaDePersonas(lucero, null);
    expect(r.hay_puestos).toBe(true);
    expect(r.secciones.map((s) => [s.clave, s.titulo, s.items.length])).toEqual([
      ["vacios", "Puestos sin quién los ocupe", 1],
      ["duplicidades", "La misma función escrita en dos puestos", 1],
      ["sobrecarga", "Personas con más de 2 puestos", 0],
    ]);
    expect(r.secciones[0].items[0]).toContain("«Apoyo de almacén» no tiene quién lo ocupe (reporta a Encargada de tienda)");
    expect(r.secciones[1].items[0]).toContain("Gerente y Encargada de tienda declaran la misma decisión");
    expect(r.secciones[2].sin_nada).toBe("Nadie ocupa más de 2 puestos.");
    // Son las mismas frases que da lecturaOrganigrama: aquí solo se ordenan para pintarlas.
    const base = lecturaOrganigrama(lucero);
    expect(r.secciones[0].items).toEqual(base.vacios.map((v) => v.detalle));
    expect(r.secciones[1].items).toEqual(base.duplicidades.map((d) => d.detalle));
  });

  it("el tope de puestos por persona se puede cambiar, y el título lo dice", () => {
    const tres = [puesto("a", "Compras", { persona: "Lucero" }), puesto("b", "Caja", { persona: "lucero " }), puesto("c", "Precios", { persona: "LUCERO" })];
    expect(lecturaDePersonas(tres, null).secciones[2]).toMatchObject({ titulo: "Personas con más de 2 puestos", items: [expect.stringContaining("Lucero ocupa 3 puestos")] });
    expect(lecturaDePersonas(tres, null, { toleradosPorPersona: 3 }).secciones[2]).toMatchObject({ titulo: "Personas con más de 3 puestos", items: [], sin_nada: "Nadie ocupa más de 3 puestos." });
  });

  it("sin puestos no afirma que todo esté cubierto: no hay secciones", () => {
    const r = lecturaDePersonas([], estudio);
    expect(r.hay_puestos).toBe(false);
    expect(r.secciones).toEqual([]);
    // El estudio sí existe: todo lo que propone está por crear.
    expect(r.objetivo!.solo_objetivo.map((p) => p.nombre)).toEqual(["gerente", "Encargada de Tienda", "Responsable de compras"]);
  });

  it("sin estudio guardado no hay estructura objetivo: lo dice y dice cómo se genera, no inventa una", () => {
    for (const sinEstudio of [null, undefined, {}, { recomendacion: { opcion: "a" } }]) {
      const r = lecturaDePersonas(lucero, sinEstudio);
      expect(r.objetivo).toBeNull();
      expect(r.sin_objetivo).toBe("No hay un estudio guardado con una opción recomendada: no hay estructura objetivo con la que comparar la de hoy. Se genera con el botón «Generar el estudio».");
    }
  });

  it("con estudio: hoy frente a la opción recomendada, o la que se pida, con la transición en orden y la nota de lo que la base no sabe", () => {
    const r = lecturaDePersonas(lucero, estudio);
    expect(r.sin_objetivo).toBeNull();
    expect(r.objetivo).toMatchObject({
      nombre: "Tienda con encargada",
      coinciden: ["Gerente", "Encargada de tienda"],
      solo_hoy: ["Vendedora", "Apoyo de almacén"],
      transicion: [{ cuando: "tres_meses", rotulo: "En tres meses", puestos: ["Responsable de compras"] }],
    });
    expect(r.objetivo!.rotulo).toContain("la recomendada");
    expect(r.objetivo!.nota).toContain("No consta en la base qué opción se adoptó");
    const b = lecturaDePersonas(lucero, estudio, { opcion: "b" });
    expect(b.objetivo).toMatchObject({ nombre: "Tienda con la dueña al frente", coinciden: ["Gerente"], transicion: [{ cuando: "ahora", rotulo: "Ahora", puestos: ["Cajera"] }] });
    expect(b.objetivo!.rotulo).not.toContain("la recomendada");
    // No toca lo que recibe: org_puestos se lee, no se cambia.
    expect(lucero.map((p) => p.nombre)).toEqual(["Gerente", "Encargada de tienda", "Vendedora", "Apoyo de almacén"]);
  });
});
