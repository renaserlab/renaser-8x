# 8X V1 — INFORME DE RENDIMIENTO (fase 13)

Método: simulación determinista (`src/lib/jobs/simulador.ts`) con la semántica exacta de `take_job` (prioridad, FIFO, fairness por empresa, tope global), `recover_stale_jobs`, `heartbeat_jobs` y el bucle del worker (concurrencia, backoff 1 s/4 s/16 s, 3 intentos, dead letter). No mide Postgres ni red: mide planificación y recuperación. Test: `tests/carga-30.test.ts`.

## Dataset: 30 empresas simultáneas

Por empresa: 3 documentos × 4 tramos (20–60 s cada uno) · 6 personas × 8 preguntas (3–5 s; llegan una cada ~90 s por persona) · 1 contraste (30 s) · 4 diagnósticos (60 s) · 2 procesos por voz (8 s). **Total 2.010 trabajos.** Configuración: 3 workers × 6 = 18 llamadas simultáneas, tope global 18, ≤2 pesados por empresa.

| Métrica | Resultado |
|---|---|
| Trabajos terminados | 2.010 / 2.010 · fallidos 0 · perdidos 0 · mezclados 0 |
| Tiempo total | 28 min |
| Espera interactiva (entrevista/proceso en vivo) p95 | < 120 s (criterio) · máx. 148 s |
| Espera lote (documentos/diagnóstico) p50 / p95 / máx | 15 s / 21,5 min / 27 min |
| Latencia p95 (tomado→hecho) | 120 s |
| Reintentos | 0 |
| Tokens simulados / costo estimado | 4,02 M / ≈ USD 24 (a 6 USD/M) |

Lectura: con 30 empresas cargando todo a la vez, las personas que conversan nunca esperan detrás de los PDF (prioridad 1–3 antes que 5–9), y los documentos terminan en menos de media hora. Para que 180 personas respondan simultáneamente con p95 < 2 min hacen falta ~18 llamadas concurrentes al proveedor: con 12 (2 workers) el p95 interactivo sube a ~9 min. **Dimensionamiento recomendado: 3 workers (o 1 worker con `WORKER_CONCURRENCIA=18` si la cuota del proveedor lo permite).**

## 13.1 Fairness · 13.2 Prioridad

- `take_job` no entrega un trabajo pesado (p ≥ 5) a una empresa que ya tiene 2 corriendo; los interactivos (p < 5) no tienen ese límite. Test: 8 pesados de A y 2 de B → se toman 2 y 2.
- Tope global `max_global` (12 por defecto, 18 en la prueba) aplica a la suma de todos los workers.
- Orden: prioridad ascendente, luego antigüedad.

## 13.3 Recovery (7 escenarios, todos PASS)

| Escenario | Resultado |
|---|---|
| Worker muerto con 6 trabajos en vuelo | lease vence (2 min en la prueba), barrido los devuelve, el otro worker los termina; 0 fallidos |
| Rate limit transitorio | 2 reintentos internos (1 s, 4 s) dentro del mismo intento; termina con `intentos = 1` |
| Proveedor caído persistente | 3 intentos → `fallido` visible con `error = proveedor_caido`; no desaparece |
| JSON inválido una vez | reintento → hecho con `intentos = 2` |
| Archivo ilegible persistente | `fallido` con el error |
| Timeout de un trabajo largo (8 min > lease 2 min) | heartbeat renueva el lease: termina con `intentos = 1`, sin duplicar |
| Job duplicado | clave idempotente → ignorado |
| Navegador cerrado | el trabajo ya está en la cola; termina; el resultado espera en la base |

## Consultas y pantallas

- Canvas: 2 consultas (nodos, conexiones). Guardado: 1 RPC atómica.
- Bandeja: `company_stats` (materializada, refresco cada 60 s y al crear empresa) + 1 consulta de suficiencia por empresa en levantamiento (≤30 empresas → ≤30 consultas pequeñas).
- Afirmaciones: API paginada (`limit/offset`); la UI carga 500 (P2 backlog: paginar UI).
- Tope de costo: `superaTope` suma `token_usage` por empresa en cada job (O(n) filas de esa empresa; aceptable hasta ~10⁵ llamadas; V2: vista agregada).

## Medido con Gemini real (2026-08-23, fase de integración)

| Medición | Resultado |
|---|---|
| Entrevistador (pregunta siguiente), `gemini-3.5-flash-lite` | 1,7 s · 2.553 entrada + 54 salida |
| Ciclo completo respuesta→extraer→contrastar→repregunta (worker + Supabase reales) | < 12 s de punta a punta |
| Benchmark completo (15 llamadas, `gemini-3.5-flash-lite`) | 61 s · 38.471 tokens |
| Benchmark completo (15 llamadas, `gemini-3.7-flash`, facturación) | 168-455 s (según 503) · ~39.700 tokens · **PASS** |
| EMPRESA DEMO e2e (≈40 jobs reales: extracción, contraste, minería, arquitecto, 4 diagnósticos, to-be, plan, entregables) | ≈ 12 min de pipeline · 0 jobs fallidos |
| Costo real Gemini | plan gratuito (USD 0); el estimado de 6 USD/M del informe corresponde a Anthropic |

Nota operativa: el plan gratuito de Gemini limita ~20 solicitudes/día por modelo; para operar 30 empresas hace falta facturación en Google AI Studio. `gemini-3.7-flash` mostró 503 intermitentes ("high demand"): el adaptador reintenta (hasta 5, backoff exponencial) y el worker aplica su propio backoff.

## No medido (BLOCKED_EXTERNAL)

Latencia real del proveedor, tiempo de `take_job` bajo contención real en Postgres, Realtime bajo carga, tiempo de extracción de un PDF de 120 páginas (8 tramos en paralelo). Los tests de integración miden `take_job` concurrente y `recover_stale_jobs` cuando haya credenciales.
