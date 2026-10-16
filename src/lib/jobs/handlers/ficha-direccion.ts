import { supabaseAdmin } from "@/lib/supabase/admin";
import { ai, AIProviderPausedError } from "@/lib/ai";
import { GUARDIA, comoDato } from "@/lib/rules/patrones";
import { registrarLlamada } from "@/lib/db/queries";
import { progreso } from "@/lib/jobs/queue";
import {
  prepararBorrador, actualizarBorrador, incorporarInterpretaciones, marcarInterpretacionesPendientes, contextoParaDirector,
  fuentesCitables, hayMaterialParaInterpretar, BorradorCambio, SalidaDirector, TEXTO_ASISTENTE_EN_PAUSA, BLOQUES_FICHA, NOMBRE_BLOQUE, DIMENSIONES_DEPENDENCIA,
} from "@/lib/ficha-direccion";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

const INTERPRETABLES = BLOQUES_FICHA.filter((b) => b !== "distancia");

/**
 * EL DIRECTOR. Lee la Ficha de Dirección que el código ya armó con lo que el dueño declaró, y propone lo que la
 * consultora podría leer entre líneas: interpretaciones por bloque, cada una colgada de las declaraciones que la
 * sostienen. Y describe la dependencia de la empresa respecto del dueño en ocho dimensiones.
 *
 * Lo que NO hace, y el código se lo impide además de pedírselo: no inventa datos (cada cita se comprueba contra
 * las fuentes reales y lo que no existe se descarta), no da porcentajes ni índices de dependencia (el esquema no
 * tiene dónde ponerlos y el texto que los trae se descarta, sea de una dimensión o de la interpretación de un
 * bloque), no juzga a la persona (describe qué pasa en la empresa, no cómo es el dueño). Lo que propone entra
 * como interpretación sin revisar: la consultora lo da por bueno, lo corrige o lo quita antes de acordar.
 *
 * Qué está probado: el contrato, los filtros y el guardado, con un proveedor doble (tests/ficha-direccion.test.ts).
 * Que el modelo real obedezca este prompt NO está probado: nunca se corrió contra él.
 */
export const PROMPT_DIRECTOR = `${GUARDIA}

Lees la Ficha de Direccion Empresarial de una empresa pequena, armada con lo que el DUENO declaro, y propones
INTERPRETACIONES para que la consultora las revise. Tu lector es una consultora, no el dueno: ella decide que
entra y que no. Nada de lo que escribes es definitivo.

Devuelve JSON { "interpretaciones": [...], "dependencia": {...} }.

INTERPRETACIONES (maximo 30, mejor pocas y bien sostenidas). Cada una:
- bloque: uno de ${INTERPRETABLES.join(" | ")}
  (${INTERPRETABLES.map((b) => `${b} = ${NOMBRE_BLOQUE[b]}`).join("; ")})
- texto: lo que se puede leer de lo declarado, en una o dos frases, en castellano llano y sin jerga. Empieza
  por lo que dice la evidencia, no por un consejo. Nunca "debe", "tiene que" ni recetas.
- claim_ids: los ids EXACTOS de las declaraciones que sostienen esa lectura, copiados del material (con su
  prefijo claim:, respuesta:, metrica:, empresa: o consultor:). Una interpretacion sin claim_ids no vale; una
  con un id que no esta en el material se descarta.

DEPENDENCIA. Ocho dimensiones, todas presentes: ${DIMENSIONES_DEPENDENCIA.join(", ")}. Cada una con:
- que_se_detiene: que deja de pasar en la empresa si el dueno no esta, segun lo que el mismo conto. Si no hay
  nada declarado, null.
- podria_delegarse: que de lo que hoy hace el dueno podria hacer alguien del equipo, SOLO si el material lo
  sugiere (por ejemplo, el mismo dijo "eso podria hacerlo mi encargada"). Si no, null.
- capacidad_falta: que capacidad no existe hoy en la empresa para que eso se delegue, si el material lo dice. Si no, null.
- aporta_valor: donde la participacion del dueno es valiosa y no una dependencia a corregir (la relacion con
  un cliente clave, un criterio que solo el tiene). Si no hay nada, null.
- evidencia: ids del material que sostienen lo dicho.
- sin_evidencia: true cuando no hay ids que citar. Entonces evidencia va vacia y los cuatro textos van en null.

REGLAS QUE NO SE ROMPEN:
- NUNCA un porcentaje, indice, nota ni nivel de dependencia. El conteo de procesos viene hecho en codigo y es
  un dato descriptivo ("participa en 6 de 8"); no lo conviertas en medida ni lo recalcules.
- Esto vale para TODO lo que escribes, tambien para las interpretaciones de bloque: ningun texto tuyo lleva
  porcentajes ni indices. Los numeros de la ficha los pone el codigo; un texto que los trae se descarta.
- NUNCA juicios sobre la persona: ni "controlador", ni "no sabe delegar", ni "lider ausente". Describes que
  ocurre en la empresa, no como es el dueno.
- NADA SE INVENTA. Si el material no dice algo, no lo dices tu. Un hueco honesto vale mas que una frase
  plausible. No cites ids que no esten en la lista de ids citables.
- Una respuesta marcada (certeza: no_lo_se) dice que el dueno no lo sabe: no la uses como si afirmara algo.
- No repitas la declaracion como si fuera interpretacion: interpretar es decir que se desprende de ella.
- Lo marcado como (calculo) ya es un resultado del sistema: puedes apoyarte en el, no reescribirlo.

Devuelve solo el JSON.`;

/** La valla va aqui, donde nace el mensaje: el material de la empresa llega acotado, siempre. */
export async function correrDirector(contexto: string) {
  return ai().complete({
    system: PROMPT_DIRECTOR,
    user: comoDato("FICHA DE DIRECCION Y SU EVIDENCIA", contexto),
    schema: SalidaDirector,
    priority: "batch",
    maxTokens: 3000,
    agente: "director",
  });
}

export const MOTIVO_BORRADOR_REEMPLAZADO =
  "el borrador se acordó o se reemplazó mientras el asistente leía: sus propuestas no se guardaron. Pídelas de nuevo sobre el borrador de trabajo";

/**
 * EL TRABAJO. Primero lo determinista: se arma el borrador con lo que hay y SE GUARDA, respetando lo que la
 * consultora ya revisó. Solo después se le pide al asistente. Si el proveedor está sin crédito, el borrador ya
 * quedó guardado y la ficha lo dice («interpretaciones pendientes: asistente en pausa»); el error se relanza para
 * que el worker devuelva el trabajo a la cola sin consumir intento, y al volver el crédito se completa solo.
 *
 * EL MODELO TARDA, Y MIENTRAS TANTO LA CONSULTORA SIGUE TRABAJANDO. Lo que el asistente devuelve NO se escribe
 * sobre la ficha que se leyó antes de llamarlo: se vuelve a leer el borrador y las propuestas se incorporan sobre
 * lo que haya en ese momento, comprobando la revisión al guardar (`actualizarBorrador`). Lo que ella corrigió,
 * añadió, quitó o dio por bueno mientras tanto se conserva. Si el borrador ya no es el vigente (lo acordó), no
 * se escribe nada y el resultado lo dice.
 */
export async function handleFichaDireccion(job: Job) {
  const sb = supabaseAdmin();
  const actor = typeof job.payload.actor_id === "string" ? job.payload.actor_id : null;

  await progreso(job.id, "Armando la ficha con lo que el dueño ya contó");
  const { id, version, ficha, borrador } = await prepararBorrador(job.company_id, sb, { creadaPor: actor });

  if (!hayMaterialParaInterpretar(ficha)) {
    return { ficha_id: id, version, interpretaciones: 0, descartadas: 0, motivo: "todavía no hay declaraciones del dueño que interpretar" };
  }

  const fuentes_validas = fuentesCitables(ficha, borrador.evidencia.fuentes_validas);
  const contexto = contextoParaDirector({ ficha, empresa: borrador.empresa, fuentes_validas });
  await progreso(job.id, "Leyendo las declaraciones para proponer interpretaciones");
  let r;
  try {
    r = await correrDirector(contexto);
  } catch (e) {
    if (e instanceof AIProviderPausedError) {
      // La pausa se anota sobre el borrador de AHORA, no sobre el que se leyó antes de llamar. Si ya no es el
      // vigente no hay dónde anotarla. Y si anotarla falla por otra cosa, se deja escrito pero NO tapa la pausa:
      // el worker tiene que recibirla para devolver el trabajo a la cola sin consumir intento.
      try {
        await actualizarBorrador(job.company_id, id, sb, (actual) => marcarInterpretacionesPendientes(actual, TEXTO_ASISTENTE_EN_PAUSA));
      } catch (fallo) {
        if (!(fallo instanceof BorradorCambio)) console.error(`[job ficha_direccion ${job.id}] no se pudo anotar la pausa en la ficha: ${fallo instanceof Error ? fallo.message : String(fallo)}`);
      }
    }
    throw e;
  }
  // Lo que no se registra no existe para la torre.
  await registrarLlamada(job.company_id, job.id, "director", r);

  // El cambio puede aplicarse más de una vez si otro guardado se adelanta: cuenta lo de la última, que es la que quedó.
  const ultima: { incorporacion: ReturnType<typeof incorporarInterpretaciones> | null } = { incorporacion: null };
  try {
    await actualizarBorrador(job.company_id, id, sb, (actual) => {
      // Sobre el borrador recién leído: con sus frases de ahora y las fuentes que ella haya anotado mientras tanto.
      ultima.incorporacion = incorporarInterpretaciones(actual, r.data, fuentesCitables(actual, borrador.evidencia.fuentes_validas));
      return ultima.incorporacion.ficha;
    });
  } catch (e) {
    if (e instanceof BorradorCambio && e.causa === "reemplazado") {
      return { ficha_id: id, version, interpretaciones: 0, descartadas: 0, motivo: MOTIVO_BORRADOR_REEMPLAZADO };
    }
    throw e;
  }
  const hecho = ultima.incorporacion;
  return { ficha_id: id, version, interpretaciones: hecho?.incorporadas ?? 0, descartadas: hecho?.descartadas ?? 0, descartes: hecho?.descartes ?? [] };
}
