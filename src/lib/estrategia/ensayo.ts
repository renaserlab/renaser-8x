/**
 * EL ENSAYO DE LA ESTRATEGIA, SIN BASE (spec-estrategia-8x.md §9.4 y §11, tramo 8).
 *
 * Corre el motor de punta a punta en memoria —el paquete y las cuentas congelados desde unas entradas, las dos lentes a
 * la vez, el equipo rojo, UNA reparación si el validador encontró errores, el cierre y la lista de control— con el
 * proveedor de IA que esté puesto, y sin tocar ninguna base: no lee la empresa, no guarda la versión, no anota tokens ni
 * crea preguntas. Mide lo que hace falta para fijar los contratos de los tres agentes (`medido: true`) y
 * TOKENS_POR_ESTRATEGIA: el tiempo de cada llamada, sus tokens de entrada y de salida, por qué terminó cada respuesta, lo
 * que dio la lista de control, lo que 8X quitó y las preguntas que saldrían para el dueño.
 *
 * Es el mismo orden que el manejador de la cola (src/lib/jobs/handlers/estrategia.ts), con sus mismas piezas puras
 * (motor.ts, pedidos.ts) y su misma lectura de las fallas (`fallaQueNoSeReintenta`), sin la cola ni la base. Lo usa
 * scripts/estrategia/ensayo-vivo.mts con el proveedor real; tests/estrategia-ensayo.test.ts lo corre con uno falso.
 *
 * Lo que no se sabe no se inventa: si el proveedor no dice por qué terminó una respuesta, `fin` queda null; si una
 * llamada falló, sus tokens quedan null (no cero).
 */
import { AIProviderPausedError } from "@/lib/ai";
import { correrLenteDinero } from "@/lib/ai/agents/lente-dinero";
import { correrLenteTerreno } from "@/lib/ai/agents/lente-terreno";
import { correrEquipoRojo } from "@/lib/ai/agents/equipo-rojo";
import { fallaQueNoSeReintenta } from "@/lib/jobs/handlers/estrategia";
import type { CompleteResult } from "@/lib/ai/provider";
import { conIds, LETRA_DE_LENTE, refsDeEstrategia, type CaminoFinal, type Estrategia, type Quitado } from "./armar";
import type { Calculos } from "./calculos";
import { jugadasEnPalabras, nombreCamino, refsParaPantalla } from "./pantalla";
import { textoPintado } from "./texto";
import { armarYValidar, cerrarEstrategia, materialEquipoRojo, materialLente, proyectarLentes, TOKENS_POR_ESTRATEGIA } from "./motor";
import { congelar } from "./generar";
import { minimoParaEstrategia, type EntradasPaquete, type Paquete } from "./paquete";
import { pedidosDesdeFaltantes } from "./pedidos";
import { PRESUPUESTO_TOKENS, type SalidaEquipoRojo, type SalidaLenteDinero, type SalidaLenteTerreno } from "./esquemas";
import { MOTOR } from "./textos";
import type { ResultadoControl } from "./calidad";

/** Si una etapa pasa de esto, se recortan los topes del esquema antes de seguir; no se sube el plazo (§5.1, §5.2). */
export const LIMITE_ETAPA_MS = 90_000;

export type EtapaEnsayo = "dinero" | "terreno" | "rojo" | "reparacion";
export type AgenteEnsayo = keyof typeof PRESUPUESTO_TOKENS;

export type LlamadaEnsayo = {
  etapa: EtapaEnsayo;
  agente: AgenteEnsayo;
  ms: number;
  ok: boolean;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  /** El presupuesto de salida del contrato del agente (el que impone el proveedor). */
  presupuesto: number;
  modelo: string | null;
  intentos: number | null;
  /** Por qué terminó la respuesta, como lo dijo el proveedor; null si no lo dijo. «MAX_TOKENS» si salió cortada. */
  fin: string | null;
  /** Si falló, en palabras: lo mismo que leería la consultora en la pantalla. */
  motivo: string | null;
};

export type InformeEnsayo = {
  /** Lo que falta del mínimo para generar (§3.6). Si no está vacío, no se llamó al modelo. */
  falta_para_generar: string[];
  llamadas: LlamadaEnsayo[];
  /** «lista» o «con_observaciones» como quedaría la versión; «fallida» si una etapa no salió (y cuál). */
  estado: "lista" | "con_observaciones" | "fallida" | "sin_generar";
  fallo: { etapa: EtapaEnsayo; motivo: string } | null;
  /** Las etapas que pasaron de LIMITE_ETAPA_MS y las que salieron cortadas por tamaño. */
  lentas: EtapaEnsayo[];
  cortadas: EtapaEnsayo[];
  tokens: { entrada: number; salida: number; total: number; previsto: number };
  validador: { errores: number; avisos: number } | null;
  quitado: Quitado[];
  control: ResultadoControl[];
  preguntas: string[];
  secciones: string[];
  recortes: Paquete["recortes"];
  /** Lo principal en palabras y con las cifras escritas, como lo leería la consultora: para leerlo contra la vara. */
  para_leer: ParaLeer | null;
  estrategia: Estrategia | null;
};

export type ParaLeer = {
  lectura: string[];
  gran_apuesta: string;
  recomendado: string;
  caminos: { letra: "a" | "b"; nombre: string; filosofia: string; a_90_dias: string; jugadas: string[]; casos: string[] }[];
  victorias: string[];
};

/** La estrategia en palabras, con sus cifras pintadas (sin ids): la lectura, la apuesta, los dos caminos y las victorias. */
export function paraLeer(e: Estrategia, paquete: Paquete, calculos: Calculos): ParaLeer {
  const refs = refsParaPantalla(e, refsDeEstrategia(e, paquete, calculos));
  const t = (texto: string, c?: Pick<CaminoFinal, "jugadas">) => {
    const pintado = textoPintado(texto, refs, "consultora");
    return c ? jugadasEnPalabras(pintado, c) : pintado;
  };
  return {
    lectura: e.lectura.map((x) => t(x)),
    gran_apuesta: t(e.gran_apuesta.frase),
    recomendado: `${nombreCamino(e.recomendado.camino)}: ${t(e.recomendado.por_que, e.caminos[e.recomendado.camino])}`,
    caminos: (["a", "b"] as const).map((l) => {
      const c = e.caminos[l];
      return {
        letra: l,
        nombre: c.nombre,
        filosofia: t(c.filosofia, c),
        a_90_dias: t(`{{R:${l}.total.d90}}`, c),
        jugadas: c.jugadas.map((j, i) => `${i + 1}. ${t(j.que_se_mueve, c)} — el mercado: ${t(j.respuesta_del_mercado, c)}`),
        casos: c.casos.map((k) => `Caso: ${t(k.caso, c)} → Lo que haremos: ${t(k.solucion, c)}`),
      };
    }),
    victorias: e.victorias_14_dias.map((v) => `${t(v.que)} (${v.responsable}, desde el día ${v.desde_dia})`),
  };
}

type Opciones = { reloj?: () => number };

/** La falla de una llamada, en palabras y con su tipo: la misma lectura que el manejador de la cola. */
function leerFalla(e: unknown): { motivo: string; cortada: boolean } {
  const f = fallaQueNoSeReintenta(e);
  if (f) return { motivo: f.motivo, cortada: f.tipo === "cortada" };
  if (e instanceof AIProviderPausedError) return { motivo: MOTOR.en_pausa, cortada: false };
  return { motivo: e instanceof Error ? e.message : String(e), cortada: false };
}

export async function ensayarEstrategia(entradas: EntradasPaquete, hoy: Date, opciones: Opciones = {}): Promise<InformeEnsayo> {
  const reloj = opciones.reloj ?? Date.now;
  const { paquete, calculos } = congelar(entradas, hoy);
  const llamadas: LlamadaEnsayo[] = [];
  const informe = (resto: Partial<InformeEnsayo> & Pick<InformeEnsayo, "estado">): InformeEnsayo => {
    const hechas = llamadas.filter((l) => l.ok);
    const entrada = hechas.reduce((s, l) => s + (l.tokens_entrada ?? 0), 0);
    const salida = hechas.reduce((s, l) => s + (l.tokens_salida ?? 0), 0);
    return {
      falta_para_generar: [],
      llamadas,
      fallo: null,
      lentas: llamadas.filter((l) => l.ms > LIMITE_ETAPA_MS).map((l) => l.etapa),
      cortadas: llamadas.filter((l) => l.fin === "MAX_TOKENS").map((l) => l.etapa),
      tokens: { entrada, salida, total: entrada + salida, previsto: TOKENS_POR_ESTRATEGIA },
      validador: null,
      quitado: [],
      control: [],
      preguntas: [],
      secciones: [],
      recortes: paquete.recortes,
      para_leer: null,
      estrategia: null,
      ...resto,
    };
  };

  // Antes de gastar: el mismo mínimo que la ruta (§3.6). Sin él, no se llama al modelo.
  const falta = minimoParaEstrategia(paquete);
  if (falta.length) return informe({ estado: "sin_generar", falta_para_generar: falta });

  /** Una llamada medida: su tiempo, sus tokens y por qué terminó; si falla, su motivo (y nunca se relanza). */
  async function medir<T>(etapa: EtapaEnsayo, agente: AgenteEnsayo, correr: () => Promise<CompleteResult<T>>): Promise<T | null> {
    const t0 = reloj();
    try {
      const r = await correr();
      llamadas.push({ etapa, agente, ms: reloj() - t0, ok: true, tokens_entrada: r.tokens_entrada, tokens_salida: r.tokens_salida, presupuesto: PRESUPUESTO_TOKENS[agente], modelo: r.modelo, intentos: r.intentos, fin: r.fin ?? null, motivo: null });
      return r.data;
    } catch (e) {
      const f = leerFalla(e);
      llamadas.push({ etapa, agente, ms: reloj() - t0, ok: false, tokens_entrada: null, tokens_salida: null, presupuesto: PRESUPUESTO_TOKENS[agente], modelo: null, intentos: null, fin: f.cortada ? "MAX_TOKENS" : null, motivo: f.motivo });
      return null;
    }
  }

  // Las dos lentes a la vez, cada una con el mismo material y nada de la otra.
  const [dineroCrudo, terrenoCrudo] = await Promise.all([
    medir<SalidaLenteDinero>("dinero", "lente_dinero", () => correrLenteDinero(materialLente("dinero", paquete, calculos))),
    medir<SalidaLenteTerreno>("terreno", "lente_terreno", () => correrLenteTerreno(materialLente("terreno", paquete, calculos))),
  ]);
  // Una lente que no salió deja sin equipo rojo, como en la cola: nunca se muestra un camino solo como si fuera la estrategia.
  for (const [etapa, salida] of [["dinero", dineroCrudo], ["terreno", terrenoCrudo]] as const) {
    if (!salida) return informe({ estado: "fallida", fallo: { etapa, motivo: llamadas.find((l) => l.etapa === etapa)?.motivo ?? "" } });
  }
  const dinero = conIds(dineroCrudo!, LETRA_DE_LENTE.dinero);
  const terreno = conIds(terrenoCrudo!, LETRA_DE_LENTE.terreno);
  const proyecciones = proyectarLentes(paquete, calculos, dinero, terreno);
  const base = { paquete, calculos, dinero, terreno };

  const primera = await medir<SalidaEquipoRojo>("rojo", "equipo_rojo", () => correrEquipoRojo(materialEquipoRojo({ ...base, proyecciones })));
  if (!primera) return informe({ estado: "fallida", fallo: { etapa: "rojo", motivo: llamadas.find((l) => l.etapa === "rojo")?.motivo ?? "" } });

  // Una sola reparación, con lo que rechazó el validador. Si no sirve, se cierra con la primera quitando lo inválido.
  const { validacion } = armarYValidar({ ...base, rojo: primera });
  let final = primera;
  let quitar = false;
  if (validacion.errores.length) {
    quitar = true;
    const reparada = await medir<SalidaEquipoRojo>("reparacion", "equipo_rojo", () =>
      correrEquipoRojo(materialEquipoRojo({ ...base, proyecciones, reparacion: { anterior: primera, violaciones: validacion.errores } }))
    );
    if (reparada) final = reparada;
  }
  const cierre = cerrarEstrategia({ ...base, rojo: final }, { quitar });
  const pedidos = pedidosDesdeFaltantes(cierre.estrategia, paquete, 1);
  return informe({
    estado: cierre.estado,
    validador: { errores: cierre.validacion.errores.length, avisos: cierre.validacion.avisos.length },
    quitado: cierre.estrategia.quitado,
    control: cierre.calidad,
    preguntas: pedidos.preguntas.map((p) => p.texto),
    secciones: pedidos.secciones.map((s) => s.linea),
    para_leer: paraLeer(cierre.estrategia, paquete, calculos),
    estrategia: cierre.estrategia,
  });
}
