import { describe, it, expect } from "vitest";
import { BLOQUES, bloquesSinCubrir, puedeCerrarSesion, bancoComoTexto } from "@/lib/rules/cobertura";
import { levantamientoCompleto, cabeEnUnDia, diagnosticoListo } from "@/lib/rules/suficiencia";
import { validarArchivo, nombreSeguro, rutaStorage } from "@/lib/archivos";
import { fuerzaFuente, calibrarImpacto } from "@/lib/rules/evidencia";
import { SalidaContrastador, SalidaMinero, SalidaDiagnosticador, NodoSalida } from "@/lib/schemas";
import { verificarDocumento } from "@/lib/jobs/handlers/plan";
import { avisosDeFlujo } from "@/lib/jobs/handlers/procesos";
import { csvComoTexto, segmentoDe, trocear } from "@/lib/jobs/handlers/extraer";
import { PATRONES, DIMENSIONES } from "@/lib/rules/patrones";

describe("1.1 / 1.4 · cobertura de entrevistas (P1-02, P1-03)", () => {
  it("el sueño del dueño tiene los 7 bloques (con lo-que-ya-intentó) y preguntas por episodio, no por concepto", () => {
    const claves = BLOQUES.sueno_dueno.map((b) => b.clave);
    expect(claves).toEqual(["origen", "historia_intentos", "empresa_deseada", "vida_deseada", "rol", "exito", "verdad_dificil"]);
    const todas = BLOQUES.sueno_dueno.flatMap((b) => b.preguntas).join(" ");
    for (const frag of ["día que decidiste", "Con qué empezaste", "qué se cumplió", "qué pasó con cada intento", "Qué te frenó", "estuvo mejor que hoy", "todo sale bien", "NO quieres que crezca", "martes normal", "Cuántas horas", "fuera del negocio", "más te gusta hacer", "ya te cansó", "nadie más puede", "te sentiste orgulloso", "Cuánto es suficiente", "dejar construido", "debe cambiar", "postergando", "más miedo soltar", "nadie te juzgara"]) expect(todas).toContain(frag);
  });
  it("la entrevista al personal cubre las 15 investigaciones y las 4 preguntas de verdad operativa", () => {
    const todas = BLOQUES.personal.flatMap((b) => b.preguntas).join(" ").toLowerCase();
    for (const frag of ["cómo haces realmente", "salga de tu trabajo", "lo hiciste bien", "pierdes más tiempo", "esperando", "repites o rehaces", "información te falta", "consultarle al jefe", "aceptan como normal", "whatsapp o sistema paralelo", "escuchas de los clientes", "eliminarías", "conservarías", "dirección no ve", "procedimiento dice una cosa", "cuando hay urgencia", "jefe no está", "resuelve de verdad"]) expect(todas).toContain(frag);
  });
  it("una sesión no se cierra con bloques sin cubrir; se cierra cuando todos tienen al menos una respuesta", () => {
    expect(puedeCerrarSesion("sueno_dueno", [{ bloque: "origen" }])).toBe(false);
    expect(bloquesSinCubrir("sueno_dueno", [{ bloque: "origen" }]).map((b) => b.clave)).toEqual(["historia_intentos", "empresa_deseada", "vida_deseada", "rol", "exito", "verdad_dificil"]);
    const todos = BLOQUES.sueno_dueno.map((b) => ({ bloque: b.clave }));
    expect(puedeCerrarSesion("sueno_dueno", todos)).toBe(true);
  });
  it("las sesiones de validación pueden cerrarse sin bloques", () => {
    expect(puedeCerrarSesion("validacion", [])).toBe(true);
  });
  it("el banco se serializa con la clave exacta que el modelo debe devolver", () => {
    expect(bancoComoTexto("personal")).toMatch(/^\[trabajo_real\] Trabajo real:/);
  });
});

describe("7.9 / 13 / 15 · suficiencia (P1-04)", () => {
  const claims = (n: number, extra: Partial<{ tipo: string; estado: string; pilar: string }> = {}) => Array.from({ length: n }, () => ({ tipo: "proceso", estado: "confirmado", pilar: "procesos", participant_id: null, ...extra }));
  const sesionesOk = [{ tipo: "sueno_dueno", estado: "completa", rol: "dueno" }, { tipo: "empresa_dueno", estado: "completa", rol: "dueno" }, { tipo: "personal", estado: "completa", rol: "empleado" }];
  it("completo: sin críticas pendientes, dueño entrevistado, equipo entrevistado, 5+ confirmadas por pilar", () => {
    const cs = [...claims(5, { pilar: "personas", tipo: "rol" }), ...claims(5, { pilar: "procesos" }), ...claims(5, { pilar: "producto", tipo: "producto" }), ...claims(5, { pilar: "marketing", tipo: "canal" })];
    const s = levantamientoCompleto(cs, sesionesOk);
    expect(s.completo, s.motivos.join("; ")).toBe(true);
  });
  it("una afirmación crítica (precio) sin verificar bloquea", () => {
    const cs = [...claims(5, { pilar: "personas" }), ...claims(5), ...claims(5, { pilar: "producto" }), ...claims(5, { pilar: "marketing" }), { tipo: "precio", estado: "sin_verificar", pilar: "producto", participant_id: null }];
    const s = levantamientoCompleto(cs, sesionesOk);
    expect(s.completo).toBe(false);
    expect(s.criticas_pendientes).toBe(1);
  });
  it("empresa de un solo dueño (sin sesiones de equipo): la versión del dueño basta — se valida con casos, no con entrevistas que no existen", () => {
    const cs = [...claims(5, { pilar: "personas" }), ...claims(5), ...claims(5, { pilar: "producto" }), ...claims(5, { pilar: "marketing" })];
    const s = levantamientoCompleto(cs, sesionesOk.slice(0, 2));
    expect(s.completo).toBe(true);
  });
  it("si existen sesiones de equipo pero ninguna está completa, sigue faltando el equipo", () => {
    const cs = [...claims(5, { pilar: "personas" }), ...claims(5), ...claims(5, { pilar: "producto" }), ...claims(5, { pilar: "marketing" })];
    const s = levantamientoCompleto(cs, [...sesionesOk.slice(0, 2), { tipo: "personal", estado: "pendiente", rol: "empleado" }]);
    expect(s.completo).toBe(false);
    expect(s.motivos.join()).toMatch(/equipo/);
  });
  it("un pilar con < 5 confirmadas queda como desconocido y bloquea", () => {
    const s = levantamientoCompleto([...claims(5, { pilar: "personas" }), ...claims(5), ...claims(2, { pilar: "producto" }), ...claims(5, { pilar: "marketing" })], sesionesOk);
    expect(s.pilares_desconocidos).toEqual(["producto"]);
  });
  it("modo intensivo condicionado: 250 personas no cabe en un día; 14 personas con bloque agendado sí", () => {
    expect(cabeEnUnDia({ personas: 250, sedes: 4, fuentes: 80, procesos_estimados: 60, bloque_agendado: true }).cabe).toBe(false);
    expect(cabeEnUnDia({ personas: 14, sedes: 1, fuentes: 9, procesos_estimados: 5, bloque_agendado: true }).cabe).toBe(true);
    expect(cabeEnUnDia({ personas: 14, sedes: 1, fuentes: 9, procesos_estimados: 5, bloque_agendado: false }).motivos[0]).toMatch(/bloque/);
  });
  it("El Espejo solo con hallazgos revisados y sin validación pendiente", () => {
    expect(diagnosticoListo([{ estado_revision: "aprobado", requiere_validacion: false }]).listo).toBe(true);
    expect(diagnosticoListo([{ estado_revision: "aprobado", requiere_validacion: true }]).listo).toBe(false);
    expect(diagnosticoListo([{ estado_revision: "pendiente" }]).listo).toBe(false);
    expect(diagnosticoListo([]).listo).toBe(false);
  });
});

describe("14.2 · archivos", () => {
  it("acepta PDF, foto, CSV, texto, audio; rechaza Word y Excel con mensaje útil; rechaza desconocidos", () => {
    expect(validarArchivo({ nombre: "plan.pdf", mime: "application/pdf", bytes: 1000 })).toMatchObject({ ok: true, tipo: "documento" });
    expect(validarArchivo({ nombre: "cuaderno.jpg", mime: "image/jpeg", bytes: 1000 })).toMatchObject({ ok: true, tipo: "foto" });
    expect(validarArchivo({ nombre: "ventas.csv", mime: "text/csv", bytes: 1000 })).toMatchObject({ ok: true, tipo: "dato" });
    expect(validarArchivo({ nombre: "nota.ogg", mime: "application/octet-stream", bytes: 1000 })).toMatchObject({ ok: true, tipo: "audio", mime: "audio/ogg" });
    expect((validarArchivo({ nombre: "manual.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 10 }) as { error: string }).error).toMatch(/Word/);
    expect((validarArchivo({ nombre: "x.exe", mime: "application/x-msdownload", bytes: 10 }) as { ok: boolean }).ok).toBe(false);
    expect((validarArchivo({ nombre: "x.html", mime: "text/html", bytes: 10 }) as { ok: boolean }).ok).toBe(false);
  });
  it("tamaño: vacío y > 30 MB se rechazan", () => {
    expect((validarArchivo({ nombre: "a.pdf", mime: "application/pdf", bytes: 0 }) as { ok: boolean }).ok).toBe(false);
    expect((validarArchivo({ nombre: "a.pdf", mime: "application/pdf", bytes: 31 * 1024 * 1024 }) as { ok: boolean }).ok).toBe(false);
  });
  it("extensión que no coincide con el MIME se rechaza (pdf declarado como imagen)", () => {
    expect((validarArchivo({ nombre: "a.pdf", mime: "image/png", bytes: 10 }) as { ok: boolean }).ok).toBe(false);
  });
  it("nombres con rutas o caracteres raros se sanean; la ruta siempre cuelga de la empresa", () => {
    expect(nombreSeguro("../../etc/passwd")).toBe("etc_passwd".replace("etc_passwd", "passwd"));
    expect(nombreSeguro("C:\\Users\\x\\plan 2023 (final).pdf")).toBe("plan_2023_final_.pdf");
    expect(rutaStorage("123e4567-e89b-12d3-a456-426614174000", "../x.pdf", 1)).toBe("123e4567-e89b-12d3-a456-426614174000/1-x.pdf");
    expect(() => rutaStorage("../otra", "x.pdf")).toThrow();
  });
});

describe("1.11 · fuerza de evidencia", () => {
  it("dato = strong; documento = medium; entrevista de líder = medium; entrevista de empleado = weak; nota del cliente = weak; observación del consultor = strong", () => {
    expect(fuerzaFuente({ source_tipo: "dato" })).toBe("strong");
    expect(fuerzaFuente({ source_tipo: "documento" })).toBe("medium");
    expect(fuerzaFuente({ source_tipo: "entrevista", participant_rol: "lider" })).toBe("medium");
    expect(fuerzaFuente({ source_tipo: "entrevista", participant_rol: "empleado" })).toBe("weak");
    expect(fuerzaFuente({ source_tipo: "observacion", source_origen: "cliente" })).toBe("weak");
    expect(fuerzaFuente({ source_tipo: "observacion", source_origen: "consultor" })).toBe("strong");
  });
  it("una sola observación directa del consultor sostiene un hallazgo alto", () => {
    expect(calibrarImpacto("alto", [{ id: "a", source_id: "s", participant_id: null, estado: "confirmado", source_tipo: "observacion", source_origen: "consultor" }], true).impacto).toBe("alto");
  });
  it("la calibración reporta fuerza máxima y número de fuentes independientes", () => {
    const c = calibrarImpacto("alto", [{ id: "a", source_id: "s", participant_id: "p1", estado: "confirmado", source_tipo: "entrevista", participant_rol: "empleado" }, { id: "b", source_id: "s", participant_id: "p2", estado: "confirmado", source_tipo: "entrevista", participant_rol: "empleado" }], true);
    expect(c.fuentes).toBe(2);
    expect(c.fuerza_maxima).toBe("weak");
    expect(c.impacto).toBe("alto"); // dos personas independientes bastan (capítulo 11)
  });
});

describe("1.12 · relaciones entre afirmaciones", () => {
  it("el contrastador devuelve el tipo de relación; valores desconocidos caen a 'ninguna'", () => {
    expect(SalidaContrastador.parse({ se_contradicen: false, relacion: "updates", explicacion: "", cual_parece_vigente: "b", pregunta_sugerida: null }).relacion).toBe("updates");
    expect(SalidaContrastador.parse({ se_contradicen: false, relacion: "similar", explicacion: "", cual_parece_vigente: null, pregunta_sugerida: null }).relacion).toBe("ninguna");
  });
});

describe("1.5 · know-how con los campos mínimos", () => {
  it("criticidad, documentado, criterio_experto y proceso existen en la salida del minero", () => {
    const u = SalidaMinero.parse({ unidades: [{ situacion: "s", senal: null, decision: null, excepcion: null, estandar: null, error_frecuente: null, regla_practica: null, escalamiento: null, criterio_experto: "x", proceso: "compras", criticidad: "alta", documentado: false, destino: "sop" }] }).unidades[0];
    expect(u.criticidad).toBe("alta");
    expect(u.documentado).toBe(false);
    expect(u.proceso).toBe("compras");
  });
});

describe("1.13 · nodos con los campos pedidos", () => {
  it("el nodo admite rol, espera, entrada, salida, evidencia, estándar", () => {
    const n = NodoSalida.parse({ id: "n1", tipo: "actividad", etiqueta: "x", rol: "ventas", espera: null, entrada: "pedido", salida: "factura", evidencia: "foto", estandar: "sin error" });
    expect(n.entrada).toBe("pedido");
  });
  it("avisosDeFlujo marca decisión con una salida, proceso sin final malo y remove con dependientes", () => {
    const { avisos, porNodo } = avisosDeFlujo({ nombre: "x", nodos: [{ id: "a", tipo: "inicio", etiqueta: "e" }, { id: "d", tipo: "decision", etiqueta: "¿?" }, { id: "r", tipo: "actividad", etiqueta: "r", veredicto: "remove" }, { id: "f", tipo: "fin", etiqueta: "Listo" }], conexiones: [{ de: "a", a: "d" }, { de: "d", a: "r", etiqueta: "sí" }, { de: "r", a: "f" }] });
    expect(porNodo.get("d")?.join()).toMatch(/salida/);
    expect(porNodo.get("r")?.join()).toMatch(/dependen/);
    expect(avisos.join()).toMatch(/final malo/);
  });
});

describe("1.8 · filtros con sub-preguntas", () => {
  it("el esquema acepta respuestas por sub-pregunta y preserva/dimension", () => {
    const h = SalidaDiagnosticador.parse({ hallazgos: [{ titulo: "t", patron: null, causa_raiz: "c", impacto: "medio", veredicto: "keep", recomendacion: null, claim_ids: ["a"], filtros: { proposito: { resultado: "pasa", nota: "", respuestas: ["no", "no", "no"] }, sabiduria: { resultado: "pasa", nota: "" }, excelencia: { resultado: "pasa", nota: "" } }, preserva: true, dimension: "calidad" }], preguntas_pendientes: [{ texto: "¿?", para: "datos" }], dimensiones_sin_evidencia: ["sucesión"] });
    expect(h.hallazgos[0].preserva).toBe(true);
    expect(h.preguntas_pendientes[0].para).toBe("datos");
  });
});

describe("P1-18 · documentos: ninguna sección sin fuente; ningún referente", () => {
  it("descarta secciones sin fuentes y reemplaza nombres de referentes", () => {
    const v = verificarDocumento({ titulo: "t", secciones: [{ titulo: "a", parrafos: ["Como dice Hormozi, el canal es único."], fuentes: ["Plan 2022"] }, { titulo: "b", parrafos: ["sin fuente"], fuentes: [] }] });
    expect(v.descartadas).toBe(1);
    expect(v.doc.secciones).toHaveLength(1);
    expect(v.doc.secciones[0].parrafos[0]).not.toMatch(/Hormozi/);
  });
});

describe("1.10 · evidencia exacta por formato", () => {
  it("CSV → filas numeradas con nombre de columna, en tramos de 400", () => {
    const c = csvComoTexto("cliente;origen;reclamo\nA;referido;si\nB;web;no");
    expect(c.filas).toBe(2);
    expect(c.tramos[0]).toContain("fila 2: cliente=A | origen=referido | reclamo=si");
  });
  it("audio → el fragmento se ubica en su segmento con inicio y fin", () => {
    const s = segmentoDe("cuando la palta tiene esta pequeña textura", [{ desde: 0, hasta: 9, texto: "Hola, soy Rosa." }, { desde: 180, hasta: 196, texto: "Cuando la palta tiene esta pequeña textura, en dos días está perfecta." }]);
    expect(s?.desde).toBe(180);
  });
  it("troceo de texto por palabras", () => {
    expect(trocear("a ".repeat(20000), 8000)).toHaveLength(3);
  });
});

describe("patrones y dimensiones (1.1, 1.7)", () => {
  it("existe el patrón sueño vs empresa y el de know-how en una persona", () => {
    expect(PATRONES.map((p) => p.clave)).toEqual(expect.arrayContaining(["sueno_vs_empresa", "know_how_en_una_persona"]));
  });
  it("las 4P tienen sus dimensiones profundas", () => {
    expect(DIMENSIONES.personas).toEqual(expect.arrayContaining(["cultura", "liderazgo", "autoridad", "sucesión", "know-how"]));
    expect(DIMENSIONES.procesos).toEqual(expect.arrayContaining(["espera", "retrabajo", "capacidad", "desperdicio"]));
    expect(DIMENSIONES.producto).toEqual(expect.arrayContaining(["promesa" === "promesa" ? "resultado prometido" : "", "margen", "escalabilidad"]));
    expect(DIMENSIONES.marketing).toEqual(expect.arrayContaining(["canales", "seguimiento", "retención", "recomendación"]));
  });
});
