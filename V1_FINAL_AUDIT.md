# 8X V1 — AUDITORÍA FINAL (fase 17)

Fecha: 2026-08-23 · Commit: ver `git log` · Versión: 1.0.0-rc.1 (no se etiqueta `v1.0.0`: ver criterios abajo).

## Veredicto

**NO LISTA para V1 final. LISTA como release candidate.** Todo lo ejecutable localmente está hecho y verificado; lo que falta para V1 requiere infraestructura o personas externas: credenciales de Supabase (integración real), proveedor de IA (benchmark con modelo real), un dispositivo móvil y personas (UX real) y los datos de RENASER (piloto). Cada uno está preparado para ejecutarse con un solo comando cuando exista el insumo.

## Puertas

| Puerta | Criterio | Resultado |
|---|---|---|
| 1 | P0 = 0 y P1 bloqueantes = 0; typecheck, lint, build, vitest | **PASS** — P0 0 · P1 bloqueantes 0 · tsc 0 · eslint 0 · build 0 · 238 tests pass, 0 fail |
| 2 | Seguridad crítica = 0 pendientes antes de Supabase | **PASS** — P2-17 (token en URL) y P2-18 (vistas) reclasificados y cerrados/justificados; ver V1_SECURITY_REPORT |
| 3 | Tests Supabase críticos = 100 % | **PASS (2026-08-23)** — 24/24 contra el proyecto remoto (`npm run test:supabase`). Ver SUPABASE_READINESS.md para los fallos reales corregidos |
| 4 | Sin pérdida de jobs, sin mezcla, sin errores silenciosos, sin deadlock, UI no bloqueada, P0 = 0 | **PASS (simulado)** — 2010 trabajos de 30 empresas: 0 perdidos, 0 fallidos, 0 mezclados; 7 escenarios de recuperación; ver V1_PERFORMANCE_REPORT |

## Fase por fase

| Fase | Qué se hizo | Estado |
|---|---|---|
| 1 P1 | 22 P1 clasificados; 20 cerrados en código; 2 no bloqueantes a backlog (ver tabla) | PASS |
| 2 endurecimiento | P2-06 (401 en API), P2-10/P1-22 (borrado), P2-12 (seguimiento extrae), P2-17 (token fuera de URL: sessionStorage + cabecera), P2-18 (justificado), P2-04 (archivos huérfanos) | PASS |
| 3 Supabase prep | `schema.sql` único, orden auditado (extensiones → tablas → índices → vista → funciones → trigger → helpers → RLS → vistas seguras → función atómica → grants → storage → realtime). FK de `know_how` a `processes` añadida tras crear `processes`. `drop function take_job(int)` antes del nuevo. | PASS |
| 4 conectar | `.env.example` completo; nada hardcodeado; logs redactan tokens | PASS (2026-08-23, proyecto remoto; schema aplicado) |
| 5 tests Supabase | 24 tests reales: AUTH, RLS A/B, dueño→empleado, columnas internas, tokens, RPC anon/auth/service, findings pendiente/aprobado, storage A→B, transacción, queue concurrente, idempotencia, vistas, trigger, realtime | PASS 24/24 (2026-08-23) |
| 6 demo e2e | `tests/demo-auditoria.test.ts`: CREATE→…→DELIVERABLE con lógica real, IA simulada | PASS |
| 7 auditoría demo | cobertura 1.0 · precisión 1.0 · falsos positivos 0 · causa raíz 1.0 · preservación 1.0 · contradicciones 1.0 · preguntas 1.0 | PASS (sobre salidas simuladas; no mide al modelo) |
| 8 IA real | `npm run benchmark` (scripts/benchmark-ia.ts) compara modelo real vs esperado y registra costo/latencia | BLOCKED_EXTERNAL (ANTHROPIC_API_KEY) |
| 9 UX real | Requisitos verificables por código: 44 px, 17 px, foco, reduced-motion, etiquetas en todos los controles (test) · autoguardado de respuestas (cada respuesta persiste al enviar) · conexión lenta: sondeo con reintento | PARCIAL — la prueba con 3 personas reales es BLOCKED_EXTERNAL |
| 10 visual | `tests/visual.test.ts`: sin degradados, violeta, vidrio, rounded-2xl, sombras, emoji, sparkle, "powered by", spinners; sin Inter; sin "IA" en el portal | PASS |
| 11 RENASER | No hay datos reales en este entorno | BLOCKED_EXTERNAL |
| 12 benchmark | `benchmark/esperado.json` v1.0.0 + `src/lib/benchmark.ts` + umbrales (cobertura ≥ .85, precisión ≥ .80, FP = 0, causa ≥ .70, preservación 1, contradicciones 1) | PASS |
| 13 carga 30 | simulador con semántica real de take_job/recover/heartbeat; fairness por empresa (≤2 pesados), tope global, prioridad interactiva | PASS (simulado) |
| 14 seguridad | guardia anti-inyección en 12 prompts + delimitación del material; validación de archivos; auditoría de rutas; secretos fuera del cliente | PASS (estático) |
| 15 observabilidad | `token_usage` con modelo, versión de prompt, latencia, error; logs sin tokens ni contenido | PASS |
| 16 agent ready | `agent_specs` (ficha completa, sin runtime) enlazada a `process_nodes`; `know_how.process_node_id` | PASS |
| 17 freeze | Documentos V1_* y BACKLOG_V2; tag `v1.0.0-rc.1` | PASS |

## P1: clasificación y cierre

| ID | Clase | Cierre | Dónde |
|---|---|---|---|
| P1-01 voz del equipo | A metodología | Claims de entrevista nacen `confirmado` por quien los dijo; la independencia de fuentes evita que una opinión sostenga un crítico | `handlers/extraer.ts` |
| P1-02 sueño del dueño | A | Banco de 23 preguntas en 6 bloques + cobertura obligatoria en código | `rules/cobertura.ts`, `handlers/entrevista.ts` |
| P1-03 personal | A | 4 bloques, 21 preguntas (las 15 investigaciones + 4 de verdad operativa) | ídem |
| P1-04 suficiencia | A | `levantamientoCompleto`, `diagnosticoListo`, `cabeEnUnDia`; bandeja y `/diagnose` (409 con motivos) | `rules/suficiencia.ts`, `bandeja.ts` |
| P1-05 know-how | A | rol, proceso, nodo, criterio_experto, criticidad, documentado, sop_id; riesgo vacío → hallazgo | `schema.sql`, `handlers/entrevista.ts` |
| P1-06 evidencia por formato | B evidencia | `response_id`; Whisper `verbose_json` → `audio_desde/hasta`; CSV fila/columna → `celda`; PDF por páginas con offset | `handlers/extraer.ts` |
| P1-07 validación de grafos | D procesos | Avisos en ARQUITECTO/TO-BE (campo `problema`) y en vivo en el canvas; no bloquea (el dibujo real puede estar incompleto a propósito) | `handlers/procesos.ts`, `Canvas.tsx` |
| P1-08 campos de nodo | D | rol, espera, entrada, salida, evidencia, estándar, know_how_id en tabla, función SQL, panel y arquitecto | varios |
| P1-09 requiere_validacion | B | Columna + badge + bloqueo de aprobación sin evidencia extra; excluido de lo visible y del plan | `findings`, `Hallazgo.tsx`, `review/route.ts` |
| P1-10 idempotencia claims | F arquitectura | `claims.idempotency_key` único parcial | `schema.sql`, `extraer.ts` |
| P1-11 audio sin transcriptor | E UX | `puedeTranscribir()`; UI no ofrece audio; job libera la pregunta | `provider.ts`, `Entrevista.tsx`, `entrevista.ts` |
| P1-12 realtime/stats | E | Refresh al crear empresa; bandeja con fallback "empresa nueva". Realtime para clientes sigue por sondeo (no bloqueante) | `bandeja.ts`, `companies/route.ts` |
| P1-13 heartbeat | F | `heartbeat_jobs` cada 60 s | `worker.ts`, `schema.sql` |
| P1-14 PDF troceo | F | pdf-lib: 15 páginas por tramo | `extraer.ts` |
| P1-15 validado_por | B | El contraste no pisa lo validado; pregunta | `contrastar.ts` |
| P1-16 invitaciones | C seguridad | `invitations` + aceptación al entrar + `/invitar` | `auth.ts`, `invitar/route.ts` |
| P1-17 monitoreo | A | Alertas: escalado a 2 semanas, corte quincenal vencido; regresiones → hallazgos con evidencia | `bandeja.ts`, `close/route.ts` |
| P1-18 entregables | B | Snapshot al publicar; verificación "sin fuente no entra" y sin referentes; `MARCA_CONSULTORIA` | `plan.ts`, `publish/route.ts`, `VistaEntregable.tsx` |
| P1-19 consolidación | A | Job `consolidar` tras los 4 pilares (dedupe por evidencia); `preguntas_pendientes` vuelven al levantamiento | `diagnostico.ts` |
| P1-20 límites | F | fairness por empresa, tope global en `take_job`; tope de tokens para todo job | `schema.sql`, `worker.ts` |
| P1-21 validar ajenos | C | `visibleParaCliente` en `/validate` | `validate/route.ts` |
| P1-22 borrar ajenos | C | Cliente solo borra fuentes propias no-entrevista | `extract/route.ts` |

No bloqueantes que quedan en backlog: Realtime para clientes (sondeo funciona), cadena PERSONA→PUESTO→PROCESO como modelo, detección mecánica de patrones desde datos (canal único por `group by`).

## Criterios finales de V1 (del pedido)

| Criterio | Estado |
|---|---|
| P0 = 0 | PASS |
| P1 bloqueantes = 0 | PASS |
| tests locales críticos = 100 % | PASS (238/238) |
| tests Supabase críticos = 100 % | PASS (24/24, 2026-08-23) |
| aislamiento multiempresa | PASS (estático + integración real 2026-08-23) |
| participantes | PASS (token hash/expira/revoca/usos, sesión propia, 403/404) |
| know-how | PASS |
| sueño del dueño | PASS (banco + cobertura + patrón sueno_vs_empresa) |
| evidencia exacta | PASS (modelo + runtime por formato) |
| diagnóstico 4P | PASS (dimensiones + calibración + auditor + consolidación) |
| Propósito / Sabiduría / Excelencia | PASS (schema + función + prompt con sub-preguntas + tests) |
| AS-IS / TO-BE | PASS |
| rollback canvas | PASS (lógica + SQL) · e2e navegador BLOCKED |
| queue recovery | PASS (simulado) · Postgres real BLOCKED |
| 30 empresas | PASS (simulado) |
| seguridad | PASS (estático) · pentest sobre instancia real BLOCKED |
| Empresa Demo end-to-end | PASS (lógica real, IA simulada) · con IA real BLOCKED |
| piloto RENASER usable | BLOCKED_EXTERNAL |

**LISTO PARA V1: NO** (por los BLOCKED_EXTERNAL). Todo lo bloqueado tiene su comando: `npm run test:supabase`, `npm run benchmark`, y la prueba móvil/RENASER con el flujo ya documentado en README.
