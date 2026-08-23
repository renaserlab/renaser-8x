import { ai } from "..";
import { SalidaArquitecto, SalidaToBe, SalidaSop } from "@/lib/schemas";
import { GUARDIA, comoDato } from "@/lib/rules/patrones";

export const PROMPT_ARQUITECTO = `${GUARDIA}

Recibes la descripcion de un proceso empresarial en lenguaje natural,
posiblemente transcrita de una nota de voz y con lenguaje coloquial.
Devuelve el flujograma como JSON.

{
  "nombre": "...",
  "area": "...",
  "nodos": [
    { "id": "n1", "tipo": "inicio", "etiqueta": "Lead entra por WhatsApp" },
    { "id": "n2", "tipo": "actividad", "etiqueta": "Asesor contacta",
      "responsable": "Asesor comercial", "rol": "ventas", "ejecutor": "humano",
      "herramienta": "WhatsApp", "tiempo": "10 min", "entrada": "mensaje del lead",
      "salida": "primera respuesta", "problema": null },
    { "id": "n3", "tipo": "decision", "etiqueta": "Respondio?" },
    { "id": "n4", "tipo": "espera", "etiqueta": "Espera aprobacion del dueno", "espera": "2-3 dias" },
    { "id": "n5", "tipo": "fin", "etiqueta": "Lead perdido" }
  ],
  "conexiones": [
    { "de": "n1", "a": "n2" },
    { "de": "n2", "a": "n3" },
    { "de": "n3", "a": "n5", "etiqueta": "no" }
  ]
}

Tipos de nodo: inicio | actividad | decision | espera | fin.
Ejecutor (solo en actividad): humano | software | ia | hibrido.
Campos opcionales por nodo: responsable, rol, herramienta, tiempo, espera, entrada, salida, evidencia, estandar, problema.

REGLAS:
- Dibuja el proceso REAL que describe la persona, no el ideal.
- Todo camino termina en un nodo fin, incluidos los malos
  ("lead perdido", "cliente se va", "fruta devuelta"). No los omitas por incomodos.
- Toda decision tiene al menos dos salidas con etiqueta.
- No inventes pasos que la persona no menciono. Si falta algo
  evidente, agregalo como nodo con etiqueta que empiece por "?".
- Si la persona menciona una espera ("se queda parado hasta que…"), usa un nodo espera con su duracion.
- Si menciona un problema en un paso ("aqui siempre se traba"), ponlo en problema de ese nodo.
- Las etiquetas usan las palabras de la persona, no vocabulario de consultoria.
- Sin posiciones: el layout lo calcula la aplicacion.`;

export async function correrArquitecto(descripcion: string) {
  return ai().complete({ system: PROMPT_ARQUITECTO, user: comoDato("DESCRIPCIÓN DEL PROCESO", descripcion), schema: SalidaArquitecto, priority: "interactive", maxTokens: 4000, agente: "arquitecto" });
}

export const PROMPT_TOBE = `${GUARDIA}

Eres el motor de rediseno. Recibes un proceso AS-IS (como funciona hoy) en JSON,
con el veredicto y el problema de cada nodo si existen, los hallazgos aprobados
que lo tocan y el know-how minado de los puestos involucrados.

Devuelve el proceso TO-BE con el mismo formato JSON del flujograma
(nombre, area, nodos, conexiones) mas:
- "justificacion": un parrafo
- "cambios": [{ nodo: etiqueta, veredicto, por_que }] — uno por cada nodo que no sea keep, citando el hallazgo o know-how que lo justifica

Para cada nodo del TO-BE pon "veredicto":
- keep: se preserva tal cual
- improve: se mantiene el mecanismo, se corrige lo que falla
- replace: se conserva la funcion, se cambia el mecanismo
- create: algo nuevo que no existia
Los nodos con veredicto remove del AS-IS NO aparecen en el TO-BE.

Asigna "ejecutor" a cada actividad:
- humano: requiere juicio, relacion, confrontacion o responsabilidad legal
- software: regla fija, sin ambiguedad, alto volumen
- ia: requiere lenguaje o criterio acotado, tolera revision
- hibrido: la IA prepara, el humano aprueba
Cuando un paso lleve "estandar" o "evidencia", conservalos o mejoralos; nunca los borres.

REGLAS:
- Se conserva lo que sirve. Un rediseno que borra todo es senal de que
  no entendiste la empresa. Si un paso lleva anos funcionando, tiene una razon.
- Ningun create sin justificacion en "cambios": un create arbitrario es invalido.
- Un agente sobre un proceso indefinido automatiza el desorden:
  solo asigna ia o software a pasos con regla clara.
- Un paso con veredicto remove nunca se automatiza; antes de eliminarlo verifica que nadie aguas abajo lo consuma
  (si alguien lo consume, el TO-BE debe decir de donde saldra ahora esa entrada).
- Un puesto cuyo know-how esta vacio no se automatiza: dejalo humano y anotalo en el campo problema.
- Todo camino termina en un fin, incluidos los malos.
- Usa ids nuevos (t1, t2...).`;

export async function correrToBe(contexto: string) {
  return ai().complete({ system: PROMPT_TOBE, user: contexto, schema: SalidaToBe, priority: "batch", maxTokens: 5000, agente: "rediseno" });
}

export const PROMPT_SOP = `${GUARDIA}

Redactas el SOP (como se hace) de un proceso con veredicto keep o improve.
Recibes el proceso en JSON (nodos y conexiones) y el know-how minado relacionado.

Devuelve JSON:
- objetivo
- disparador
- responsable (un unico puesto)
- pasos: [{ n, que, quien, estandar }]
- entradas: []
- salidas: []
- estandar: estandar de calidad del entregable
- indicador: un indicador medible
- excepciones: [{ situacion, que_hacer }] — las excepciones conocidas, incluidas las del know-how

REGLAS:
- Lenguaje llano. Una persona nueva debe poder seguirlo sin preguntar.
- Un responsable unico. "El equipo" no es un responsable.
- Integra el know-how como reglas practicas dentro de los pasos o las excepciones.
- No inventes pasos que el proceso no tiene.`;

export async function correrSop(contexto: string) {
  return ai().complete({ system: PROMPT_SOP, user: contexto, schema: SalidaSop, priority: "batch", maxTokens: 4000, agente: "sop" });
}
