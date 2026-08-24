# AUDITORÍA DE PRODUCTO — 8X como consultor digital (2026-08-23)

Método: recorrido del deploy real (https://8x-renaser-s-projects.vercel.app) + lectura de todas las pantallas y del pipeline, con cinco lentes: consultor senior, product strategist, UX lead, especialista en sistematización, y empresario que recibe el enlace sin contexto. Clasificación: A no comprende al usuario · B pregunta mal · C pregunta de más · D no profundiza · E no conecta información · F no devuelve valor · G proceso incompleto · H UX confusa · I diseño débil · J bug · K oportunidad de consultoría.

## Veredicto general

El motor (claims con fuente/fecha/estado, contraste, vigencia, fortalezas, know-how, suficiencia, 4P, plan) es sólido y es exactamente lo que un consultor digital necesita por debajo. Pero la experiencia está construida para un flujo operado por el consultor: el empresario que entra solo con un enlace no recibe valor hasta el final, cuenta preguntas en vez de ver comprensión, y el resultado se lee como expediente, no como espejo. **El problema no es técnico: es que el producto guarda su inteligencia para el final.**

## Hallazgos (los 24 principales)

| # | Clase | Dónde | Problema | Corrección |
|---|---|---|---|---|
| 1 | F | Todo el recorrido | El empresario no recibe NADA hasta que el consultor publica resultados. Valor = 0 durante todo el levantamiento. | Niveles de valor: primer espejo con 2-3 hallazgos tempranos apenas hay señal; diagnóstico progresivo. |
| 2 | H/A | `Entrevista.tsx` | "7 respondidas" — contador de cuestionario. Nadie sabe cuánto falta ni qué se comprendió. | Barra de cobertura por áreas de comprensión ("Tu visión ████░ 80%"), no contador. |
| 3 | C/E | Cobertura por bloques | Un bloque solo se cubre respondiendo una pregunta DE ese bloque; una respuesta rica que cubre 4 áreas no cubre nada. Resultado: preguntas de más. | El entrevistador declara qué áreas quedaron cubiertas por lo ya dicho (`bloques_cubiertos`); el código las cierra. |
| 4 | C | Entrevistador | No hay prohibición dura de redundancia semántica ni métrica de ella. | Regla + verificación previa contra respuestas/claims + `redundant_question_count` en telemetría. |
| 5 | D/B | Entrevistador | La repregunta existe como sugerencia, no como método: "ventas están mal" no dispara la desambiguación (¿pocos entran / no compran / no vuelven?). | Reglas de repregunta con ejemplos en el prompt; prioridad a reducir incertidumbre. |
| 6 | A | `/participar`, portal | Entrada fría: "Te vamos a hacer algunas preguntas". No dice qué recibirá ni cuánto toma. | Entrada simple: qué haremos, ~15-20 min para el primer espejo, "puedes hablar, subir fotos, contarnos". |
| 7 | F/K | Portal | El dueño con cuenta no tiene diagnóstico propio: ve "tu consultor está revisando". El producto no funciona sin consultor humano. | "Mi empresa hoy" online: espejo, 4P cualitativo, fortalezas, restricción, plan tentativo, generado por suficiencia, sin esperar publicación manual. |
| 8 | E | Pipeline→Entrevista | El entrevistador ve respuestas y claims, pero no know-how, ni procesos, ni documentos faltantes: no consulta un mapa completo antes de preguntar. | Company Reality Model: contexto agregado único (personas, procesos, Caleta, fuentes, gaps) consultado antes de cada pregunta. |
| 9 | A/K | Vocabulario | "know-how minado", "claims", "suficiencia" se filtran en pantallas del consultor pero la idea no existe para el cliente. | "La Caleta" como concepto de cara al empresario: proteger lo valioso, no extraer secretos. |
| 10 | G/H | `/portal/documentos` | "Sube lo que tengas" sin guía: el empresario no sabe qué existe ni qué importa. | Inventario guiado por bloques (Personas/Procesos/Producto/Marketing/Resultados) con 4 estados: lo tengo / incompleto / no lo tengo / no sé qué es. |
| 11 | G/K | Activos faltantes | "No lo tengo" es un callejón: no se ofrece construirlo. | Faltante → preguntas mínimas → borrador generado → corrige → confirma → entra al modelo. |
| 12 | B | Diagnóstico | Riesgo de leer ausencia de documento como defecto ("sin manual ⇒ mala gestión"). | Regla explícita: ausencia = señal de investigación (¿la función está clara informalmente? ¿funciona?), nunca condena. |
| 13 | G | Procesos cliente | El cliente puede corregir el dibujo pero no CONTAR un proceso desde el portal ni marcar qué querría cambiar. | Contar (voz/texto) → 8X dibuja → confirmar/corregir → `desired_change` por nodo o proceso. |
| 14 | D | Arquitecto | Dibuja lo contado pero no investiga huecos ("escribe y luego paga" → ¿qué pasa en medio? ¿y si nadie responde?). | El arquitecto emite 1 pregunta de mayor valor sobre el gap detectado. |
| 15 | G | AS-IS | No hay estado borrador/por confirmar/confirmado de cara al cliente ("Así entendimos que funciona hoy. ¿Está bien?"). | Confirmación explícita del AS-IS. |
| 16 | F | Resultados | No existe la sección "Lo que quizá no estás viendo" (insight no evidente con evidencia, por qué importa, qué puede estar costando). Es EL momento del producto y no está. | Sección central del resultado, generada desde hallazgos con estructura QUÉ VEMOS/EVIDENCIA/POR QUÉ IMPORTA/QUÉ PODRÍA COSTAR/QUÉ HACER. |
| 17 | F | Resultados | No existe el Espejo (lo que crees / lo que dicen los datos / lo que dice tu equipo / lo que muestran los procesos) aunque el motor de contraste YA produce exactamente eso. | Sección Espejo desde contradicciones y brechas con fuentes. |
| 18 | F | Resultados | No hay restricción principal explícita ni "qué sistematizaría primero". | Ambas secciones desde hallazgos + procesos. |
| 19 | F | Plan | El plan de 45+45 con N acciones es de implementación; el empresario solo necesita primero "Por dónde empezaría" (3-5 prioridades con primer movimiento e indicador). | Plan tentativo como resultado del diagnóstico; el 45+45 queda para la etapa con consultor. |
| 20 | I | Diseño | Botones negros grandes, MAYÚSCULAS en etiquetas, tablas grises: correcto pero duro; no "quiet luxury". | Suavizar: menos peso, menos mayúsculas, más espacio, jerarquía por tipografía, microtransiciones, superficies sutiles. |
| 21 | H | `/portal` | El paso a paso usa numeración interna (2,3,4,5,7,8) con huecos visibles y "Tu implementación: 45 días" antes de tener nada. | Recorrido por niveles de valor, números limpios, lo futuro no se muestra como pendiente eterno. |
| 22 | J | Entrevista (voz) | La respuesta dictada se acumula en el textarea, pero enviada por audio (transcriptor) va directa sin previsualizar en algunos caminos; riesgo de duplicado si se toca dos veces mientras guarda. | Bloqueo de doble envío + siempre previsualizar. |
| 23 | E | Preguntas "ya te lo dije" | Si la persona repite "ya te lo conté", el sistema no reconoce ni recupera. | Regla: reconocer, recuperar la respuesta previa, actualizar cobertura, seguir. |
| 24 | K | Cierre | No hay puente al servicio: tras el valor, ni siquiera un "quiero trabajar este plan" discreto. | Cierre sobrio post-plan tentativo. |

## Qué NO está roto (y no se toca)

Supabase, RLS y frontera cliente/consultor · cola y worker · extracción con fuente/fecha · contraste y vigencia · calibración de evidencia · consolidación · benchmark congelado · canvas React Flow · PWA/deploy.

## Orden de transformación (frentes)

1. **Motor de comprensión** (h. 2,3,4,5,8,23): cobertura semántica por áreas, Company Reality Model, redundancia cero, repregunta.
2. **Valor progresivo** (h. 1,6,7,16,17,18,19,24): entrada simple, primer espejo, "Mi empresa hoy" con Lo-que-no-estás-viendo, Espejo, fortalezas, restricción, qué sistematizar, plan tentativo.
3. **Activos guiados + Caleta** (h. 9,10,11,12): inventario por bloques con 4 estados, construcción de faltantes, Caleta de cara al cliente.
4. **Procesos** (h. 13,14,15): contar/confirmar/desear-cambio, gaps del arquitecto.
5. **Diseño y copy** (h. 20,21,22): quiet luxury, sin contadores, sin jerga, sin "IA".
6. **Prueba de calidad**: 3 empresas sintéticas con problemas escondidos; medir insights, redundancia, falsos hallazgos.

## Estado de la transformación (2026-08-24)

Implementado y desplegado: motor de cobertura de realidad (áreas comprendidas, no contador; cierre semántico `bloques_cubiertos`; repregunta; prohibición de redundancia; contexto con Caleta/procesos/fuentes) · "Mi empresa hoy" (`/portal/hoy`: espejo, lo-que-no-estás-viendo con costo posible, fortalezas, Caleta propia, 4P cualitativo, restricción, qué sistematizar, plan tentativo, suficiencia honesta) · diagnóstico auto-disparado · La Caleta (nombre y preguntas humanas) · inventario guiado de activos con 4 estados (`/portal/activos`) · confirmación del AS-IS + deseo de cambio como evidencia · pregunta de hueco del arquitecto hacia la conversación del dueño · bucle de reparación del auditor (`causa_corregida`) · diseño suavizado.

Prueba de calidad (fase 36): **PASS** — 3 empresas sintéticas (benchmark/prueba-consultor-resultado.json); quedan en la base como demos.

Limitaciones que siguen (honestas): hallazgos parecidos con evidencia distinta pueden aparecer dos veces (consolidación V2 con IA) · la construcción guiada de activos faltantes ("no lo tengo" → borrador generado → corregir → confirmar) hoy deriva a la conversación, no genera el borrador · el detalle por nodo de proceso (qué recibe/entrega/cómo sabemos que está bien) existe en el modelo pero el panel del cliente no lo pide guiado · "ya te lo dije" depende del modelo (regla en prompt, sin test dedicado) · el PDF descargable del informe online no existe (se imprime desde el navegador).
