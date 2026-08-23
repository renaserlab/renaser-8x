# AUDITORÍA ADVERSARIAL DE LA IMPLEMENTACIÓN — 8X

Objeto: el código en este repositorio (7.191 líneas en `src/`, 129 archivos TS/TSX, `supabase/schema.sql`), no el documento de especificación.
Método: lectura adversarial archivo por archivo, grep de patrones sospechosos, extracción de reglas a módulos puros y 87 tests locales con un fixture de empresa completa (`tests/fixtures/empresa-demo.ts`). Sin Supabase, sin llamadas a IA, sin navegador.

Documentos hermanos: `MATRIZ_TRAZABILIDAD.md` (requerimiento → archivo), `RIESGOS_P0_P1_P2.md` (42 riesgos), `TEST_REPORT.md`, `SUPABASE_READINESS.md`.

---

## 1. Veredicto en una línea

Existe una base real y coherente (esquema, cola, 9 agentes, reglas mecánicas, 31 rutas, 2 interfaces), pero **no es utilizable todavía**: 6 defectos P0 (4 de seguridad en RLS/RPC, 1 funcional en el canvas, 1 de privacidad en API) y 20 P1 que vacían partes de la metodología (la voz del equipo no entra al diagnóstico; el sueño del dueño no tiene cobertura garantizada; la validación de procesos no existe en runtime).

---

## 2. Inventario de implementaciones falsas o débiles (punto 2 del pedido)

Resultado del barrido (`grep -rn` sobre `src/`, `worker/`, `supabase/`):

| Categoría | Hallazgo | Archivo:línea | Gravedad |
|---|---|---|---|
| TODO / FIXME | **0** | — | — |
| Mocks / fixtures en producción | 0 en `src/`. Los únicos fixtures están en `tests/fixtures/` y no se importan desde `src/`. | — | — |
| Arrays hardcodeados | `PREGUNTAS` de admisión (6, son las del spec) · `PASOS` del portal · `TABS` · `ROLES` (4 de 6 roles del check) · `TIPOS_DOC` (3 de 7 entregables redactados por IA) · `ESTADOS` | `empresas/nueva/page.tsx`, `portal/page.tsx`, `empresa/[id]/layout.tsx`, `Participantes.tsx`, `handlers/plan.ts`, `MatrizRealidad.tsx` | P2 (son catálogos, no datos) |
| Datos ficticios | 0 | — | — |
| Constantes mágicas | `MIN_CONFIRMADAS=5`, `.slice(0,20)` validaciones, `.slice(0,60)` pares, `DIAS_TRABADA=5`, `tope_tokens 2_000_000`, `LEASE 10`, `confirmadas >= 20`, `.slice(0,40)` claims al entrevistador, `.slice(-30)` respuestas ajenas, `.slice(0,60)` confirmadas al redactor | `diagnostico.ts:10`, `validar/page.tsx:34`, `contradiccion.ts:44`, `bandeja.ts:6,37`, `schema.sql`, `worker.ts:29`, `entrevista.ts:44-46`, `plan.ts:78` | P2-09 |
| Botones sin acción | 0. Todos los `<button>` tienen `onClick` o están en `<form>`. | — | — |
| Links falsos | `/empresas` y `/casos` existen ✔. `Link` a `/empresa/[id]/diagnostico?pilar=` ✔. | — | — |
| Rutas que responden pero no hacen el trabajo | `POST /api/processes/generate` con `descripcion: "(vacío)"` (botón "Empezar en blanco") **encola una llamada de IA con un texto vacío** para crear un proceso en blanco | `ProcesosLista.tsx:29` | P2 (gasta tokens) |
| Componentes solo visuales | `Comparada.tsx` es solo lectura por diseño ✔. `LeyendaEjecutor` ✔. Ninguno finge una feature. | — | — |
| Funciones vacías / muertas | `AnthropicProvider.speak()` (sin llamadas) · `preguntaDeVigencia()` (sin llamadas) · `brechasEstrategicas()` (**regla del spec 8.1 implementada y nunca invocada**) · `pedirSiguiente` usada ✔ | `anthropic.ts:68`, `vigencia.ts:55`, `contradiccion.ts:51` | P2-07 / STUB |
| console.* | 7, todos en `worker.ts`/`api.ts`/`worker/index.ts` (logs de operación, intencionales). 0 en componentes. | — | — |
| catch que silencian | `refrescarStats().catch(()=>{})` (worker, aceptable) · `cargar().catch(()=>{})` en participar (el error ya se refleja con `setInvalido`) · `setAll` en `supabase/server.ts` (patrón oficial) · `leerJSON` y `pedir` devuelven `{}`/null ante JSON inválido (documentado) · `anthropic.ts:50` traga JSON inválido para reintentar una vez (diseño) · `BotonGrabar.tsx:72` getUserMedia denegado → `setGrabando(false)` **sin avisar al usuario** | — | P2 (el último: mensaje) |
| Respuestas simuladas | 0 en `src/`. | — | — |
| Código comentado necesario | 0. | — | — |
| Páginas que compilan pero dependen de datos inexistentes | `bandeja/page.tsx` y `portal/page.tsx` dependen de `company_stats`, **vacía hasta que el worker la refresque** (empresa recién creada: sin fila → no aparece en "atención hoy"; sin worker: nunca) | `lib/bandeja.ts:13`, `lib/portal.ts:13` | P1-12 |
| Features del README que el código no soporta del todo | "Notas de voz de WhatsApp" → requiere `OPENAI_API_KEY`; "PDF escaneado" → una sola llamada, sin troceo; "Varios workers en paralelo son seguros" → cierto para `take_job`, falso para el tope de concurrencia (6 × N) | `README.md` | P2-13 / P1-14 / P1-20 |
| Compila pero no funciona | **Guardar canvas pierde aristas de nodos nuevos** (P0-05) · `pendienteTranscripcion` siempre `false` (P2-01) · `requiere_validacion` calculado y nunca leído (P1-09) · `riesgo_know_how_vacio` devuelto y descartado (P1-05) · `preguntas_pendientes` del diagnosticador devueltas y descartadas | `api/processes/[id]/route.ts:45`, `lib/entrevista.ts:39`, `diagnostico.ts:100,119`, `entrevista.ts:140` | P0 / P1 / P2 |

---

## 3. Metodología 4P (punto 3)

**Conclusión: las 4P son más que etiquetas en extracción, diagnóstico y reporte; son solo etiquetas en entrevista y en procesos.**

| Dimensión | PERSONAS | PROCESOS | PRODUCTO | MARKETING |
|---|---|---|---|---|
| Criterio de asignación | Extractor (prompt 23.1) + `claims.pilar` check | ídem | ídem | ídem |
| Preguntas propias | 6 del banco 7.3 resumidas en 1 línea del prompt del entrevistador | 6 en 1 línea | 6 en 1 línea | 6 en 1 línea |
| Cobertura verificada | **No** (P1-02/03) | No | No | No |
| Patrones asociados | dependencia_fundador, cultura_declarada, personas_disfrazado, proceso_disfrazado, cuello_financiero | automatizacion_equivocada, trabajo_sin_valor | producto_excelente/marketing_mediocre, crecimiento_destruye | canal_unico, marketing_excelente/producto_debil |
| Fuentes que lo alimentan | entrevistas (lider/personal), organigrama | procesos dibujados (**solo este pilar recibe los flujogramas**, `diagnostico.ts:37`) | datos (reclamos, recompra) | datos (canal, conversión) |
| Reglas mecánicas | ninguna | `rules/grafo.ts` (no conectada) | ninguna | ninguna |
| Salida | `diagnoses.estado` + findings con `pilar` | ídem | ídem | ídem |
| Relación con hallazgos | `findings.pilar` + `finding_evidence` | ídem | ídem | ídem |
| Relación con procesos | ninguna (no hay puesto↔nodo) | `processes.pilar` default 'procesos' (**nunca se usa para filtrar**) | ninguna | ninguna |
| Relación con recomendaciones | `findings.recomendacion` + filtros | ídem | ídem | ídem |
| Los tres filtros | `aplicarFiltros` en código, 3 campos obligatorios en schema, bloqueo probado (`evidencia.test.ts`) | ídem | ídem | ídem |
| Resultados como prueba | `sources.tipo='dato'` = fuente objetiva para impacto alto (`rules/evidencia.ts`) | ídem | ídem | ídem |

Defectos: (a) `transversal` se inyecta a los cuatro diagnósticos → el mismo hallazgo puede salir cuatro veces (sin consolidación, P1-19); (b) ningún pilar tiene reglas mecánicas que detecten su patrón más barato (canal único es un `group by` sobre el CSV, no necesita IA); (c) la cadena PERSONA→PUESTO→PROCESO→CLIENTE→INGRESO no tiene modelo (no hay tabla de puestos).

---

## 4. Sesgo del dueño (punto 4)

Grep sobre `src/lib/ai/agents/*`: no aparece "el cuello de botella está en el dueño" ni "nunca es la persona" (tests en `knowhow.test.ts › sesgos`, 4 aserciones). El diagnosticador dice: "Nunca culpes a una persona antes de auditar el sistema, el puesto y la relación persona-puesto". La regla correcta pide seis ejes (persona + puesto + sistema + proceso + autoridad + capacidad): **P1 menor, corrección de una línea** (no se aplicó: solo auditoría). El fixture demuestra el comportamiento deseado: el hallazgo "El jefe de ventas es incompetente" es derribado por el AUDITOR y bloqueado por Sabiduría (`flujo-demo` §11).

No hay ningún peso, prior ni orden en el código que favorezca "personas" o "fundador": `diagnostico.ts` trata los 4 pilares simétricamente; `PATRONES` es una lista sin ranking.

---

## 5. Sueño del dueño (punto 5)

De los 16 ítems pedidos, el prompt `sueno_dueno` cubre 11 (origen ×3, empresa deseada ×2, vida deseada ×2, rol, éxito, postergar, soltar, miedo a que otro lo haga). **Faltan 5**: qué sí ama hacer · qué es suficiente · qué quiere dejar construido · si la empresa actual conduce a la vida que quiere (como pregunta explícita, no inferencia) · qué le cuesta soltar está fundido con "deberías soltar".
Más grave que la lista: **no hay cobertura obligatoria**. `handleEntrevistaSiguiente` marca `completa` cuando el modelo devuelve `preguntas: []` o `sesion_completa: true`, sin comprobar qué bloques quedaron sin respuesta; una sesión cerrada no se reabre. El hallazgo "la empresa que construye no coincide con la vida que quiere" solo puede emerger si el diagnosticador conecta un claim aspiracional del dueño con la visión documental — posible (el fixture lo modela, §8) pero no garantizado: `brechasEstrategicas()` que lo detectaría mecánicamente **no se invoca** (STUB).

---

## 6. Entrevista al personal (punto 6)

- Fuentes diferenciadas: `participants.rol` ∈ {dueno, socio, lider, empleado, cliente, consultor} ✔; `columnaEspejo` colapsa a 3 (documentos/dueño/equipo) — líderes y primera línea no se distinguen en El Espejo (PARCIAL).
- Trazabilidad PERSONA→ROL→SESIÓN→PREGUNTA→RESPUESTA→AFIRMACIÓN→EVIDENCIA: existe vía `participants → interview_sessions → interview_responses` y `claims.participant_id + source_fragments.seccion="Pregunta N"`. **Eslabón débil:** `claims` no guarda `response_id`; la unión respuesta↔afirmación es por texto (P1-06). El fixture la prueba con ids explícitos (§7), el runtime no los tiene.
- Simultaneidad: cada participante tiene sesiones propias y token propio; `take_job` con prioridad 1 atiende preguntas en paralelo ✔ (`jobs.test.ts`).
- Autor/rol conservado: ✔ (`extraerDeRespuesta` pone `participant_id`).
- Colaborador no ve la empresa: ✔ por API (`/api/participar` filtra por `participant_id`); **el dueño sí ve a los colaboradores** por RLS y por API (P0-03, P0-06).
- Link/token: 16 bytes hex ✔; sin QR, sin expiración, sin revocación (P1-16).
- Anonimato: etiquetas por puesto, no nombre ✔; puesto unipersonal identifica (P2).
- Preguntas mínimas: 8 de 14 (P1-03).

---

## 7. Know-how miner (punto 7)

Existe más que el nombre: tabla `know_how` (8 campos + destino + participante + puesto), prompt con las 6 preguntas del minero (están en el banco del entrevistador para sesiones `know_how`, test en `knowhow.test.ts`), handler que persiste, disparo automático al completar sesiones personal/lider/know_how, UI de lectura en `entrevista/page.tsx`, e inyección como texto en TO-BE y SOP.
**PARCIAL** por: sin `proceso`, `actividad` (FK a nodo), `criticidad`, `documentado`, `rol`; `destino` es etiqueta sin ruta (ningún código convierte a checklist/entrenamiento/agente); `riesgo_know_how_vacio` se descarta; no hay pregunta "¿cuándo escalas?" explícita en el banco (sí está `escalamiento` en el modelo). Ver P1-05.

---

## 8. Referentes como lentes (punto 8)

`rules/patrones.ts` LENTES (7 referentes con su pregunta) entra al prompt del diagnosticador bajo la regla "los lentes sirven para PREGUNTAR; solo la evidencia interna sirve para AFIRMAR" y `preguntas_pendientes` en el schema para lo que el lente sugiere sin evidencia. No existe ninguna instrucción del tipo "no uses conocimiento general"; al contrario, pide "conocimiento del sector" (`knowhow.test.ts › lentes`). Nombres invisibles al cliente: no aparecen en `textos.ts`, portal ni entregables (el REDACTOR no los recibe).
Defecto: `preguntas_pendientes` se devuelven en `jobs.resultado` y **no vuelven al entrevistador** — el ciclo "lente → pregunta → evidencia → afirmación" se corta a la mitad (P1-19/P2).

---

## 9. Vigencia (punto 9)

No existe ninguna regla "N meses = caducado": `requiereValidacionPrioritaria` devuelve un booleano que solo pone `prioridad_validacion=true`; el estado `caducado` lo escribe únicamente `/api/claims/[id]/validate` (dueño/consultor) o la resolución de una contradicción. Vida útil por tipo: precio 3, canal/kpi 6, meta/cliente 12, proceso/rol/producto 18, política 36, visión 60, **propósito nunca**.
**Bug encontrado y corregido en auditoría:** `VIDA_UTIL_MESES[c.tipo] ?? 24` convertía `null` en 24 → un propósito de 8 años pedía validación. Además foto/dato sin fecha no disparaban validación. 7 tests en `vigencia.test.ts`.

---

## 10. Evidencia real (punto 10)

`source_fragments` existe con `pagina, seccion, celda, audio_desde, audio_hasta, texto`; `claims.fragment_id` la enlaza; `VerFuente.tsx` resalta el fragmento y muestra página/celda/minuto; `/api/sources/[id]` entrega signed URL de 600 s. **El modelo soporta la promesa; el runtime no la llena completa**: audio sin timestamps, CSV sin celda, entrevista sin `response_id` (P1-06). El extractor devuelve `pagina`/`seccion`/`fragmento` para PDF/texto ✔.

---

## 11. Hallazgos críticos (punto 11)

`calibrarImpacto` (extraída del handler): alto exige ≥2 fuentes independientes (`participant_id ?? source_id`) **o** una objetiva (`sources.tipo='dato'`); si no, baja a medio y marca `requiere_validacion`; si el AUDITOR dice "no sustentado", baja a bajo + `requiere_validacion`. 10 tests. El AUDITOR corre siempre tras el diagnosticador (`diagnostico.ts:66`).
Defecto: `requiere_validacion` no es estado ni bloquea la aprobación (P1-09); "observación directa" del spec se redujo a `dato` porque `observacion` en este código es una nota escrita por el dueño (no objetiva) — decisión documentada en `rules/evidencia.ts`.

---

## 12. Propósito + Sabiduría + Excelencia (punto 12)

Schema: `filtros` obligatorio con los 3 ✔ (`schemas.test.ts`). Lógica: `aplicarFiltros` bloquea recomendación y conserva la tensión ✔ (`evidencia.test.ts`, `flujo-demo` §11: "subir precio 40%" bloqueado). Prompt: regla "un filtro en no_pasa bloquea" ✔. Test ✔. UI: `Hallazgo.tsx` muestra pasa/no pasa + nota ✔.
Defecto: las sub-preguntas de Sabiduría (causa/síntoma, evidencia contraria, consecuencia secundaria, parte/todo, victoria inmediata) y de Excelencia (escalar sin degradar) no están desglosadas: el modelo devuelve una nota libre. PARCIAL.

---

## 13. Procesos (punto 13)

Soportado en datos y UI: AS-IS/TO-BE (`version`, `padre_id`), 5 veredictos, 5 tipos, posiciones persistidas, reconstrucción desde DB en dos consultas, comparada con tachado/resaltado, dagre.
No soportado: validación (decisión ≥2 salidas, todo termina, finales malos, remove con dependientes, create arbitrario) — **regla escrita en `rules/grafo.ts` durante la auditoría, 10 tests, no conectada** (P1-07); campos de nodo faltantes (rol, entrada, salida, evidencia, estándar, know-how) (P1-08); **guardar nodos nuevos pierde sus conexiones** (P0-05).

---

## 14. Agentes (punto 14)

La arquitectura **no bloquea** V2: `process_nodes.ejecutor='ia'` identifica el punto de inserción; `know_how` (con FK futura a nodo) es el "conocimiento"; `sops` el procedimiento. Para V2 faltaría una tabla `agents(id, node_id, nombre, mision, trigger, inputs, outputs, conocimiento, herramientas, reglas, autoridad, prohibido, escalamiento, aprobacion_humana, version)` y `agent_runs` para evidencia — ambas añadibles sin tocar lo existente. Riesgo real: sin `know_how.node_id` (P1-05) el agente no podría heredar el know-how del puesto automáticamente. No se implementó nada de esto (correcto según el pedido).

---

## 15. "Todo en un día" (punto 15)

El código no promete nada: no hay temporizadores ni etapas por fecha. Pero tampoco modela condiciones de suficiencia: el único umbral es `confirmadas ≥ 20 && sin_verificar == 0 && contradichas == 0` en la bandeja (hardcoded) y `MIN_CONFIRMADAS=5` por pilar. Una empresa de 250 personas con 20 claims confirmados aparecería "lista para diagnosticar". Falta `rules/suficiencia.ts` con tamaño/complejidad/fuentes/cobertura de sesiones (P1-04).

---

## 16. Arquitectura para 30 empresas (punto 16)

| Aspecto | Estado | Evidencia | Riesgo |
|---|---|---|---|
| Queue | Postgres `jobs` + `take_job` skip locked | schema | RPC pública (P0-01) |
| Workers | 1 proceso, loop con concurrencia 6 | `worker.ts` | N procesos = 6N llamadas (P1-20) |
| Prioridad | 1–9, probada | `jobs.test.ts` | — |
| Rate limit proveedor | 429/529 → 1s/4s/16s, 2 reintentos | `reglas.ts` | sin coordinación global |
| Idempotencia | por job (hash) | `jobs.test.ts` | no por claim (P1-10) |
| Retries | `max_intentos=3` → fallido | probado lógico | — |
| Backoff | sí | probado | — |
| Worker muerto / lease | lease 10 min + barrido 60 s | `recover_stale_jobs` | sin heartbeat (P1-13) |
| Huérfanos | tramos creados con clave idempotente → reintento completa | `extraer.ts` | carrera de `contrastar` (P2-03) |
| Dead letter | `fallido` + UI "Reintentar" | `fuentes/page.tsx` | — |
| Límite por empresa | tope tokens solo p≥5 | `worker.ts:42` | P1-20 |
| Límite global | no | — | P1-20 |
| Costos | `token_usage` por llamada | `registrarTokens` en 10 handlers | `superaTope` O(n) |
| Paginación | API sí (`limit/offset`), UI no | `api/reality` | P2 |
| Realtime | jobs/claims/sources/responses/findings en publicación | schema | cliente bloqueado por RLS (P1-12) |
| Materialized view | `company_stats` concurrently cada 60 s | worker | vacía sin worker (P1-12) |
| Cache | no aplica aún | — | — |
| Errores visibles | bandeja "trabajos fallidos", fuentes, Progreso | sí | — |

**Cola casera vs Supabase Queues (PGMQ):** la actual cubre lo esencial en ~120 líneas SQL+TS y es testeable. PGMQ daría visibility timeout nativo (resuelve P1-13), archive/DLQ y `read_with_poll`, pero no da prioridades (habría que usar N colas), ni `jobs.progreso`/Realtime (habría que mantener la tabla espejo igual). Recomendación para la fase de conexión: **mantener `jobs` como registro e interfaz**, y decidir PGMQ solo si el heartbeat resulta frágil; lo que sí simplificaría PGMQ es el barrido de leases (`recover_stale_jobs`) y el archivado. No se cambia nada ahora.

---

## 17. Multiempresa y seguridad (punto 17)

- `workspace → companies`: no existe; una sola consultoría. Para el primer caso no bloquea; para vender "autoservicio" (41) sí. P2-05.
- RLS tabla por tabla: 25 tablas habilitadas; consultor = todo; cliente = políticas por membresía en 15 tablas; 7 tablas sin política de cliente (invisibles ✔: corrections, cases, eval_runs, jobs, token_usage, diagnoses, know_how, checkpoints).
- EMPRESA A nunca ve B: por `mis_empresas()` ✔ (NP).
- CLIENTE solo su empresa: ✔ salvo columnas (P0-02) y respuestas/tokens de terceros (P0-03/04).
- COLABORADOR solo lo autorizado: por API ✔; no tiene cuenta, no toca RLS.
- PARTICIPANTE no entra al dashboard: ✔ (sin usuario; `/participar` público por token).
- HALLAZGO PENDIENTE nunca llega al cliente: RLS `estado_revision in (aprobado, corregido)` ✔ + `publish` exige 0 pendientes ✔.
- SERVICE_ROLE jamás al navegador: ✔ (`supabaseAdmin` solo en server; no hay `NEXT_PUBLIC_` para la service key).
- Archivos privados: bucket `public=false` ✔; signed URL 600 s ✔.
- Endpoints server-side como bypass: **sí, dos** (P0-06). Los demás comprueban `exigirAcceso` y filtran columnas.
- Invitaciones/expiración/revocación/borrados/huérfanos: FALTA (P1-16, P2-04).

---

## 18–19. Tests y fixture (puntos 18–19)

Ver `TEST_REPORT.md`. 87 tests locales en 9 archivos; el fixture `Frutas del Valle SAC` recorre FUENTES→FRAGMENTOS→AFIRMACIONES→VIGENCIA→CANDIDATAS→CONTRADICCIONES→VALIDACIÓN→RESPUESTAS→KNOW-HOW→DIAGNÓSTICO→RED TEAM→HALLAZGOS→AS-IS→TO-BE→PLAN con la lógica real y salidas de IA deterministas. Lo que demuestra: el modelo de datos y las reglas soportan el flujo **cuando los handlers los invocan** — y justamente `grafo.ts` y `brechasEstrategicas` no se invocan.

---

## 20. Cambios hechos durante la auditoría (solo instrumentación)

- Nuevos: `src/lib/rules/evidencia.ts`, `src/lib/rules/plan.ts`, `src/lib/rules/grafo.ts`, `src/lib/jobs/reglas.ts`, `vitest.config.ts`, `tests/**` (9 archivos + fixture), los 5 documentos.
- Editados (extracción sin cambio de comportamiento): `handlers/diagnostico.ts`, `handlers/plan.ts`, `jobs/worker.ts`.
- Editado con cambio de comportamiento (bug): `rules/vigencia.ts` (`?? 24`; fuentes fechables).
- No tocado: esquema, rutas, UI, prompts. Supabase no conectado. Ninguna feature nueva.


---

## 21. Fase de corrección P0 (2026-08-22)

Alcance estricto: los 6 P0. Ninguna feature, ningún P1/P2, Supabase sin conectar. Detalle por ítem (ANTES / CORRECCIÓN / ARCHIVOS / TEST / ESTADO) en `RIESGOS_P0_P1_P2.md` › "Fase de corrección P0".

**Qué cambió de arquitectura (solo lo necesario):**
- Dos vistas seguras (`claims_cliente`, `participants_cliente`) sustituyen a las políticas de cliente sobre `claims` y `participants`. La frontera pasa a vivir en la capa de datos; `src/lib/frontera.ts` es su espejo para las rutas con service role.
- El guardado del canvas pasa de N consultas sin transacción a una función plpgsql (`guardar_proceso`) atómica.
- El token de participante deja de ser una columna en claro y pasa a hash + expiración + revocación + usos, con rotación por ruta.
- Autorización de sesiones centralizada en `src/lib/sesiones.ts` (pura, probada) y usada por las dos rutas afectadas.

**Archivos nuevos:** `src/lib/tokens.ts`, `src/lib/sesiones.ts`, `src/lib/frontera.ts`, `src/lib/canvas-guardar.ts`, `src/app/api/participants/[id]/enlace/route.ts`, `tests/p0-tokens.test.ts`, `tests/p0-sesiones.test.ts`, `tests/p0-frontera.test.ts`, `tests/p0-canvas.test.ts`, `tests/p0-schema.test.ts`.
**Archivos modificados:** `supabase/schema.sql`, `src/lib/api.ts`, `src/lib/portal.ts`, `src/app/api/companies/[id]/interview/next/route.ts`, `src/app/api/interviews/[sesion]/answer/route.ts`, `src/app/api/processes/[id]/route.ts`, `src/app/api/participants/route.ts`, `src/app/api/participar/[token]/route.ts`, `src/app/api/companies/[id]/reality/route.ts`, `src/app/api/sources/[id]/route.ts`, `src/components/consultor/Participantes.tsx`, `src/app/(consultor)/empresa/[id]/page.tsx`, `src/app/(cliente)/portal/resultados/page.tsx`, `tests/pendientes.test.ts`.

**Lo que sigue requiriendo Supabase para probarse de verdad, y por qué:** los `revoke`/`grant`, las políticas RLS y las vistas solo tienen efecto dentro de Postgres; la transacción de `guardar_proceso` solo se puede observar contra una base real. Los tests locales verifican (a) el texto SQL exacto que se va a ejecutar (`p0-schema`), (b) la lógica de autorización, de token y de frontera en TypeScript, y (c) el algoritmo de guardado con semántica todo-o-nada en memoria. Los 5 `it.todo` marcados `[P0-0x]` en `tests/pendientes.test.ts` son las pruebas de integración pendientes.

**Residuales conocidos (registrados, no corregidos):** P1-21, P1-22, P2-17, P2-18 en `RIESGOS_P0_P1_P2.md`.
