import { describe, it, expect } from "vitest";
import { CATEGORIAS, CATEGORIA } from "@/lib/pcf";
import { perfilDe, RASGOS } from "@/lib/perfil";
import { matrizDe, avanceMatriz, NOMBRE_PRIORIDAD } from "@/lib/matriz";
import { madurezProceso, madurezEmpresa, NIVELES } from "@/lib/madurez";

/**
 * LA METODOLOGÍA, ANCLADA EN LOS MARCOS QUE USA LA CONSULTORÍA SERIA (30-08-2026).
 * APQC PCF para clasificar procesos, SIPOC para que dejen de ser islas, y CMMI para poner número
 * al avance. Kelin lo pidió así: «estamos hablando de la mejor consultora de Latam, debes tenerlo
 * mapeado». Estas pruebas cuidan que el anclaje no se deforme con el tiempo.
 */
describe("el mapa de todo negocio (APQC PCF)", () => {
  it("están las 13 categorías del estándar", () => {
    expect(CATEGORIAS).toHaveLength(13);
    expect(new Set(CATEGORIAS.map((c) => c.n)).size).toBe(13);
  });

  it("cada categoría guarda su equivalencia con el estándar, para hablar con un corporativo", () => {
    for (const c of CATEGORIAS) {
      expect(c.apqc.length, c.clave).toBeGreaterThan(5);
      expect(c.apqc, `${c.clave}: la equivalencia va en el nombre original del marco`).toMatch(/[A-Z]/);
    }
  });

  it("al dueño se le habla en su idioma, no en el del marco", () => {
    for (const c of CATEGORIAS) {
      expect(c.nombre, `${c.clave} suena a consultoría`).not.toMatch(/gestión de|gestionar el capital|recursos humanos|stakeholder|compliance/i);
      expect(c.pregunta, `${c.clave} debe tener una pregunta que el dueño se hace`).toMatch(/\?/);
    }
  });

  it("seis categorías son el negocio funcionando y siete lo sostienen", () => {
    expect(CATEGORIAS.filter((c) => c.familia === "operacion")).toHaveLength(6);
    expect(CATEGORIAS.filter((c) => c.familia === "soporte")).toHaveLength(7);
  });
});

describe("el perfil no inventa rasgos", () => {
  const vacio = { ficha: null, sector: null, textos: [] };

  it("sin datos no afirma nada: lo que no sabe queda por preguntar", () => {
    const p = perfilDe(vacio);
    expect(p.rasgos).toHaveLength(0);
    expect(p.sinDatos.length).toBeGreaterThan(5);
  });

  it("no engancha una palabra dentro de otra: «solicita» no es «cita»", () => {
    const p = perfilDe({ ficha: null, sector: null, textos: ["El cliente solicita el cambio y necesita su DNI"] });
    expect(p.rasgos.some((r) => r.clave === "citas"), "«soliCITA» y «neceSITA» no son citas").toBe(false);
  });

  it("«tarjeta de crédito» no significa que la empresa fíe", () => {
    const p = perfilDe({ ficha: null, sector: null, textos: ["El cliente paga con tarjeta de crédito"] });
    expect(p.rasgos.some((r) => r.clave === "credito")).toBe(false);
  });

  it("pero sí detecta lo que la empresa realmente dijo", () => {
    const p = perfilDe({ ficha: { personas: "11", locales: "3" }, sector: "casa de cambio", textos: ["Al cerrar contamos el efectivo y cuadramos la caja"] });
    expect(p.rasgos.map((r) => r.clave)).toContain("efectivo");
    expect(p.rasgos.map((r) => r.clave)).toContain("multi_sede");
    expect(p.rasgos.map((r) => r.clave)).toContain("equipo");
  });

  it("cada rasgo explica por qué cambia lo que la empresa necesita", () => {
    for (const r of Object.values(RASGOS)) expect(r.porque.length, r.clave).toBeGreaterThan(25);
  });
});

describe("la matriz de documentación", () => {
  const qori = perfilDe({
    ficha: { personas: "11", locales: "3" },
    sector: "casa de cambio y envíos",
    textos: ["Contamos el efectivo y cuadramos caja al cierre", "Atendemos en ventanilla", "Enviamos paquetes por DHL"],
  });

  it("una empresa con efectivo recibe sus procesos de caja, y con el porqué", () => {
    const m = matrizDe(qori);
    const caja = m.procesos.find((x) => x.nombre === "Cierre y cuadre de caja");
    expect(caja, "una empresa que maneja efectivo necesita cuadrar caja").toBeTruthy();
    expect(caja!.disparado_por).toBe("efectivo");
    expect(caja!.porque.length).toBeGreaterThan(20);
  });

  it("cada proceso sabe a qué parte del negocio pertenece", () => {
    for (const p of matrizDe(qori).procesos) expect(CATEGORIA.has(p.categoria), `${p.nombre} sin categoría válida`).toBe(true);
  });

  it("nunca recomienda un documento que no existe en el catálogo", () => {
    const m = matrizDe(qori);
    for (const d of m.documentos) expect(d.nombre, d.clave).not.toBe(d.clave);
  });

  it("con tres sedes pide estandarizar entre sedes; sin sedes, no", () => {
    const unaSede = perfilDe({ ficha: { personas: "11", locales: "1" }, sector: "tienda", textos: ["Vendemos en el local"] });
    expect(matrizDe(qori).procesos.some((p) => p.nombre.includes("cada sede"))).toBe(true);
    expect(matrizDe(unaSede).procesos.some((p) => p.nombre.includes("cada sede"))).toBe(false);
  });

  it("a un negocio de una persona no se le pide un reglamento interno", () => {
    const solo = perfilDe({ ficha: { personas: "1" }, sector: "terapias", textos: ["Atiendo yo sola con cita previa"] });
    expect(matrizDe(solo).documentos.some((d) => d.clave === "personas.reglamento")).toBe(false);
  });

  it("si dos rasgos piden el mismo documento, gana la prioridad más urgente", () => {
    const m = matrizDe(qori);
    const controles = m.documentos.find((d) => d.clave === "procesos.controles");
    expect(controles?.prioridad).toBe(1);
  });

  it("lo que la empresa no ha contado queda como por averiguar, no como descartado", () => {
    expect(matrizDe(qori).porAveriguar.length).toBeGreaterThan(0);
  });

  it("el avance cuenta contra la matriz de ESA empresa, no contra el catálogo entero", () => {
    const m = matrizDe(qori);
    const a = avanceMatriz(m, [m.documentos[0]!.clave]);
    expect(a.total).toBe(m.documentos.length);
    expect(a.listos).toBe(1);
    expect(a.faltanAhora.every((d) => d.prioridad === 1)).toBe(true);
  });

  it("las prioridades se le dicen al dueño en su idioma", () => {
    expect(Object.values(NOMBRE_PRIORIDAD)).toEqual(["Ahora", "Después", "Cuando crezcas"]);
  });
});

describe("la madurez se calcula, no se declara", () => {
  const completo = {
    nodos: 8, responsable: "Cajero", tiempo: "10 min", inicio: "El cliente llega",
    resultado: "Entrega del vale", proveedor: "El cliente", cliente_proceso: "Contabilidad",
    documentado: true, indicador: "descuadres al mes", medicionesReales: 3, mejoro: true,
  };

  it("los cinco niveles del estándar, dichos en castellano", () => {
    expect(NIVELES).toHaveLength(6); // 0 (sin mapear) + los cinco del modelo
    expect(NIVELES.map((n) => n.cmmi)).toContain("Optimizando");
    for (const n of NIVELES) expect(n.queSignifica, `nivel ${n.nivel}`).not.toMatch(/CMMI|cuantitativ/i);
  });

  it("sin dibujar, nivel 0 y se dice qué hacer", () => {
    const e = madurezProceso({ nodos: 0 });
    expect(e.nivel).toBe(0);
    expect(e.siguiente).toContain("Cuéntanos");
  });

  it("dibujado pero sin SIPOC se queda en 1, y dice exactamente qué falta", () => {
    const e = madurezProceso({ nodos: 8, responsable: "Cajero", tiempo: "10 min", inicio: "llega", resultado: "vale" });
    expect(e.nivel).toBe(1);
    expect(e.siguiente).toContain("quién entrega");
    expect(e.siguiente).toContain("quién recibe");
  });

  it("con SIPOC completo llega a 2, aunque no esté escrito", () => {
    expect(madurezProceso({ ...completo, documentado: false }).nivel).toBe(2);
  });

  it("un indicador escrito no basta: hay que anotarlo para llegar a medido", () => {
    const e = madurezProceso({ ...completo, medicionesReales: 1 });
    expect(e.nivel).toBe(3);
    expect(e.siguiente).toContain("dos veces");
  });

  it("solo llega a 5 cuando el número mejoró de verdad", () => {
    expect(madurezProceso(completo).nivel).toBe(5);
    expect(madurezProceso({ ...completo, mejoro: null }).nivel).toBe(4);
    const empeoro = madurezProceso({ ...completo, mejoro: false });
    expect(empeoro.nivel).toBe(4);
    expect(empeoro.siguiente).toContain("empeoró");
  });

  it("cada nivel dice qué se comprobó: la madurez se sustenta", () => {
    expect(madurezProceso(completo).porque.length).toBeGreaterThanOrEqual(4);
  });

  it("un proceso perfecto y catorce sin mapear NO es una empresa madura", () => {
    const e = madurezEmpresa([madurezProceso(completo)], 15);
    expect(e.nivel, "contar solo lo hecho es mentirle al cliente con un número bonito").toBeLessThan(1);
    expect(e.mapeados).toBe(1);
    expect(e.esperados).toBe(15);
  });

  it("una empresa con todo medido sí puntúa alto", () => {
    const e = madurezEmpresa(Array.from({ length: 5 }, () => madurezProceso(completo)), 5);
    expect(e.nivel).toBe(5);
  });
});
