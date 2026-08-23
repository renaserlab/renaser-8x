# MATRIZ DE TRAZABILIDAD — 8X v4 → código real

Estados: **IMPL** implementado y con prueba local · **PARCIAL** existe pero incompleto · **STUB** solo nombre/forma · **FALTA** no existe · **NP** existe pero no se puede probar sin Supabase/IA/navegador.
"Prueba" = test en `tests/` que lo ejercita, o `—` si no hay.

## Libro I · Metodología

| # | Requerimiento | Dónde | Estado | Evidencia | Prueba | Problema | Corrección |
|---|---|---|---|---|---|---|---|
| 1.1 | Restricción dominante no presupuesta (no "está en el dueño") | `src/lib/ai/agents/diagnosticador.ts` PROMPT_DIAGNOSTICADOR; `entrevistador.ts` | IMPL | Ningún prompt contiene la tesis; "Nunca culpes a una persona antes de auditar…" en línea final del prompt | `knowhow.test.ts` › sesgos (4 tests) | La regla "persona + puesto + sistema + proceso + autoridad + capacidad" no está desglosada: solo "sistema, puesto y relación persona-puesto" | Ampliar la frase del prompt a los 6 ejes |
| 1.4 | Cuatro verdades / cinco principios | — | FALTA (no aplica a código) | Solo en spec | — | No son requisitos de software | — |
| 2.P1–P4 | Pilar asignado al extraer, no al diagnosticar | `schemas/index.ts` Pilar; `handlers/extraer.ts` insert `pilar` | IMPL | claims.pilar check constraint; extractor devuelve pilar | `schemas.test.ts`, `flujo-demo` §1 | `transversal` entra a los 4 diagnósticos (`diagnostico.ts:19`) → hallazgos duplicados entre pilares | Definir reparto o deduplicar por claim |
| 2 | Preguntas rectoras y "cómo investiga" por pilar | `entrevistador.ts` GUÍA DE BLOQUES; `textos.ts` PILAR_PREGUNTA | PARCIAL | Banco 7.3 presente en prompt (1 línea por pilar) | `knowhow.test.ts` (solo know-how) | Las preguntas de P1 ("¿quién responde si el resultado no ocurre?", "¿qué pasa si renuncia mañana?") y P3/P4 están resumidas; no hay checklist de cobertura | Tabla de cobertura por pilar en código (ver P1-02/03) |
| 2 | Clasificación keep/improve/replace/remove/create por proceso y paso | `schema.sql` process_nodes.veredicto; findings.veredicto; `PanelPropiedades.tsx` | IMPL | check constraint + UI select | `grafo.test.ts` diff | Solo por nodo; `processes` no tiene veredicto global | Añadir `processes.veredicto` |
| 2 | Resultados = prueba, no quinto pilar | `schema.sql` sources.tipo='dato'; `rules/evidencia.ts` FUENTES_OBJETIVAS | IMPL | `dato` es fuente fuerte para impacto alto | `evidencia.test.ts` | Solo CSV/texto; Excel se rechaza (`api/sources/route.ts:32`) | Lector xlsx en fase 2 |
| 2 | Lentes (Lemonis…EOS) como generadores de hipótesis | `rules/patrones.ts` LENTES → `diagnosticador.ts` | IMPL | Prompt: "usa los lentes… solo puedes AFIRMAR con las afirmaciones recibidas"; `preguntas_pendientes` en schema | `knowhow.test.ts` › lentes | Nombres nunca visibles al cliente ✔ (solo en prompt). `preguntas_pendientes` se devuelven en `resultado` del job y **no se guardan ni se reinyectan al entrevistador** | Persistir `preguntas_pendientes` → interview_responses |
| 3 | Filtros Propósito/Sabiduría/Excelencia con resultado guardado y bloqueo | `schemas` filtros; `rules/evidencia.ts` aplicarFiltros; `handlers/diagnostico.ts:87`; `Hallazgo.tsx` | IMPL | findings.filtros jsonb {proposito,sabiduria,excelencia,bloqueada,tension} | `evidencia.test.ts` › filtros; `flujo-demo` §11 | Las sub-preguntas de Sabiduría (síntoma/causa, consecuencia secundaria, todo vs parte, victoria inmediata) están en el spec, no en el prompt; solo "una nota de una frase" | Desglosar sub-preguntas en prompt y schema |
| 4 | Fase 1 no se automatiza | — | IMPL (por omisión) | No existe agente de fase 1 | — | — | — |
| 5 | Admisión: cuestionario de 6 preguntas, rechazo posible | `empresas/nueva/page.tsx`; `api/companies/[id]/admission`; `agents/planificador.ts` PROMPT_ADMISION; `Admision.tsx` | IMPL | 6 preguntas literales; estado_admision candidata/admitida/rechazada; decide el consultor | — (NP: requiere IA) | Recomendación IA no testeada | — |

## Libro II · Motor de inteligencia

| # | Requerimiento | Dónde | Estado | Evidencia | Prueba | Problema | Corrección |
|---|---|---|---|---|---|---|---|
| 6 | Afirmación con fuente, fecha y estado; 4 estados; sin puntaje | `schema.sql` claims (source_id not null, estado check) | IMPL | No existe columna de confianza | `schemas.test.ts` | — | — |
| 6 | `fecha_afirmacion` nunca estimada | `extractor.ts` prompt; `schemas` fechaONull `.catch(null)`; `extraer.ts:95` usa fecha_origen de la fuente si falta | IMPL | Fecha inválida → null | `schemas.test.ts` | Si el doc no tiene fecha, hereda `sources.fecha_origen` (la que puso el usuario) ✔; la foto del organigrama sin fecha queda null ✔ | — |
| 6 | temporalidad actual/historica/aspiracional | `schemas`, `rules/contradiccion.ts` | IMPL | aspiracional nunca es candidata a contradicción | `contradiccion.test.ts` | — | — |
| 7.1 | Capa A — sueño del dueño (origen, empresa deseada, vida deseada, rol, éxito, verdad difícil) | `entrevistador.ts` bloques `sueno_dueno` | PARCIAL | 6 bloques en prompt | `flujo-demo` §8 (fixture) | Faltan: "qué sí ama hacer", "qué es suficiente", "qué quiere dejar construido", "si la empresa actual conduce a la vida que quiere" como pregunta explícita. **No hay control de cobertura**: la sesión termina cuando el LLM devuelve `[]` | Matriz de cobertura por bloque en `handlers/entrevista.ts`; no cerrar sesión sin cubrir bloques |
| 7.2 | Capa B — HOY / DEPENDENCIA / PROPÓSITO | `entrevistador.ts` bloques `empresa_dueno` | PARCIAL | 3 bloques + banco por pilar | — | Misma falta de control de cobertura | Ídem |
| 7.4 | Personal: líderes y primera línea por separado, enlace desde celular, sin acceso al resto | `api/participants` (sesiones por rol); `participar/[token]/page.tsx`; `api/participar/[token]/route.ts` (`participant_id !== p.id → 403`) | IMPL | Token 128 bits; solo su sesión | `flujo-demo` §7 (lógico); RLS NP | Sin expiración ni revocación de token; `rol` 'cliente'/'consultor' sin UI | Añadir `expira_at`, `revocado` |
| 7.4 | Nunca pedir juicios; hechos, pasos, trabas | `entrevistador.ts` | IMPL | Regla explícita | `knowhow.test.ts` | — | — |
| 7.4 | Espejo agregado por rol, nunca por nombre | `db/queries.ts` etiquetaFuente (puesto/rol, no nombre); `columnaEspejo` | PARCIAL | Matriz muestra "Compradora (entrevista)" | — | Puesto unipersonal identifica a la persona; el consultor sí ve nombres (correcto); **el cliente, vía RLS, puede leer `interview_responses` con participant_id → nombre** | P0-03 |
| 7.4 | Preguntas mínimas al personal (14 del pedido) | `entrevistador.ts` bloques personal/verdad_operativa | PARCIAL | 8 de 14 presentes | — | Faltan: resultado esperado de él, cómo sabe si lo hizo bien, información que le falta, decisión que escala, sistema paralelo, qué escucha de clientes, qué conservaría, qué ve que Dirección no ve | Ampliar banco + cobertura |
| 7.5 | Know-how minado, estructurado (8 campos), con destino | `schema.sql` know_how; `agents/minero.ts`; `handlers/entrevista.ts` handleMinarKnowHow | PARCIAL | 8 campos + destino + participant + puesto | `knowhow.test.ts`; `flujo-demo` §9 | Faltan: proceso, actividad/nodo, criticidad, documentado sí/no, rol. No hay relación con `process_nodes`. Uso posterior: solo texto inyectado a TO-BE/SOP; no existe conversión a checklist/entrenamiento/agente | Añadir columnas y FK a nodo; rutas de destino |
| 7.5 | Regla: puesto crítico con know-how vacío = hallazgo de riesgo | `minero.ts` prompt `riesgo_know_how_vacio`; `arquitecto.ts` PROMPT_TOBE "no se automatiza" | PARCIAL | Flag en salida del minero | `knowhow.test.ts` | El flag **se devuelve pero no genera ningún hallazgo ni marca** (`handleMinarKnowHow` lo devuelve en `resultado` y ya) | Crear finding `informacion_insuficiente` al recibir `true` |
| 7.6 | Ramas generadas por afirmación por validar/contradicha | `handlers/entrevista.ts` contexto "AFIRMACIONES POR VALIDAR"; `rules/vigencia.ts` preguntaDeVigencia; `origen_claim_id` | IMPL | El entrevistador recibe hasta 40 claims por validar y enlaza `origen_claim_id` | `vigencia.test.ts`; `flujo-demo` §3 | `preguntaDeVigencia` no se usa en runtime (solo el LLM formula) | — |
| 7.7 | Cuestionar al dueño con datos | `diagnosticador.ts` ("claims_contrarios"), `contrastador.ts` | IMPL | `finding_evidence.relacion='contradice'` | `flujo-demo` §11 (fruta vs "ventas funciona bien") | Ocurre en diagnóstico, no en la entrevista en tiempo real | Reinyectar `preguntas_pendientes` |
| 7.8 | Contraste dueño / líderes / primera línea / documentos / datos | `columnaEspejo` (3 columnas) | PARCIAL | documentos / dueño / equipo | `flujo-demo` §2 | Líderes y primera línea se funden en "equipo"; datos se funden en documentos | 5 columnas o filtro por rol |
| 7.9 | Condición de salida: ninguna crítica sin verificar | `handlers/entrevista.ts` solo pasa `TIPOS_CRITICOS` al prompt | FALTA (en código) | — | — | La sesión termina por decisión del LLM; la etapa no avanza por condiciones | Función `suficiencia(companyId)` y usarla en `sesion_completa` y `etapa` |
| 8.1 | Reglas mecánicas de vigencia (sin IA) | `rules/vigencia.ts` | IMPL | VIDA_UTIL por tipo; `proposito: null`; solo dispara validación | `vigencia.test.ts` (7) | **Bug encontrado y corregido**: `?? 24` anulaba el `null`; foto/dato sin fecha no disparaban | Hecho en auditoría |
| 8.1 | Candidatas: mismo tipo, actuales, distinta fuente/autor | `rules/contradiccion.ts` | IMPL | Tope 60 pares; excluye ya juzgadas | `contradiccion.test.ts` (9) | Tope hardcoded; pares juzgados se leen de `jobs.resultado` (frágil si se borran jobs) | Tabla `claim_pairs` |
| 8.1 | Brecha estratégica (aspiracional sin actual) | `rules/contradiccion.ts` brechasEstrategicas | STUB | Función existe | `contradiccion.test.ts` | **Nadie la llama en runtime** | Llamar en handleContrastar y marcar `prioridad_validacion` |
| 8.2 | Juicio del modelo: ante la duda, false | `contrastador.ts` | IMPL | Regla en prompt | `knowhow.test.ts` | NP con IA | — |
| 8.3 | Contradicción la resuelve el dueño | `api/claims/[id]/validate` (confirma una → caduca contraparte); `Validar.tsx` | IMPL | Tres botones + seguimiento | `flujo-demo` §6 (lógica) | Seguimiento se guarda como `source tipo observacion` sin extracción (no genera claims) | Encolar extraer sobre esa fuente |
| 9 | Seis pasadas en tres llamadas (A+B, C, D+E+F) | `diagnostico.ts` (diagnosticador = A+B+D+E+F; auditor = C) | PARCIAL | 2 llamadas por pilar | — | La pasada B (conectar pilares) y F (prioridad global) corren dentro de cada pilar, no en consolidación: **no hay consolidación cross-pilar** | Job `consolidar` tras los 4 pilares |
| 9 | Cadena de impacto PERSONA→PUESTO→PROCESOS→CLIENTES→INGRESOS | — | FALTA | No hay modelo de puestos ni WITH RECURSIVE | — | `participants.puesto` es texto libre; no hay tabla de puestos ni relación puesto↔nodo | Fase 2 |
| 10 | 12 patrones ocultos como hipótesis | `rules/patrones.ts` → prompt; `findings.patron` | IMPL | 12 claves | `flujo-demo` §11 | Patrones no detectados mecánicamente (p. ej. canal único desde `dato`) | Reglas mecánicas para 3–4 patrones detectables |
| 11 | Diagnóstico por pilar, bloqueado con contradicciones abiertas | `handlers/diagnostico.ts:20-23` | IMPL | Lanza error; `forzar` manual | `flujo-demo` §10 | — | — |
| 11 | DESCONOCIDO con < N confirmadas | `diagnostico.ts:28` MIN_CONFIRMADAS=5; `rules/evidencia.ts` estadoPilar | IMPL | Hardcoded 5 | `evidencia.test.ts` | Umbral fijo; no considera tipos críticos | Por tipo |
| 11 | Sin evidencia no se muestra (regla en consulta) | `db/queries.ts` hallazgosAprobadosConEvidencia filtra `relacion='sustenta'`; `diagnostico/page.tsx:33` | IMPL | Filtro en consulta, no en IA | `schemas.test.ts` (claim_ids min 1) | El filtro es en JS tras la consulta, no un constraint SQL ni una vista | Vista `findings_validos` |
| 11 | Alto = dos fuentes independientes o una objetiva | `rules/evidencia.ts` calibrarImpacto; `diagnostico.ts:85` | IMPL | Baja a medio + `requiere_validacion` | `evidencia.test.ts` (10) | `requiere_validacion` vive en `filtros` jsonb; **no hay estado ni UI** | Columna + badge + bloqueo de aprobación |
| 11 | Evidencia contraria registrada | `finding_evidence.relacion='contradice'` | IMPL | Auditor y diagnosticador alimentan | `flujo-demo` §11 | — | — |
| 11 | AUDITOR intenta derribar | `agents/diagnosticador.ts` PROMPT_AUDITOR; `diagnostico.ts:66-74` | IMPL | No sustentado → bajo | `flujo-demo` §11 | Un hallazgo derribado sigue visible como "bajo" en vez de bloquearse | Estado `requiere_validacion` |
| 12 | TO-BE: conservar, keep/improve/replace/remove/create | `arquitecto.ts` PROMPT_TOBE; `handlers/procesos.ts` handleGenerarToBe; `processes.padre_id` | PARCIAL | Relación padre_id; regenerar reemplaza | `grafo.test.ts` diff | No se verifica `remove` con consumidores aguas abajo; no se valida el grafo | Conectar `rules/grafo.ts` |
| 12 | Ejecutor humano/software/ia/hibrido, regla de oro | `process_nodes.ejecutor`; PROMPT_TOBE; `nodos.tsx` color | IMPL | Pinta el nodo | `grafo.test.ts` automatizacionesInvalidas | Regla "remove nunca se automatiza" solo en prompt; la función en código no está conectada | Conectar |
| 12 | Ruta V1→V2→V3 de agentes | `process_nodes.ejecutor='ia'` | IMPL (V1) | Solo etiqueta | — | No bloquea V2: falta tabla `agents` (ver AUDITORIA §14) | — |
| 12 | SOP por proceso keep/improve | `handlers/procesos.ts` handleGenerarSop; `sops`; `Entregable.tsx` Sop | IMPL | 9 campos | `schemas.test.ts` | Se genera para cualquier proceso, no solo keep/improve | Filtrar |
| 13 | Etapas por condiciones, no calendario | `companies.etapa`; cambios en `api/sources`, `diagnose`, `publish`, `close`; `Etapa.tsx` manual | PARCIAL | La etapa existe | — | Avanza por efectos colaterales y a mano; **no hay función de suficiencia** | `suficiencia()` |
| 13 | Modo intensivo condicionado | `bandeja.ts` `listaParaDiagnosticar` (≥20 confirmadas, 0 sin verificar) | PARCIAL | Heurística hardcoded | — | No modela tamaño/complejidad/fuentes | Condiciones explícitas |
| 13 | El Espejo: 3 columnas, confirmado primero, evidencia a un clic | `MatrizRealidad.tsx` modo espejo; `VerFuente.tsx` | IMPL | Orden por brechas; clic abre fragmento | — (navegador) | — | — |
| 13 | Implementación 45 días, máx. 3 frentes, dueño/KPI/cierre | `rules/plan.ts`; `handlers/plan.ts`; `Plan.tsx` | IMPL | Regla en código | `plan.test.ts` (5); `flujo-demo` §14 | Agenda semanal de 30 min no se genera; escalamiento "2 semanas trabado" solo por `vence_at` | P1-17 |
| 13 | Monitoreo 45: cortes quincenales, regresión = hallazgo | `checkpoints`; `api/companies/[id]/close` corte; `Plan.tsx` | PARCIAL | Cortes se registran | — | Regresiones no crean hallazgos; sin alertas de KPI | P1-17 |
| 13 | Cierre → `cases` | `api/companies/[id]/close` cerrar; `casos/page.tsx` | IMPL | perfil, hallazgos, plan, resultado | — | Biblioteca no se usa como ejemplos para empresas nuevas | Fase 2 |

## Libro III · Producto

| # | Requerimiento | Dónde | Estado | Evidencia | Prueba | Problema | Corrección |
|---|---|---|---|---|---|---|---|
| 14 | 10 pantallas consultor | `src/app/(consultor)/…` (bandeja, empresas, empresa/[id]/{,fuentes,afirmaciones,realidad,entrevista,procesos,procesos/[p],diagnostico,plan,entrega,entrega/[d]}, casos) | IMPL | `next build` lista 31 rutas | — (navegador) | — | — |
| 14 | 7 pantallas cliente | `src/app/(cliente)/portal/…` | IMPL | Ídem | — | — | — |
| 14 | Matriz de Realidad: Tema/Dice/Evidencia/Estado, filtros, clic = fragmento resaltado | `MatrizRealidad.tsx`; `api/companies/[id]/reality`; `api/sources/[id]`; `VerFuente.tsx` | IMPL | Resalta `fragmento.texto` dentro de `contenido` | — | Para PDF/foto solo muestra el fragmento + visor; no salta a la página | Usar `#page=N` en iframe |
| 15.1 | Tú dibujas / la IA dibuja, en cualquier momento | `Canvas.tsx` (agregar, conectar, panel, generar) | PARCIAL | Ambas direcciones | — | **P0-05: guardar pierde conexiones de nodos nuevos** | Fix mapa tmp→id |
| 15.2 | 5 tipos de nodo; finales malos obligatorios | `nodos.tsx` (5 formas); `rules/grafo.ts` tieneFinalMalo | PARCIAL | Formas ✔ | `grafo.test.ts` | "Obligatorio" no se exige en ningún lado | Conectar validador |
| 15.3 | Panel: responsable, ejecutor, tiempo, herramienta, problema, veredicto | `PanelPropiedades.tsx` | IMPL | 6 campos | — | Faltan rol, entrada, salida, evidencia, estándar, know-how | Ampliar tabla y panel |
| 15.4 | Vista comparada AS-IS/TO-BE, remove tachado, create resaltado | `Comparada.tsx`; `nodos.tsx` estiloVeredicto | IMPL | Tachado/outline | — | — | — |
| 15.5 | React Flow + dagre; guardado explícito; posiciones en la fila | `layout.ts`; `api/processes/[id]` PUT; `process_nodes.pos_x/y` | IMPL | Dos consultas; botón Guardar | `grafo.test.ts` autoLayout | P0-05 | — |
| 16 | 7 entregables | `handlers/plan.ts` handleRedactarEntregables; `VistaEntregable.tsx` | PARCIAL | 3 redactados por IA + 4 desde datos | — | Mapas/manual/plan leen datos **vivos**, no una versión congelada al publicar | Snapshot al publicar |

## Libro IV · Diseño

| # | Requerimiento | Dónde | Estado | Evidencia | Prueba | Problema | Corrección |
|---|---|---|---|---|---|---|---|
| 17.2 | Paleta y 3 marcas de estado (color + forma) | `design/tokens.css`; `MarcaEstado.tsx` | IMPL | ● ◐ ◍ ○ en SVG | — | — | — |
| 17.3 | Public Sans / Source Serif 4; 17px; escala | `layout.tsx`; tokens | IMPL | next/font | — | — | — |
| 17.6 | Movimiento 150 ms, reduced-motion | tokens `.aparece`, `@media (prefers-reduced-motion)` | IMPL | — | — | — | — |
| 18 | Prohibiciones (sin degradados, sin emoji, sin "IA" visible) | Revisión manual de `src/components` | IMPL | grep: 0 `gradient`, 0 emoji en UI, 0 "IA" en portal (solo "Agente de IA" en leyenda de ejecutor para consultor) | — | `EJECUTOR.ia = "Agente de IA"` aparece en panel del cliente (`paraCliente`) | Texto alterno para cliente |
| 19.2 | Voz: responder hablando y escuchar cada pregunta | `BotonGrabar.tsx`, `BotonEscuchar.tsx` | PARCIAL | Web Speech API sin llave; fallback MediaRecorder | — (navegador) | Fallback audio requiere OPENAI_API_KEY en servidor; si falta, la sesión queda bloqueada (P1-11) | Mensaje + volver a texto |
| 19.2 | Notas de voz de WhatsApp como fuente | `api/sources` (audio) → `extraer.ts` `ai().transcribe` | PARCIAL | Ruta existe | — | Sin OPENAI_API_KEY falla con error claro; `audio_desde/hasta` nunca se llenan | Whisper con timestamps |
| 19.3 | Fotos como documentos | `extraer.ts` adjunto imagen → Anthropic vision | IMPL | — | — (IA) | — | — |
| 19.4–19.5 | Una pregunta por pantalla; validación con 3 botones | `Entrevista.tsx`; `Validar.tsx` | IMPL | Textos literales del spec | — | — | — |
| 19.6 | Vocabulario del cliente | `textos.ts` ESTADO_CLIENTE etc.; `api/reality` oculta pilar/estado a cliente | PARCIAL | Rutas ocultan | — | **RLS no oculta** (P0-02) | Vista de columnas |
| 20 | Mensajes específicos, errores útiles | `textos.ts` VACIO; `api/sources` errores Word/Excel | IMPL | — | — | — | — |

## Libro V · Construcción

| # | Requerimiento | Dónde | Estado | Evidencia | Prueba | Problema | Corrección |
|---|---|---|---|---|---|---|---|
| 21.1 | AIProvider detrás de interfaz; se cambia en un archivo | `lib/ai/provider.ts`, `anthropic.ts`, `index.ts` | IMPL | — | — | `speak()` implementado y **sin uso** (código muerto) | Quitar o usar |
| 21.2 | Salidas Zod; reintento una vez; sin regex | `anthropic.ts` complete | IMPL | 2 intentos; `extraerJSON` solo quita ``` | `schemas.test.ts` | Quitar fence es un regex mínimo (aceptable) | — |
| 22 | Esquema SQL completo | `supabase/schema.sql` | NP | 25 tablas + extras | `pendientes.test.ts` (todo) | No ejecutado contra Postgres | Correr en Supabase local antes del remoto |
| 23 | 9 prompts | `lib/ai/agents/*` | IMPL | Texto del spec | `knowhow.test.ts` | — | — |
| 24 | 22 rutas del spec | `src/app/api/**` (26 rutas) | IMPL | build | — | `POST /api/interviews/[s]/knowhow` y `POST /api/eval/run` existen ✔ | — |
| 25 | Estructura del proyecto | `src/lib/{ai,jobs,rules,db,schemas}`, `components/{canvas,realidad,diagnostico,voz,base}`, `design/tokens.css` | IMPL | — | — | `design/` está en `src/design` (no raíz) | — |
| 26 | Bloque 17 (corrections) junto al 14 | `api/findings/[id]/review` escribe `corrections` siempre | IMPL | Motivo obligatorio salvo aprobar | — | — | — |

## Libro VI · Rendimiento

| # | Requerimiento | Dónde | Estado | Evidencia | Prueba | Problema | Corrección |
|---|---|---|---|---|---|---|---|
| 27 | Ninguna llamada IA en HTTP | grep `ai()` → solo en `lib/ai/agents/*` y handlers del worker | IMPL | Rutas solo `encolar()` | — | — | — |
| 28.2 | `for update skip locked` | `schema.sql` take_job | NP | SQL presente | todo | **RPC ejecutable por cualquier usuario autenticado (P0-01)** | revoke |
| 28.3 | Prioridades 1/2/3/5/7/9 | `jobs/queue.ts` PRIORIDAD | IMPL | — | `jobs.test.ts` | — | — |
| 28.4 | Concurrencia 6, backoff 1/4/16, 2 reintentos, fallido visible | `jobs/worker.ts`; `jobs/reglas.ts`; `fuentes/page.tsx` | IMPL | — | `jobs.test.ts` | Tope por proceso worker, no global | — |
| 28.5 | Idempotencia hash(tipo+source+chunk+version) | `queue.ts` claveIdempotente; `extraer.ts` | PARCIAL | unique index | `jobs.test.ts` | Claims insertados antes de un fallo se duplican al reintentar (P1-10) | `claims.idempotency_key` o borrar por (source,chunk) antes de insertar |
| 28.6 | Lease + barrido + dead letter | `take_job(lease)`, `recover_stale_jobs`, worker cada 60 s | NP | — | `jobs.test.ts` (espejo lógico) | Lease fijo 10 min sin heartbeat (P1-13) | Heartbeat cada 60 s |
| 28.7 | Trocear 8.000 palabras, paralelo, afirmaciones conforme llegan | `extraer.ts` trocear; Realtime en `MatrizRealidad` | PARCIAL | Texto ✔ | — | **PDF/imagen no se trocean** (una llamada; límite del proveedor ~100 pág.) | Partir PDF por páginas (pdf-lib) |
| 29.1 | Una consulta por pantalla; bandeja desde `company_stats`; paginación | `procesoCompleto` (2 consultas); `bandeja.ts`; `api/reality` limit/offset | PARCIAL | — | — | UI de afirmaciones carga 500 de golpe; panorama hace 6+ consultas; `company_stats` vacía hasta el primer refresh del worker | Paginar UI; refrescar al crear empresa |
| 29.2 | Progreso real, nunca rueda | `Progreso.tsx`; `jobs.progreso` en todos los handlers | IMPL | Realtime + sondeo 4 s | — | Cliente no recibe Realtime (RLS) → solo sondeo (P1-12) | Política RLS de lectura de sus jobs |
| 30 | token_usage por llamada; tope por empresa | `db/queries.ts` registrarTokens/superaTope; `worker.ts:42` | IMPL | — | — | Tope solo para p≥5; `superaTope` suma toda la tabla en cada job (O(n)) | Vista agregada |

## Libro VII · Usuarios y entrega

| # | Requerimiento | Dónde | Estado | Evidencia | Prueba | Problema | Corrección |
|---|---|---|---|---|---|---|---|
| 32 | Portal 8 pasos; valor antes de terminar | `portal/page.tsx` ("Encontramos N definiciones… M no coinciden") | IMPL | Texto dinámico desde `company_stats` | — | Depende de `company_stats` (worker) | — |
| 33 | Bandeja: 6 tipos de atención | `lib/bandeja.ts` (admisión, fallidos, revisar, contradicciones, vencidos, lista, trabada) | IMPL | 7 tipos | — | — | — |
| 33 | Revisión: aprobar/corregir/rechazar + motivo → corrections | `api/findings/[id]/review`; `Hallazgo.tsx` | IMPL | — | — | — | — |
| 33 | Llenar por el cliente (`origen: consultor`) | `api/sources` (rol→origen); `EntrevistaConsultor.tsx` | IMPL | — | — | — | — |
| 34 | Frontera: cliente nunca ve crudo | `api/diagnosis` (solo aprobados), `api/reality` (sin estado/pilar), `api/jobs` (sin error técnico), `portal/resultados` (publicados) | PARCIAL | En rutas ✔ | — | **RLS deja pasar** claims.estado/pilar, interview_responses de empleados, participants.token (P0-02/03/04); `/interview/next` y `/answer` no restringen a la sesión propia (P0-06) | Ver RIESGOS |
| 35 | Paquete: PDF + en línea; sin afirmación sin fuente; marca de la consultoría | `VistaEntregable.tsx`; `Imprimir.tsx`; PROMPT_REDACTOR | PARCIAL | En línea ✔; PDF = print | — | "Sin fuente no entra" solo en prompt; marca = nombre de la empresa cliente, no de la consultoría | Config de marca; verificación de fuentes |
| 36 | RLS por tabla | `schema.sql` políticas | NP | 25 tablas con RLS | todo | P0-01..04 | — |
| 36 | Participante: solo su sesión | `api/participar/[token]` | IMPL | `participant_id !== p.id → 403` | — | — | — |
| 37 | Alertas: vence sin movimiento, semana con pendientes, KPI 30 días | `bandeja.ts` frentes_vencidos | PARCIAL | 1 de 3 | — | Faltan 2 alertas | P1-17 |

## Libro VIII · Startup

| # | Requerimiento | Dónde | Estado | Evidencia | Prueba | Problema | Corrección |
|---|---|---|---|---|---|---|---|
| 38 | Correcciones tipificadas (7 motivos) | `corrections.motivo` check; `casos/page.tsx` tabla de motivos | IMPL | — | — | — | — |
| 38 | Biblioteca de casos usada como ejemplos | `cases` | PARCIAL | Se guarda | — | No se recupera para empresas nuevas | Fase 2 |
| 38 | Set de evaluación (cobertura, precisión) | `api/eval/run`; `eval_runs` | PARCIAL | Precisión desde corrections | — | Cobertura requiere `criticos_reales` manual | — |
| 39 | Niveles de autonomía | — | FALTA | No hay gating por métricas | — | El sistema opera en N1 de facto (consultor aprueba todo) ✔ | — |

**Conteo (98 filas):** IMPL 62 · PARCIAL 27 · STUB 1 · FALTA 4 · NP 4. IMPL/total = **63 % realmente implementado**; ponderando PARCIAL al 50 % ≈ 77 % de la superficie existe en algún grado.
