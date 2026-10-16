import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Para OPERAR el PATCH de evidencia (más abajo): `supabaseAdmin()` es un doble de PostgREST en memoria que filtra
 * con los .eq/.gt recibidos, aplica los update, inserta con id propio y anota cada escritura, para poder afirmar
 * «no se escribió nada». La sesión es la que la prueba diga y el rastro de auditoría no sale de la memoria. Desde
 * aquí no se llega a ninguna base real.
 */
type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({ tablas: {} as Record<string, Record<string, unknown>[]>, escrituras: [] as { tabla: string; op: "update" | "insert"; datos: Record<string, unknown> }[], seq: 0 }));
vi.mock("@/lib/supabase/admin", () => {
  type F = Record<string, unknown>;
  const consulta = (tabla: string) => {
    const filtros: ((f: F) => boolean)[] = [];
    let modo: "select" | "update" | "insert" = "select";
    let cuerpo: F = {};
    let insertada: F | null = null;
    const filas = () => (base.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
    const ejecutar = () => {
      if (modo === "update") {
        const objetivo = filas();
        for (const f of objetivo) Object.assign(f, cuerpo);
        base.escrituras.push({ tabla, op: "update", datos: { ...cuerpo } });
        return { data: objetivo, error: null, count: null };
      }
      if (modo === "insert") return { data: insertada ? [insertada] : [], error: null, count: null };
      const d = filas();
      return { data: d, error: null, count: d.length };
    };
    const q = {
      select: () => q,
      order: () => q,
      limit: () => q,
      eq: (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return q; },
      gt: (k: string, v: unknown) => { filtros.push((f) => String(f[k]) > String(v)); return q; },
      update: (datos: F) => { modo = "update"; cuerpo = datos; return q; },
      insert: (datos: F) => {
        modo = "insert";
        base.seq += 1;
        insertada = { id: `${tabla}-${base.seq}`, ...datos };
        (base.tablas[tabla] ??= []).push(insertada);
        base.escrituras.push({ tabla, op: "insert", datos: insertada });
        return q;
      },
      maybeSingle: async () => { const r = ejecutar(); return { data: r.data[0] ?? null, error: null }; },
      single: async () => { const r = ejecutar(); const d = r.data[0] ?? null; return { data: d, error: d ? null : { message: "no hay fila" } }; },
      then: (res: (v: ReturnType<typeof ejecutar>) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  return { supabaseAdmin: () => ({ from: consulta }) };
});
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), perfilApi: vi.fn() }));
vi.mock("@/lib/auditoria", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));
// La delegación se comprueba espiando la función DE VERDAD: `aplicarTransicion` se ejecuta entera (lee el doble,
// aplica la regla, escribe) y el espía solo anota con qué la llamó la ruta. No se sustituye por una respuesta fija.
vi.mock("@/lib/plan-intervencion", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/plan-intervencion")>();
  return { ...real, aplicarTransicion: vi.fn(real.aplicarTransicion) };
});

import { reconocerPorBytes, MAX_EVIDENCIA_BYTES, validarArchivo, rutaStorage } from "@/lib/archivos";
import { SalidaMedidor } from "@/lib/schemas";
import { PROMPT_MEDIDOR } from "@/lib/ai/agents/medidor";
import { GUARDIA } from "@/lib/rules/patrones";
import { mesCerradoMasReciente, ultimosMeses } from "@/lib/temporadas";
import { perfilApi, type Perfil } from "@/lib/auth";
import { accionVacia, aplicarTransicion, transicion, ERROR_SIN_EVIDENCIA } from "@/lib/plan-intervencion";
import { PATCH as verificarConEvidencia } from "@/app/api/companies/[id]/evidencia/route";

const conCabecera = (...bytes: number[]) => {
  const b = new Uint8Array(16);
  bytes.forEach((v, i) => (b[i] = v));
  return b;
};

/**
 * Punto 5: la prueba de que algo se hizo. El campo `evidencia` de las acciones DESCRIBÍA qué prueba
 * haría falta y no guardaba nada. Sin prueba, "se implementó" es una afirmación, no un hecho.
 */
describe("evidencia: qué archivo se acepta", () => {
  it("reconoce las fotos por sus bytes, no por lo que diga el navegador", () => {
    expect(reconocerPorBytes(conCabecera(0x89, 0x50, 0x4e, 0x47))?.mime).toBe("image/png");
    expect(reconocerPorBytes(conCabecera(0xff, 0xd8, 0xff))?.mime).toBe("image/jpeg");
    expect(reconocerPorBytes(conCabecera(0x25, 0x50, 0x44, 0x46))?.mime).toBe("application/pdf");
  });

  it("acepta HEIC: el celular de un dueño peruano lo manda sin avisar", () => {
    const b = conCabecera(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63);
    expect(reconocerPorBytes(b)?.mime).toBe("image/heic");
  });

  it("las fotos se clasifican como foto y el PDF como documento", () => {
    expect(reconocerPorBytes(conCabecera(0x89, 0x50, 0x4e, 0x47))?.familia).toBe("foto");
    expect(reconocerPorBytes(conCabecera(0x25, 0x50, 0x44, 0x46))?.familia).toBe("documento");
  });

  it("un archivo que MIENTE sobre lo que es no pasa", () => {
    // Un ejecutable renombrado a .png: la cabecera lo delata.
    expect(reconocerPorBytes(conCabecera(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
  });

  it("el SVG no entra: puede llevar script dentro", () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>");
    expect(reconocerPorBytes(svg)).toBeNull();
  });

  it("un archivo demasiado corto para tener cabecera no pasa", () => {
    expect(reconocerPorBytes(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it("el tope de una evidencia deja pasar una foto de celular pero no un video", () => {
    expect(MAX_EVIDENCIA_BYTES).toBeGreaterThanOrEqual(4 * 1024 * 1024);
    expect(MAX_EVIDENCIA_BYTES).toBeLessThanOrEqual(12 * 1024 * 1024);
  });

  it("la ruta siempre cuelga de la carpeta de la empresa y nunca acepta una ruta del cliente", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const r = rutaStorage(id, "../../otra-empresa/robo.png", 1);
    expect(r.startsWith(`${id}/`)).toBe(true);
    expect(r).not.toContain("..");
  });

  it("la validación que ya existía sigue funcionando: no se rompió al añadir la de bytes", () => {
    expect(validarArchivo({ nombre: "foto.png", mime: "image/png", bytes: 1000 }).ok).toBe(true);
    expect(validarArchivo({ nombre: "vacio.png", mime: "image/png", bytes: 0 }).ok).toBe(false);
  });
});

/**
 * EL PATCH DE EVIDENCIA, OPERADO. Hasta el cierre Z5 estas tres pruebas leían el TEXTO de la ruta, y pasaban por
 * lo que no era: «sube al menos una prueba» y «verificado_por» solo quedan en un comentario que cuenta cómo era
 * antes, y el conteo `(count ?? 0) === 0` ya no decide nada (solo anota en el rastro con cuál de las dos pruebas
 * pasó). Verde falso: la regla podía borrarse y las tres seguían en verde. Ahora se LLAMA a la ruta, con
 * `protegido()` real y dobles de sesión y de base, y se mira lo que responde y lo que deja escrito. La regla no
 * vive en la ruta: la ruta se la pide a `aplicarTransicion` (src/lib/plan-intervencion.ts), y eso también se mira.
 */
describe("evidencia: verificar pasa por la máquina de estados, no por la ruta (operada con dobles)", () => {
  const EMP = "0000000a-0000-4000-8000-00000000000a";
  const OTRA = "0000000b-0000-4000-8000-00000000000b";
  const ACCION = "a1000000-0000-4000-8000-000000000001";
  const CONSULTORA: Perfil = { id: "22222222-2222-4222-8222-222222222222", email: "consultora@ejemplo.test", nombre: "Consultora", rol: "consultor", autoridad: ["aprobar_plan"] };
  const reportada = (extra: Fila = {}) =>
    ({ ...accionVacia({ id: ACCION, company_id: EMP, accion: "Cotizar sin el dueño", estado: "reportado", reportado_at: "2026-10-10T10:00:00.000Z", reportado_por: "11111111-1111-4111-8111-111111111111" }), ...extra }) as Fila;
  const guardada = () => base.tablas.actions!.find((a) => a.id === ACCION)!;
  const llamar = async (cuerpo: Fila, empresa = EMP) => {
    const res = await verificarConEvidencia(
      new Request(`http://8x.test/api/companies/${empresa}/evidencia`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }),
      { params: Promise.resolve({ id: empresa }) }
    );
    return { status: res.status, cuerpo: (await res.json()) as Fila };
  };

  beforeEach(() => {
    base.tablas = { actions: [reportada()], evidencias: [], indicador_valores: [], accion_historial: [] };
    base.escrituras = [];
    vi.mocked(perfilApi).mockReset();
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    vi.mocked(aplicarTransicion).mockClear();
  });

  it("comprueba que la acción sea de esta empresa antes de tocarla: pedida desde otra empresa es 404, sin llegar a la regla y sin escribir", async () => {
    base.tablas.evidencias!.push({ id: "e1", company_id: EMP, action_id: ACCION, tipo: "foto" });
    const r = await llamar({ action_id: ACCION }, OTRA);
    expect(r.status).toBe(404);
    expect(r.cuerpo.error).toBe("Esa acción no es de esta empresa.");
    expect(aplicarTransicion).not.toHaveBeenCalled();
    expect(base.escrituras).toEqual([]);
    expect(guardada().estado).toBe("reportado");
  });

  it("no deja dar por verificada una acción sin al menos una prueba: 409 con ERROR_SIN_EVIDENCIA, y la acción sigue reportada", async () => {
    // La regla, pura: sin pruebas y sin valor del indicador posterior al reporte, verificar no pasa.
    const a = accionVacia({ id: ACCION, company_id: EMP, accion: "Cotizar sin el dueño", estado: "reportado" });
    const actor = { id: CONSULTORA.id, rol: "consultor" as const };
    expect(transicion(a, "verificar", actor, { evidencia: { pruebas: 0, indicadorPosterior: false } })).toEqual({ ok: false, error: ERROR_SIN_EVIDENCIA });
    expect(transicion(a, "verificar", actor)).toEqual({ ok: false, error: ERROR_SIN_EVIDENCIA });
    // Y la ruta, llamada de verdad sin ninguna evidencia en la base: responde con esa misma regla y no escribe.
    const r = await llamar({ action_id: ACCION, nota: "la vi en la visita" });
    expect(r.status).toBe(409);
    expect(r.cuerpo.error).toBe(ERROR_SIN_EVIDENCIA);
    expect(ERROR_SIN_EVIDENCIA).toBe("reportado no es verificado: falta evidencia");
    expect(base.escrituras).toEqual([]);
    expect(guardada().estado).toBe("reportado");
    expect(guardada().verificado_at ?? null).toBeNull();
    expect(guardada().verificado_por ?? null).toBeNull();
    expect(base.tablas.accion_historial).toEqual([]);
    // Una evidencia de OTRA acción no sirve de prueba para esta.
    base.tablas.evidencias!.push({ id: "e9", company_id: EMP, action_id: "a9000000-0000-4000-8000-000000000009", tipo: "foto" });
    expect((await llamar({ action_id: ACCION })).status).toBe(409);
    expect(base.escrituras).toEqual([]);
  });

  it("la ruta DELEGA: le pide el evento «verificar» a aplicarTransicion con la acción leída, quien pide y su nota, y no escribe nada por su cuenta", async () => {
    base.tablas.evidencias!.push({ id: "e1", company_id: EMP, action_id: ACCION, tipo: "foto" });
    const r = await llamar({ action_id: ACCION, nota: "la foto muestra la plantilla firmada" });
    expect(r.status).toBe(200);
    expect(aplicarTransicion).toHaveBeenCalledTimes(1);
    const [accion, perfil, pedido] = vi.mocked(aplicarTransicion).mock.calls[0]!;
    expect(accion).toMatchObject({ id: ACCION, company_id: EMP, estado: "reportado" });
    expect(perfil).toMatchObject({ id: CONSULTORA.id, rol: "consultor" });
    expect(pedido).toEqual({ evento: "verificar", motivo: "la foto muestra la plantilla firmada" });
    // Todo lo escrito es lo que escribe la máquina de estados: la acción y su fila de historial, nada más.
    expect(base.escrituras.map((e) => `${e.tabla}:${e.op}`)).toEqual(["actions:update", "accion_historial:insert"]);
    // Y lo que la ruta devuelve es lo que la máquina devolvió.
    expect(r.cuerpo).toMatchObject({ verificada: true, estado: "verificado", pruebas: 1 });
    expect(r.cuerpo.historial_ids).toEqual([base.tablas.accion_historial![0]!.id]);
  });

  it("guarda quién verificó y cuándo, en la acción y en su historial: «hecho» deja de ser una casilla anónima", async () => {
    base.tablas.evidencias!.push({ id: "e1", company_id: EMP, action_id: ACCION, tipo: "foto" });
    const antes = Date.now();
    const r = await llamar({ action_id: ACCION, nota: "la foto muestra la plantilla firmada" });
    expect(r.status).toBe(200);
    const a = guardada();
    expect(a).toMatchObject({ estado: "verificado", verificado_por: CONSULTORA.id, verificado_nota: "la foto muestra la plantilla firmada" });
    const cuando = new Date(String(a.verificado_at)).getTime();
    expect(cuando).toBeGreaterThanOrEqual(antes);
    expect(cuando).toBeLessThanOrEqual(Date.now());
    expect(base.tablas.accion_historial).toHaveLength(1);
    expect(base.tablas.accion_historial![0]).toMatchObject({ action_id: ACCION, accion: "verificar", actor_id: CONSULTORA.id, actor_rol: "consultor", antes: { estado: "reportado" } });
    expect(base.tablas.accion_historial![0]!.despues).toMatchObject({ estado: "verificado", verificado_por: CONSULTORA.id, verificado_at: a.verificado_at });
  });

  it("la prueba puede ser un valor del indicador posterior al reporte; uno ANTERIOR no cuenta", async () => {
    const IND = "k1000000-0000-4000-8000-000000000001";
    base.tablas.actions = [reportada({ indicador_id: IND })];
    base.tablas.indicador_valores!.push({ id: "v0", indicador_id: IND, created_at: "2026-10-09T10:00:00.000Z" });
    expect((await llamar({ action_id: ACCION })).status).toBe(409);
    expect(guardada().estado).toBe("reportado");
    base.tablas.indicador_valores!.push({ id: "v1", indicador_id: IND, created_at: "2026-10-12T10:00:00.000Z" });
    const r = await llamar({ action_id: ACCION });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ verificada: true, estado: "verificado", pruebas: 0 });
    expect(guardada()).toMatchObject({ estado: "verificado", verificado_por: CONSULTORA.id });
  });
});

/**
 * Punto 6: lo que se repite se mide. En el catálogo estaba escrito que "las incidencias son la mina
 * de KPIs" y no había una sola línea que las extrajera.
 */
describe("el medidor: incidencias que se vuelven números", () => {
  it("lleva la guardia contra instrucciones incrustadas, como los demás agentes", () => {
    expect(PROMPT_MEDIDOR.startsWith(GUARDIA)).toBe(true);
  });

  it("prohíbe inventar cuando no hay incidencias contadas", () => {
    expect(PROMPT_MEDIDOR).toMatch(/indicadores: \[\] en vez de inventar/);
  });

  it("exige que el dueño pueda contarlo con lo que YA tiene", () => {
    expect(PROMPT_MEDIDOR).toContain("con lo que YA tiene");
    expect(PROMPT_MEDIDOR).toMatch(/es una tarea mas, no una medicion/);
  });

  it("prohíbe los indicadores de vanidad y la jerga", () => {
    expect(PROMPT_MEDIDOR).toMatch(/vanidad/);
    expect(PROMPT_MEDIDOR).toMatch(/Nunca "KPI", "tasa" ni "ratio"/);
  });

  it("prohíbe inventar metas redondas porque suenan bien", () => {
    expect(PROMPT_MEDIDOR).toMatch(/Nunca inventes una meta redonda/);
  });

  it("el esquema acepta como máximo seis: un tablero de veinte no se mira", () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({
      clave: `x_${i}`, nombre: "Devoluciones del mes", como_se_mide: "contar los reclamos del cuaderno",
      unidad: "numero", mejor_si: "baja", meta_valor: null, meta_texto: null, frecuencia: "mensual", origen_texto: null,
    }));
    expect(SalidaMedidor.safeParse({ indicadores: seis }).success).toBe(true);
    expect(SalidaMedidor.safeParse({ indicadores: [...seis, seis[0]] }).success).toBe(false);
  });

  it("una unidad o frecuencia rara no rompe: cae en el valor por defecto", () => {
    const r = SalidaMedidor.parse({
      indicadores: [{ clave: "a_b", nombre: "Algo", como_se_mide: "se cuenta a mano cada mes", unidad: "bananas", mejor_si: "?", frecuencia: "trimestral", meta_valor: null, meta_texto: null, origen_texto: null }],
    });
    expect(r.indicadores[0]!.unidad).toBe("numero");
    expect(r.indicadores[0]!.mejor_si).toBe("baja");
    expect(r.indicadores[0]!.frecuencia).toBe("mensual");
  });

  it("no acepta un indicador sin explicar cómo se mide", () => {
    const r = SalidaMedidor.safeParse({ indicadores: [{ clave: "a_b", nombre: "Algo", como_se_mide: "x", unidad: "numero", mejor_si: "baja", frecuencia: "mensual", meta_valor: null, meta_texto: null, origen_texto: null }] });
    expect(r.success).toBe(false);
  });
});

describe("el manejador no inventa números de la nada", () => {
  const src = readFileSync(path.join(process.cwd(), "src/lib/jobs/handlers/indicadores.ts"), "utf8");

  it("sin incidencias ni hallazgos no propone nada", () => {
    expect(src).toContain("todavía no hay incidencias ni hallazgos");
  });

  it("los indicadores nacen propuestos, no activos: el dueño decide cuáles adopta", () => {
    expect(src).toContain('estado: "propuesto"');
  });

  it("normaliza la clave y no duplica uno que ya existe", () => {
    expect(src).toContain("normalizarClave");
    expect(src).toContain("existentes.has(clave)");
  });

  it("trata el contenido de la empresa como dato, no como instrucciones", () => {
    expect(src).toContain("comoDato");
  });
});

describe("el periodo que se ofrece anotar", () => {
  it("es siempre un mes cerrado, nunca el mes en curso", () => {
    const ofrecido = mesCerradoMasReciente();
    expect(ofrecido).toBe(ultimosMeses(new Date(), 1)[0]!.periodo);
    const ahora = new Date();
    expect(ofrecido).not.toBe(`${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`);
  });
});
