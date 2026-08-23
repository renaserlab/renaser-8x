# 8X V1 — TRAZABILIDAD (objetivo → código → prueba)

Complementa `MATRIZ_TRAZABILIDAD.md` (98 filas por capítulo). Aquí: los 20 objetivos de V1 del pedido.

| # | Objetivo V1 | Código | Prueba | Estado |
|---|---|---|---|---|
| 1 | Recibir una empresa | `api/companies` (+ invitación del dueño, refresh de stats), admisión con 6 preguntas | `p0-schema`, revisión | PASS |
| 2 | Escuchar profundamente al dueño | `rules/cobertura.ts` (6 bloques, 23 preguntas), `handlers/entrevista.ts` (no cierra sin cubrir), prompt ENTREVISTADOR, patrón `sueno_vs_empresa` en DIAGNOSTICADOR con las respuestas del sueño en contexto | `fase1` › cobertura; `demo-auditoria` › INTERVIEW OWNER; `knowhow` › sesgos | PASS |
| 3 | Escuchar al equipo | roles dueno/socio/lider/empleado/consultor/cliente; bancos `lider` y `personal` (21 preguntas); sesión propia por token; claims confirmados por quien los dijo; anonimato hacia el dueño (RLS + rutas + nombres vaciados) | `fase1`, `p0-sesiones`, `p0-frontera`, `demo-auditoria` › STAFF | PASS |
| 4 | Documentos, fotos, datos y voz | `archivos.ts` (whitelist), `extraer.ts` (texto, CSV con fila/columna, PDF por páginas, imagen, audio con segmentos), `BotonGrabar` (Web Speech sin llave) | `fase1` › archivos, evidencia por formato | PASS (audio subido requiere OPENAI_API_KEY) |
| 5 | Know-how no escrito | `know_how` completo (rol, proceso, nodo, criterio, criticidad, documentado, sop_id), MINERO, enlace a SOP, hallazgo si vacío | `fase1` › know-how, `demo-auditoria` › MINE | PASS |
| 6 | Reconstruir la realidad | `claims` + `source_fragments` + `claim_relations`; Matriz de Realidad / El Espejo | `flujo-demo`, `demo-auditoria` | PASS |
| 7 | Contrastar fuentes | `rules/contradiccion.ts` + CONTRASTADOR (relación: contradicts/updates/supports/explains/depends_on); brechas mecánicas | `contradiccion`, `fase1` › relaciones | PASS |
| 8 | Detectar contradicciones | ídem + resolución por el dueño con 3 botones; lo validado no se pisa | `flujo-demo` §4–6 | PASS |
| 9 | Encontrar lo que el dueño no vio | contraste dueño/equipo/datos; DIAGNOSTICADOR con dimensiones, lentes y `preguntas_pendientes` que vuelven al levantamiento; benchmark exige detectar "fruta pasada ↔ Rosa" | `demo-auditoria` › AUDITORÍA (cobertura 1.0) | PASS (simulado) |
| 10 | Diagnosticar las 4P | por pilar, bloqueado con contradicciones, DESCONOCIDO honesto, consolidación cross-pilar | `evidencia`, `demo-auditoria` | PASS |
| 11 | Propósito, Sabiduría, Excelencia | schema con sub-preguntas, `aplicarFiltros`, prompt, /methodology, tests | `evidencia` › filtros, `metodologia`, `fase1` | PASS |
| 12 | Evidencia exacta | página/sección/celda/minuto/respuesta; `VerFuente` resalta; fuerza STRONG/MEDIUM/WEAK; `requiere_validacion` | `fase1`, `p0-frontera` | PASS |
| 13 | AS-IS | ARQUITECTO + canvas + avisos estructurales + guardado atómico | `grafo`, `p0-canvas` | PASS |
| 14 | TO-BE | `handleGenerarToBe` con hallazgos + know-how; cambios justificados; `padre_id` | `grafo` › diff, `demo-auditoria` | PASS |
| 15 | KEEP/IMPROVE/REPLACE/REMOVE/CREATE | nodo y hallazgo; remove con dependientes avisa; create sin justificación marcado | `grafo` | PASS |
| 16 | HUMAN/SOFTWARE/AI/HYBRID | `ejecutor` pinta el nodo; reglas de automatización; mapa de automatización como entregable; `agent_specs` preparado | `grafo` › automatizacionesInvalidas | PASS |
| 17 | Plan de intervención | PLANIFICADOR + `rules/plan.ts` (3/semana, huérfanos fuera); 45+45 con cortes y regresiones→hallazgos | `plan`, `demo-auditoria` › PLAN | PASS |
| 18 | El consultor sabe qué hacer | Bandeja: fallidos, por revisar, contradicciones, vencidos, escalado 2 semanas, corte vencido, suficiencia ("le falta X para diagnosticar"), listo para El Espejo | revisión (`bandeja.ts`) | PASS |
| 19 | Poca alfabetización digital | voz, fotos, 3 botones, una pregunta por pantalla, 17 px, 44 px, etiquetas, vocabulario traducido, sin "IA" visible | `visual` | PASS (verificación con personas: BLOCKED) |
| 20 | 30 empresas sin mezclar ni bloquear | cola con prioridad, fairness, tope global, heartbeat, dead letter; RLS; simulación 2.010 jobs | `carga-30`, `p0-schema` | PASS (simulado) |
