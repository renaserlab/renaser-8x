/**
 * EL RECORRIDO DE LOS DOS PILOTOS, SIN BASE Y SIN MODELO: LO QUE EL CÓDIGO HACE SOLO CON LOS PAPELES.
 *
 * Modas Lucero (tienda de ropa) y Estudio Vargas & Asociados (estudio jurídico) son empresas FICTICIAS
 * (tests/fixtures/pilotos, generadas por generar.py). Sus archivos llevan faltantes y contradicciones
 * puestas a propósito, descritas en declaraciones.json. Lo que se prueba aquí es software: que el
 * sistema lea entero, cuente lo que falta en vez de rellenarlo, ponga al lado lo declarado y lo
 * extraído sin dar ninguno por verificado, y calcule el equilibrio con la fórmula correcta y sus
 * supuestos a la vista. NO prueba que la consultoría funcione ni que una empresa real mejore: eso solo
 * lo dice una empresa real, con una línea base y un corte después.
 *
 * Qué queda fuera, y por qué: ningún PDF se lee letra por letra (pdf-lib solo dice si tiene capa de
 * texto; el texto lo lee el modelo, que aquí no se llama), así que las cifras de los PDF (alquiler 6.500,
 * tarifario 1.800) vienen de declaraciones.json, no del archivo. Toda cifra usada está en los
 * fixtures o en ese JSON; nada se inventa.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import declaraciones from "../fixtures/pilotos/declaraciones.json";
import { leerExcel, type Hoja } from "@/lib/documentos/excel";
import { leerWord, type Parrafo } from "@/lib/documentos/word";
import { detectarYLeer, MIME_PDF } from "@/lib/documentos";
import {
  margenContribucion, puntoEquilibrio, equilibrioPorProductoEstrella, costeoPorSku, costeoPorServicio, estadoDeResultados, explicarCalculo,
  NOTA_SIN_REMUNERACION, ROTULO_PRODUCTO_ESTRELLA, type Calculo,
} from "@/lib/finanzas";
// Las reglas numéricas ya son producto (remate 4): se importan de src. Las de Word y precios siguen en _reglas.
import { leerDeclaracion, contradiccionesNumericas, filasDe, sumaSiCompleta } from "@/lib/rules/contradiccion-numerica";
import { vaciosPorPuesto, menciones, dependenciaDe, contradiccionDePrecios } from "./_reglas";

const PILOTOS = path.resolve(__dirname, "../fixtures/pilotos");
const LUCERO_ARCHIVO = (f: string) => readFileSync(path.join(PILOTOS, "modas-lucero", f));
const VARGAS_ARCHIVO = (f: string) => readFileSync(path.join(PILOTOS, "estudio-vargas", f));

const LUCERO = declaraciones.modas_lucero;
const VARGAS = declaraciones.estudio_vargas;

/** Todo cálculo, tenga valor o no, tiene que poder explicarse en palabras. */
function explicable(c: Calculo<unknown>, nombre: string) {
  expect(c.formula.length, `${nombre}: fórmula`).toBeGreaterThan(20);
  expect(typeof c.periodo, `${nombre}: periodo`).toBe("string");
  expect(Array.isArray(c.fuentes), `${nombre}: fuentes`).toBe(true);
  expect(Array.isArray(c.supuestos), `${nombre}: supuestos`).toBe(true);
  expect(Array.isArray(c.limitaciones), `${nombre}: limitaciones`).toBe(true);
  if (c.valor == null) expect(c.motivo_nulo, `${nombre}: un null sin motivo es un fallo en silencio`).toBeTruthy();
  else expect(c.motivo_nulo, `${nombre}: con valor no hay motivo de nulo`).toBeUndefined();
  const lineas = explicarCalculo(c);
  expect(lineas.map((l) => l.etiqueta)).toContain("Cómo se calcula");
}

const hojaLlamada = (hojas: Hoja[], nombre: string): Hoja => {
  const h = hojas.find((x) => x.nombre === nombre);
  if (!h) throw new Error(`No hay hoja «${nombre}»`);
  return h;
};

describe("Pilotos ficticios: software, no efectividad comercial; sin base ni modelo de IA", () => {
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  describe("Modas Lucero · piloto A · tienda de ropa", () => {
    let ventas: Hoja, gastos: Hoja, inventario: Hoja;
    let funciones: Parrafo[];
    /** Los 120 artículos: la fila «TOTAL A COSTO» de la hoja se aparta, es un total y no un artículo. */
    let articulos: ReturnType<typeof filasDe>;

    beforeAll(async () => {
      const excel = await leerExcel(LUCERO_ARCHIVO("ventas-e-inventario.xlsx"));
      ventas = hojaLlamada(excel.hojas, "Ventas");
      gastos = hojaLlamada(excel.hojas, "Gastos");
      inventario = hojaLlamada(excel.hojas, "Inventario");
      articulos = filasDe(inventario).filter((f) => typeof f.valores.codigo === "string" && /^ML-\d{3}$/.test(f.valores.codigo));
      funciones = (await leerWord(LUCERO_ARCHIVO("funciones-del-personal.docx"))).parrafos;
    });

    it("el Excel se lee entero, con sus tres hojas y la celda de cada dato", () => {
      expect(ventas.filas).toHaveLength(6);
      expect(gastos.filas).toHaveLength(6);
      expect(articulos).toHaveLength(120);
      // La primera fila de datos de Ventas sabe de qué celda salió cada valor: eso es lo que hace citable una cifra.
      const abril = filasDe(ventas)[0];
      expect(abril.valores.mes).toBe("2026-04");
      expect(abril.celdas.total_ventas).toBe("D2");
    });

    describe("contradicción: stock declarado «como 40.000» frente al Excel", () => {
      it("el total a costo de los artículos que tienen costo supera 70.000 y coincide con la fila TOTAL de la hoja", () => {
        const conCosto = articulos.filter((f) => typeof f.valores.costo_unitario === "number");
        const totalACosto = conCosto.reduce((s, f) => s + (f.valores.costo_unitario as number) * (f.valores.stock as number), 0);
        expect(conCosto).toHaveLength(80);
        expect(totalACosto).toBeGreaterThan(70_000);
        // La hoja trae su propia fila de total: la cifra calculada aquí y la que escribió la empresa son la misma.
        expect(inventario.filas).toHaveLength(120); const filaTotal = filasDe({ ...inventario, filas: inventario.resumen }).find((f) => /^TOTAL A COSTO/i.test(String(f.valores.codigo)));
        expect(filaTotal?.valores.costo_unitario).toBe(totalACosto);
      });

      it("contradiccionesNumericas la señala como CONTRADICCIÓN, con las dos cifras rotuladas y ninguna verificada", () => {
        const declarado = leerDeclaracion(LUCERO.entrada_breve.stock_declarado);
        expect(declarado.clase).toBe("aproximada"); // «como 40.000»: se le tolera más que a una cifra exacta
        expect(declarado.valor).toBe(40_000);
        const conCosto = articulos.filter((f) => typeof f.valores.costo_unitario === "number");
        const totalACosto = conCosto.reduce((s, f) => s + (f.valores.costo_unitario as number) * (f.valores.stock as number), 0);

        const veredicto = contradiccionesNumericas(
          { concepto: "mercadería a costo", valor: declarado.valor as number, periodo: "hoy", fuente: "entrada breve · stock_declarado", rotulo: "declarado" },
          { concepto: "mercadería a costo", valor: totalACosto, periodo: "hoy", fuente: "Inventario!F2:F121 × E2:E121 (80 artículos con costo)", rotulo: "extraido" },
          { tolerancia_pct: 20 }
        );
        expect(veredicto.tipo).toBe("CONTRADICCION");
        expect(veredicto.declarado).toMatchObject({ rotulo: "declarado", valor: 40_000, estado: "pendiente" });
        expect(veredicto.extraido).toMatchObject({ rotulo: "extraido", valor: totalACosto, estado: "pendiente" });
        expect(veredicto.diferencia_pct).toBeGreaterThan(90);
        // Comparar no verifica nada: la palabra no aparece en ningún lado del veredicto.
        expect(JSON.stringify(veredicto)).not.toMatch(/verificad[ao]/i);
        expect(veredicto.motivo).toMatch(/40\s?000|40,000|40\.000/);
        expect(veredicto.motivo).toMatch(/hasta que alguien las concilie/);
      });

      it("y, para que no sea una máquina de contradicciones: las ventas declaradas (80.000) sí coinciden con el promedio del Excel", () => {
        const total = sumaSiCompleta(ventas, "total_ventas", { periodo: "abril–septiembre 2026" });
        expect(total.valor).toBe(479_800);
        const promedio = (total.valor as number) / ventas.filas.length;
        const veredicto = contradiccionesNumericas(
          { concepto: "ventas de un mes", valor: LUCERO.entrada_breve.ventas_mes, periodo: "mes típico 2026", fuente: "entrada breve · ventas_mes", rotulo: "declarado" },
          { concepto: "ventas de un mes", valor: promedio, periodo: "mes típico 2026", fuente: "Ventas!D2:D7 ÷ 6", rotulo: "extraido" }
        );
        expect(veredicto.tipo).toBe("COINCIDE");
        expect(veredicto.declarado.estado).toBe("pendiente");
        expect(veredicto.extraido.estado).toBe("pendiente");
      });

      it("dos cifras que no miden lo mismo no se comparan: se dice por qué", () => {
        const v = contradiccionesNumericas(
          { concepto: "ventas de un mes", valor: 80_000, periodo: "2026", fuente: "a", rotulo: "declarado" },
          { concepto: "compras de un mes", valor: 52_000, periodo: "2026", fuente: "b", rotulo: "extraido" }
        );
        expect(v.tipo).toBe("NO_COMPARABLE");
        expect(v.diferencia).toBeNull();
        expect(v.motivo).toMatch(/No miden lo mismo/);
      });
    });

    describe("documento incompleto: inventario con 40 de 120 artículos sin costo", () => {
      it("la lectura cuenta las celdas vacías de costo_unitario y no las rellena", () => {
        const costo = inventario.vacias.find((v) => v.columna === "costo_unitario");
        // El total se conserva aparte; no cuenta como artículo ni altera el número de faltantes.
        expect(costo).toMatchObject({ letra: "F", vacias: 40, de: 120 });
        expect(articulos.filter((f) => f.valores.costo_unitario === null)).toHaveLength(40);
      });

      it("el costeo por SKU devuelve un total PARCIAL con aviso, nunca un promedio para los que faltan", () => {
        // Supuesto declarado: no hay ventas por artículo en el Excel; se usa el stock como cantidad para
        // valorar lo que hay en tienda a precio y a margen. Es una hipótesis de inventario, no una venta.
        const costeo = costeoPorSku(
          articulos.map((f) => ({ codigo: String(f.valores.codigo), precio: f.valores.precio_venta as number, costo_variable_unitario: f.valores.costo_unitario as number | null, unidades: f.valores.stock as number })),
          { periodo: "inventario a la fecha del archivo", fuentes: ["Inventario!A2:G121"] }
        );
        explicable(costeo, "costeo por SKU");
        expect(costeo.valor).not.toBeNull();
        const v = costeo.valor!;
        expect(v.con_costo).toBe(80);
        expect(v.sin_costo).toBe(40);
        expect(v.parcial).toBe(true);
        expect(v.aviso).toBe("40 de 120 sin costo o sin unidades: el total es parcial");
        expect(costeo.limitaciones).toContain(v.aviso);
        // Los 40 sin costo tienen margen null con su motivo, no un número.
        const sinCosto = v.detalle.filter((d) => d.mc_unitaria === null);
        expect(sinCosto).toHaveLength(40);
        expect(new Set(sinCosto.map((d) => d.motivo))).toEqual(new Set(["sin costo unitario"]));
        expect(v.detalle.find((d) => d.codigo === "ML-003")).toMatchObject({ mc_unitaria: null, motivo: "sin costo unitario" });
      });
    });

    describe("documento incompleto: gastos con celdas vacías, contadas por columna y nunca tomadas por cero", () => {
      it("la hoja Gastos declara cuántas celdas faltan en cada columna", () => {
        const porColumna = Object.fromEntries(gastos.vacias.map((v) => [v.columna, v.vacias]));
        expect(porColumna).toMatchObject({ mes: 0, alquiler: 0, planilla: 2, luz_agua_internet: 2, mantenimiento_galeria: 0, transporte: 3, comision_tarjeta: 0, otros: 1 });
        expect(gastos.vacias.every((v) => v.de === 6)).toBe(true);
      });

      it("una columna completa se suma; una con huecos devuelve null con las celdas que faltan", () => {
        const alquiler = sumaSiCompleta(gastos, "alquiler", { periodo: "abril–septiembre 2026" });
        explicable(alquiler, "alquiler");
        expect(alquiler.valor).toBe(6 * 6500);
        expect(alquiler.fuentes).toEqual(["Gastos!B2", "Gastos!B3", "Gastos!B4", "Gastos!B5", "Gastos!B6", "Gastos!B7"]);

        const planilla = sumaSiCompleta(gastos, "planilla", { periodo: "abril–septiembre 2026" });
        explicable(planilla, "planilla");
        expect(planilla.valor).toBeNull();
        expect(planilla.motivo_nulo).toMatch(/2 celdas vacías de 6 \(C5, C6\)/);
        expect(planilla.motivo_nulo).toMatch(/no es cero/);

        const transporte = sumaSiCompleta(gastos, "transporte");
        expect(transporte.valor).toBeNull();
        expect(transporte.motivo_nulo).toMatch(/3 celdas vacías de 6 \(F3, F5, F7\)/);
      });

      it("la suma de un mes NO mezcla columnas sin saber que son del mismo periodo: todo sale de la misma fila", () => {
        // Abril es el único mes con las ocho columnas completas; su total de gastos sí se puede formar.
        const abril = filasDe(gastos).find((f) => f.valores.mes === "2026-04")!;
        const columnas = ["alquiler", "planilla", "luz_agua_internet", "mantenimiento_galeria", "transporte", "comision_tarjeta", "otros"];
        expect(columnas.every((c) => typeof abril.valores[c] === "number")).toBe(true);
        expect(columnas.reduce((s, c) => s + (abril.valores[c] as number), 0)).toBe(17_770);
        // Julio no: faltan planilla, luz y transporte. Ese mes no tiene total de gastos, tiene un hueco.
        const julio = filasDe(gastos).find((f) => f.valores.mes === "2026-07")!;
        expect(columnas.filter((c) => julio.valores[c] === null)).toEqual(["planilla", "luz_agua_internet", "transporte"]);
      });
    });

    describe("finanzas: margen de contribución y equilibrio con sus supuestos a la vista", () => {
      // Lo declarado: ventas 80.000 y utilidad 8.000 (entrada breve). Los fijos y las compras salen de la
      // nota de contradicciones del fixture: alquiler 6.500 + planilla 9.000 = 15.500; compras ~52.000.
      const VENTAS = LUCERO.entrada_breve.ventas_mes; // 80.000
      const UTILIDAD_DECLARADA = LUCERO.entrada_breve.ganancia_mes; // 8.000
      const COMPRAS = 52_000;
      const FIJOS = 6_500 + 9_000;

      it("las compras del Excel (promedio) respaldan el ~52.000 de la nota, y el alquiler 6.500 está en Gastos", () => {
        const compras = sumaSiCompleta(ventas, "compras_mercaderia");
        expect(compras.valor).toBe(312_800);
        expect((compras.valor as number) / 6).toBeCloseTo(COMPRAS, -3); // 52.133 ≈ 52.000 al millar
        expect(filasDe(gastos).every((f) => f.valores.alquiler === 6500)).toBe(true);
      });

      it("margen de contribución = 80.000 − 52.000 (compras como aproximación del costo variable, dicho como supuesto)", () => {
        const mc = margenContribucion({ ventas: VENTAS, costos_variables: COMPRAS, periodo: "mes típico abril–septiembre 2026", fuentes: ["entrada breve · ventas_mes", "Ventas!E2:E7 ÷ 6 (compras de mercadería)"] });
        explicable(mc, "margen de contribución");
        expect(mc.valor).toEqual({ monto: 28_000, razon: 0.35 });
        expect(mc.supuestos.join(" ")).toMatch(/costos variables/i);
      });

      it("equilibrio = 15.500 / 0,35 ≈ 44.286; NO es 155.000 ni los ~27.000 del producto estrella", () => {
        const eq = puntoEquilibrio({ costos_fijos: FIJOS, razon_mc: 0.35, periodo: "mes típico abril–septiembre 2026", fuentes: ["Gastos!B2 (alquiler)", "Gastos!C2 (planilla)", "margen de contribución"] });
        explicable(eq, "punto de equilibrio");
        expect(eq.valor?.soles_redondeado).toBe(44_286);
        expect(eq.limitaciones.join(" ")).toMatch(/solo en soles/);

        // La fórmula que Dirección rechazó (D5): fijos / (utilidad / ventas) = 15.500 / 0,10 = 155.000.
        // Se calcula aquí para dejar constancia de que NO es lo que el sistema devuelve.
        const rechazada = FIJOS / (UTILIDAD_DECLARADA / VENTAS);
        expect(rechazada).toBe(155_000);
        expect(eq.valor?.soles_redondeado).not.toBe(155_000);

        // El equilibrio del producto estrella (vestido ML-002: precio 149, costo 58) es una hipótesis
        // rotulada, no el de la empresa: ni 27.000 ni ninguna otra cifra de un solo producto es «de empresa».
        const vestido = articulos.find((f) => f.valores.codigo === "ML-002")!;
        expect(vestido.valores.categoria).toBe("Vestido");
        const estrella = equilibrioPorProductoEstrella({ costos_fijos: FIJOS, precio: vestido.valores.precio_venta as number, costo_unitario: vestido.valores.costo_unitario as number });
        explicable(estrella, "equilibrio del producto estrella");
        expect(estrella.supuestos.join(" ").toLowerCase()).toContain(ROTULO_PRODUCTO_ESTRELLA);
        expect(estrella.limitaciones.join(" ")).toMatch(/No es el punto de equilibrio de la empresa/);
        expect(estrella.valor?.soles_redondeado).not.toBe(eq.valor?.soles_redondeado);
        expect(Math.abs((eq.valor?.soles_redondeado ?? 0) - 27_000)).toBeGreaterThan(5_000);
      });

      it("sin costo variable no hay equilibrio: null con motivo, no un número que parezca exacto", () => {
        const sinCosto = margenContribucion({ ventas: VENTAS, costos_variables: null });
        expect(sinCosto.valor).toBeNull();
        const eq = puntoEquilibrio({ costos_fijos: FIJOS, razon_mc: null });
        explicable(eq, "equilibrio sin razón");
        expect(eq.valor).toBeNull();
        expect(eq.motivo_nulo).toMatch(/utilidad sobre ventas no la reemplaza/);
      });

      it("la utilidad declarada (8.000) no se confirma ni se niega: los gastos del semestre tienen huecos", () => {
        const planilla = sumaSiCompleta(gastos, "planilla");
        const er = estadoDeResultados({
          ventas: VENTAS,
          costo_ventas: COMPRAS,
          // Los gastos operativos del semestre no se pueden sumar (planilla, luz, transporte con celdas
          // vacías): null, que no es cero. El estado de resultados lo propaga y lo explica.
          gastos_operativos: planilla.valor,
          periodo: "mes típico abril–septiembre 2026",
          fuentes: ["entrada breve", "Ventas!E2:E7", "Gastos (incompleta)"],
        });
        explicable(er, "estado de resultados");
        expect(er.valor?.utilidad_bruta).toBe(28_000);
        expect(er.valor?.utilidad_operativa).toBeNull();
        expect(er.valor?.motivos.utilidad_operativa).toBe("gastos operativos no registrados");
        expect(er.valor?.utilidad_neta).toBeNull();
        expect(er.limitaciones).toContain(NOTA_SIN_REMUNERACION);
        // La cifra del dueño queda como lo que es: declarada y pendiente. Ni «verificada» ni «falsa».
        expect(leerDeclaracion(UTILIDAD_DECLARADA)).toEqual({ clase: "exacta", valor: 8_000, texto: "8000" });
      });
    });

    describe("Word de funciones: los vacíos se ven porque la estructura se conserva", () => {
      it("Jorge tiene «POR DEFINIR» en funciones y Carmen no tiene horario: dos vacíos citados por párrafo", () => {
        const vacios = vaciosPorPuesto(funciones);
        expect(vacios).toEqual([
          { puesto: "Vendedora — Carmen Huamán", indice_titulo: 17, vacio: "sin_horario", cita: "Horario: (no indicado)", indice: 21 },
          { puesto: "Almacén y reparto (medio tiempo) — Jorge Ccahuana", indice_titulo: 22, vacio: "sin_funciones", cita: "Funciones: POR DEFINIR.", indice: 23 },
        ]);
      });

      it("la gerente y Rosa fijan precios: dos párrafos bajo dos títulos, para preguntar quién decide qué", () => {
        const quien = menciones(funciones, /fija precios/i);
        expect(quien.map((m) => m.bajo)).toEqual(["Gerente general — Lucero Quintana", "Vendedora principal / caja — Rosa Mamani"]);
        expect(quien.map((m) => m.indice)).toEqual([5, 14]);
      });

      it("la nota final dice que no hay manual de caja ni de inventario: faltante leído, no deducido", () => {
        expect(menciones(funciones, /no hay manual de caja/i)).toHaveLength(1);
      });
    });

    it("el contrato en PDF tiene capa de texto, pero sin modelo no se lee: la renta 6.500 viene de declaraciones.json", async () => {
      const lectura = await detectarYLeer(MIME_PDF, LUCERO_ARCHIVO("contrato-alquiler.pdf"));
      expect(lectura.clase).toBe("pdf");
      expect(lectura.fidelidad).toBe("media");
      expect(lectura.nota).toMatch(/El texto lo lee el modelo/);
      expect(LUCERO.contradicciones_deliberadas[2]).toMatch(/alquiler 6,500/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  describe("Estudio Vargas & Asociados · piloto B · estudio jurídico", () => {
    let expedientes: Hoja;
    let filas: ReturnType<typeof filasDe>;
    let procedimiento: Parrafo[];
    const CAPACIDAD = { personas: 2, horas_mes_por_persona: 160, meses: 6 }; // dos abogados, un semestre: supuesto de la prueba
    const TARIFA_LABORAL = 1_800; // «Tarifario laboral 1,800» (declaraciones.json · contradicciones_deliberadas[0])

    beforeAll(async () => {
      const excel = await leerExcel(VARGAS_ARCHIVO("expedientes-2026-I.xlsx"));
      expedientes = hojaLlamada(excel.hojas, "Expedientes 2026-I");
      filas = filasDe(expedientes);
      procedimiento = (await leerWord(VARGAS_ARCHIVO("procedimiento-seguimiento.docx"))).parrafos;
    });

    const porMateria = (materia: string) => filas.filter((f) => f.valores.materia === materia);

    it("110 expedientes: 62 laborales, 30 civiles, 18 de familia", () => {
      expect(filas).toHaveLength(110);
      expect(porMateria("Laboral")).toHaveLength(62);
      expect(porMateria("Civil")).toHaveLength(30);
      expect(porMateria("Familia")).toHaveLength(18);
    });

    describe("información desconocida: horas no registradas y «no lo sé»", () => {
      it("horas_estimadas está vacía en los 110: el conteo lo dice y la suma se niega", () => {
        expect(expedientes.vacias.find((v) => v.columna === "horas_estimadas")).toMatchObject({ letra: "I", vacias: 110, de: 110 });
        const horas = sumaSiCompleta(expedientes, "horas_estimadas");
        expect(horas.valor).toBeNull();
        expect(horas.motivo_nulo).toMatch(/110 celdas vacías de 110/);
      });

      it("rentabilidad por servicio: null con motivo «horas no registradas» en los tres servicios; desconocido, no cero", () => {
        const servicios = ["Laboral", "Civil", "Familia"].map((m) => {
          const casos = porMateria(m);
          const pactado = sumaSiCompleta(expedientes, "honorario_pactado", { filtro: (f) => f.valores.materia === m });
          return { nombre: m, tarifa: (pactado.valor as number) / casos.length, horas_por_caso: null, casos: casos.length, costo_hora: null };
        });
        const costeo = costeoPorServicio(servicios, CAPACIDAD, { periodo: "2026-I", fuentes: ["Expedientes 2026-I!C2:I111"] });
        explicable(costeo, "costeo por servicio");
        expect(costeo.valor).not.toBeNull();
        const v = costeo.valor!;
        expect(v.servicios_sin_horas).toEqual(["Laboral", "Civil", "Familia"]);
        expect(v.detalle.map((d) => d.motivo)).toEqual(["horas no registradas", "horas no registradas", "horas no registradas"]);
        expect(v.detalle.every((d) => d.ingreso_por_hora === null && d.mc_por_hora === null)).toBe(true);
        expect(v.utilizacion_pct).toBeNull();
        expect(v.horas_requeridas).toBeNull();
        // Lo que SÍ se sabe se dice: el ingreso pactado del semestre por materia, sumado solo porque la columna está completa.
        expect(v.detalle.map((d) => Math.round(d.ingreso))).toEqual([109_010, 72_323, 20_998]);
        expect(costeo.limitaciones.join(" ")).toMatch(/Horas no registradas en: Laboral, Civil, Familia/);
      });

      it("«No lo sé» y «entre 18.000 y 25.000» se guardan como desconocido y como rango: ningún cero, ningún punto medio", () => {
        expect(leerDeclaracion(VARGAS.entrada_breve.ganancia_mes)).toEqual({ clase: "desconocida", valor: null, texto: "No lo sé." });
        expect(leerDeclaracion(VARGAS.entrada_breve.ventas_mes)).toMatchObject({ clase: "rango", valor: null, desde: 18_000, hasta: 25_000 });
        expect(leerDeclaracion(VARGAS.entrada_breve.meta_venta_mes)).toMatchObject({ clase: "desconocida", valor: null });
        expect(leerDeclaracion(VARGAS.entrada_breve.deuda_clientes)).toMatchObject({ clase: "desconocida", valor: null });
      });

      it("cobrado vacío en 26 de 110: la cobranza pendiente no se puede sumar, y se dice cuáles faltan", () => {
        expect(expedientes.vacias.find((v) => v.columna === "cobrado")).toMatchObject({ letra: "H", vacias: 26, de: 110 });
        const cobrado = sumaSiCompleta(expedientes, "cobrado", { periodo: "2026-I" });
        expect(cobrado.valor).toBeNull();
        expect(cobrado.motivo_nulo).toMatch(/26 celdas vacías de 110 \(H/);
      });
    });

    describe("contradicción de precios: tarifario 1.800 frente a lo pactado", () => {
      it("los laborales se pactaron entre 1.200 y 2.200; varios no coinciden con el tarifario", () => {
        const laborales = porMateria("Laboral").map((f) => ({ codigo: String(f.valores.codigo), valor: f.valores.honorario_pactado as number, celda: `Expedientes 2026-I!${f.celdas.honorario_pactado}` }));
        const v = contradiccionDePrecios({ valor: TARIFA_LABORAL, fuente: "tarifario-2025.pdf (cifra tomada de declaraciones.json; el PDF no se lee sin modelo)" }, laborales);
        expect(v.tipo).toBe("CONTRADICCION");
        expect(v.de).toBe(62);
        expect(v.distintos).toBeGreaterThan(0);
        expect(v.distintos).toBeLessThan(62); // muchos sí se cobraron a 1.800: no es que el tarifario no exista
        expect(v.minimo).toBeGreaterThanOrEqual(1_200);
        expect(v.maximo).toBeLessThanOrEqual(2_200);
        expect(v.ejemplos.length).toBeGreaterThan(0);
        expect(v.ejemplos[0]).toMatch(/^EXP-\d{3} \(Expedientes 2026-I!G\d+\): S\/ /);
        expect(v.motivo).toMatch(/descuentos o recargos que no están escritos/);
        expect(v.motivo).toMatch(/no se concluye/);
      });
    });

    describe("capacidad: 62 casos × 25 h declaradas frente a 2 personas × 160 h × 6 meses", () => {
      const HORAS_CASO = leerDeclaracion(VARGAS.entrada_breve.horas_por_caso_laboral); // «Unas 25 horas por caso, calculo.»

      it("la declaración es aproximada (25) y la utilización solo de laboral da ≈ 81 %: no supera el 100 %, y no se dice que lo haga", () => {
        expect(HORAS_CASO).toMatchObject({ clase: "aproximada", valor: 25 });
        const laboral = costeoPorServicio([{ nombre: "Laboral", tarifa: TARIFA_LABORAL, horas_por_caso: HORAS_CASO.valor, casos: 62, costo_hora: null }], CAPACIDAD, { periodo: "2026-I" });
        explicable(laboral, "utilización laboral");
        const v = laboral.valor!;
        expect(v.horas_requeridas).toBe(1_550);
        expect(v.horas_disponibles).toBe(1_920);
        expect(v.utilizacion_pct).toBeCloseTo(80.73, 1);
        expect(laboral.limitaciones.join(" ")).not.toMatch(/superan la capacidad/);
        // Es la lectura de la nota del fixture: ~30 h por semana por abogado solo en laboral (1.550 h / 2 / 26 semanas).
        expect(1_550 / 2 / 26).toBeCloseTo(30, 0);
        expect(v.detalle[0].ingreso_por_hora).toBe(72); // 1.800 / 25
        expect(v.detalle[0].motivo).toBe("costo por hora no registrado");
      });

      it("si civil y familia tomaran lo mismo que laboral (hipótesis), la carga sería 143 % y el cálculo lo señala como inconsistente", () => {
        // Hipótesis, no dato: nadie declaró horas de civil ni de familia. Sirve para mostrar que cuando la carga
        // supera la capacidad el cálculo lo dice y pide preguntar, en vez de concluir.
        const todos = ["Laboral", "Civil", "Familia"].map((m) => ({ nombre: m, tarifa: TARIFA_LABORAL, horas_por_caso: HORAS_CASO.valor, casos: porMateria(m).length, costo_hora: null }));
        const c = costeoPorServicio(todos, CAPACIDAD, { periodo: "2026-I" });
        expect(c.valor?.horas_requeridas).toBe(110 * 25);
        expect(c.valor?.utilizacion_pct).toBeCloseTo(143.23, 1);
        expect(c.limitaciones.join(" ")).toMatch(/superan la capacidad.*Se pregunta, no se concluye/);
      });
    });

    describe("procedimiento en Word: la dependencia del socio se cuenta en el documento", () => {
      it("el Dr. Vargas aparece en 4 de los 6 pasos y «revisa y firma todos»", () => {
        const d = dependenciaDe(procedimiento, /Dr\. Vargas/);
        expect(d.pasos).toBe(6);
        expect(d.con_persona).toBe(4);
        expect(d.indices).toEqual([2, 3, 5, 7]);
        expect(d.firma_todo).toBe(true);
        expect(d.citas[1]).toBe("párrafo 3: La Dra. Paredes prepara los escritos; el Dr. Vargas los revisa y firma todos.");
      });

      it("los vencimientos van en la agenda personal y «no hay tablero compartido»: lo que el dueño dijo de los dos plazos perdidos tiene dónde mirarse", () => {
        const agenda = menciones(procedimiento, /agenda personal/i);
        expect(agenda).toEqual([{ indice: 5, texto: "Los vencimientos se anotan en la agenda personal del Dr. Vargas. No hay tablero compartido.", bajo: "Procedimiento de seguimiento de casos (borrador)" }]);
        expect(VARGAS.entrada_breve.principal_problema).toMatch(/dos plazos/);
        expect(menciones(procedimiento, /Última revisión: no consta/)).toHaveLength(1);
      });
    });

    it("el tarifario en PDF tiene capa de texto; sin modelo no se lee, y su vigencia en 2026 no está confirmada", async () => {
      const lectura = await detectarYLeer(MIME_PDF, VARGAS_ARCHIVO("tarifario-2025.pdf"));
      expect(lectura.clase).toBe("pdf");
      expect(lectura.clase === "pdf" && lectura.paginas).toBe(1);
      expect(VARGAS.faltantes_deliberados.some((f) => /vigencia no confirmada en 2026/.test(f))).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  describe("los siete casos difíciles: tres demostrados aquí, cuatro con su prueba en otro lugar", () => {
    const CASOS = declaraciones.casos_dificiles;

    it("información desconocida: demostrado arriba (Vargas: «No lo sé» y 110 horas vacías → null con motivo, nunca 0)", () => {
      expect(CASOS.informacion_desconocida).toMatch(/«desconocido», no 0/);
      expect(leerDeclaracion("No lo sé.").valor).toBeNull();
      expect(leerDeclaracion("No lo sé.").valor).not.toBe(0);
    });

    it("documento incompleto: demostrado arriba (Lucero: 40 sin costo → total parcial con aviso; gastos con huecos → suma null)", () => {
      expect(CASOS.documento_incompleto).toMatch(/nunca un promedio inventado/);
    });

    it("contradicción: demostrado arriba (Lucero: 40.000 declarados frente a 79.782 a costo → las dos cifras pendientes)", () => {
      expect(CASOS.contradiccion).toMatch(/declarado\/extraído pendientes/);
    });

    it.todo("falla de proveedor (402 en medio de la extracción): tests/proveedor-pausa.test.ts · «el worker ante AIProviderPausedError» y «la regla de la pausa»; aquí no hay modelo que falle");
    it.todo("reintento de la misma operación (mismo POST dos veces → un trabajo): tests/reencolar.test.ts · «encolar con la clave por defecto» y tests/jobs.test.ts · «clave determinista de una petición»; con los pilotos sembrados: tests/pilotos/sembrar-candado.test.ts (dobles)");
    it.todo("usuario sin acceso (dueño de Vargas pide datos de Lucero → 403 con rastro): tests/acceso.test.ts · «protegido() · con dobles»; contra base real queda bloqueado hasta tener proyecto de prueba");
    it.todo("cambio de versión de línea base (v1 con utilidad 8.000; v2 tras completar costos; los cortes anteriores siguen refiriendo v1): Entrega 2 · migracion-plan-kpi-linea-base.sql y tests/medicion.test.ts");
  });
});
