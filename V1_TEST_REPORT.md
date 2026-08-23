# 8X V1 — INFORME DE TESTS

```
npx tsc --noEmit              → 0 errores
npx eslint src worker tests   → 0 errores
npx next build                → exit 0 (34 rutas)
npx vitest run                → Test Files 21 passed | 2 skipped (23)
                                Tests 242 passed | 24 skipped | 23 todo (289) · 0 fallidos  (2026-08-23, tras el canje único del enlace: +4 en p0-tokens)
```

## Por archivo

| Archivo | Tests | Cubre |
|---|---|---|
| `vigencia.test.ts` | 7 | Edad solo dispara validación; propósito nunca caduca; foto/dato sin fecha |
| `contradiccion.test.ts` | 9 | Candidatas mecánicas, tope, brechas |
| `schemas.test.ts` | 9 | Salidas Zod de los 9 agentes |
| `evidencia.test.ts` | 15 | 2 fuentes o 1 fuerte; auditor; filtros; estado del pilar |
| `plan.test.ts` | 5 | Máx. 3 frentes/semana; huérfanos; críticos primero |
| `grafo.test.ts` | 10 | Decisión ≥2 salidas, fin, final malo, remove con dependientes, diff AS-IS/TO-BE, dagre |
| `jobs.test.ts` | 7 | Prioridad, idempotencia, retry, lease, backoff |
| `knowhow.test.ts` | 11 | Minero; sesgos en prompts; lentes |
| `flujo-demo.test.ts` | 14 | EMPRESA DEMO (reglas) |
| `p0-schema.test.ts` | 21 | Grants, vistas, políticas, función atómica, regresión (estático sobre schema.sql) |
| `p0-tokens.test.ts` | 11 | Token: aleatoriedad, hash, vencido, revocado, usos, formato, logs |
| `p0-sesiones.test.ts` | 10 | Autorización de sesiones: 403/404 |
| `p0-frontera.test.ts` | 5 | Fila del cliente sin columnas internas; voces ajenas invisibles |
| `p0-canvas.test.ts` | 13 | Persistencia tmp→uuid, integridad, rollback |
| `fase1.test.ts` | 24 | Cobertura de entrevistas, suficiencia, archivos, fuerza de evidencia, relaciones, know-how, nodos, filtros, documentos, evidencia por formato, patrones/dimensiones |
| `metodologia.test.ts` | 9 | /methodology ↔ código; referentes invisibles al cliente |
| `visual.test.ts` | 12 | Prohibiciones del capítulo 18; tipografía; accesibilidad; etiquetas |
| `seguridad.test.ts` | 12 | Inyección de prompt; secretos; superficie de API |
| `carga-30.test.ts` | 12 | 30 empresas; fairness; tope global; 7 escenarios de recuperación |
| `benchmark.test.ts` | 4 | Set congelado aprueba lo correcto y rechaza lo inventado |
| `demo-auditoria.test.ts` | 13 | Flujo completo + auditoría del resultado (cobertura 1.0, FP 0, preservación 1.0) |
| `pendientes.test.ts` | 22 todo | Lo que requiere navegador o modelo real |
| `supabase/integracion.test.ts` | **24 passed** (2026-08-23, proyecto remoto real vía `npm run test:supabase`; skipped en `npx vitest run` sin `SUPABASE_TEST_*`) + 1 todo | AUTH, RLS, RPC, VIEWS, STORAGE, TRANSACTION, QUEUE, REALTIME |

## Qué está probado y qué no

- **Probado (local):** toda la lógica metodológica (reglas puras), los esquemas de salida, el texto exacto del SQL de seguridad, el algoritmo de persistencia del canvas, la planificación y recuperación de la cola (simulada), la frontera de columnas, los tokens, la autorización de sesiones, el flujo completo de la empresa demo con salidas de IA simuladas, y las prohibiciones visuales por análisis de código.
- **Probado (Supabase real, 2026-08-23):** RLS/grants/vistas/RPC/storage/transacción/cola/realtime contra el proyecto remoto: 24/24.
- **No probado (BLOCKED_EXTERNAL):** comportamiento del modelo real (`npm run benchmark`), React Flow en navegador, voz en Chrome/Firefox, UX con personas, piloto RENASER.

## Integración real (2026-08-23)

- **Benchmark con el modelo de producción (`gemini-3.7-flash`, facturación activa): PASS** — cobertura 1.0 · precisión 0.857 · falsos positivos 0 · causa raíz 0.833 · preservación de fortalezas 1.0 · contradicciones 1.0 (`benchmark/ultimo-resultado.json`). Umbrales y fixture intactos; los fallos previos se corrigieron en su causa real: temperatura sin fijar (Gemini usa 1.0 por defecto → varianza enorme), consolidación cross-pilar (naturaleza problema/fortaleza + evidencia subconjunto, igual en worker y benchmark), emparejado de medición uno-a-uno y simétrico, y reglas de fidelidad/fortalezas/vigencia en los prompts.
- **EMPRESA DEMO de extremo a extremo real (Supabase + Gemini + worker): PASS** — 31 claims extraídos de fuentes y entrevistas reales, las 3 contradicciones sembradas resueltas por las vías reales (relación contradicts o actualización validada por el dueño), diagnóstico en los 4 pilares, cobertura 1.0 con 0 inventados, fortaleza de Rosa preservada (y primera acción del plan: documentar su criterio), know-how minado con la señal, AS-IS + TO-BE generados por el ARQUITECTO, plan con ≤3 frentes/semana y 7 entregables (`benchmark/demo-e2e-resultado.json`; empresa visible en la app como "EMPRESA DEMO E2E").

- `npm run test:supabase`: **24/24** contra el proyecto remoto (se mantuvo 24/24 tras todos los cambios de esta fase).
- Ciclo real en navegador con Supabase + Gemini: enlace de participante canjeado, pregunta generada por el modelo, respuesta guardada, claims extraídos (5, bien clasificados por pilar), contraste corrido y repregunta operativa ("¿Dónde pierdes más tiempo en tu ruta?").
- Responsive auditado por DOM en 375/390/430/768/1024/1280/1440 px: sin overflow horizontal, controles ≥ 44 px (entrar, registro, participante).
- PWA: `/manifest.webmanifest`, `/icon`, `/apple-icon` públicos y servidos (200); viewport con `viewport-fit=cover` y safe areas.
- `schemas.test.ts`: el hallazgo sin `claim_ids` ahora valida en esquema y lo descarta el filtro de código (la regla "sin evidencia no entra" se conserva; antes un solo hallazgo sin ids invalidaba el pilar entero — visto con Gemini real).

## Tests modificados en esta fase

- `evidencia.test.ts`: "evidencia caducada → medio" pasó a "→ bajo + requiere validación" (regla más estricta, deliberada).
- `p0-schema.test.ts`: firma de `take_job` (ahora con fairness y tope global) y dos funciones nuevas.
- `knowhow.test.ts`: las preguntas del minero se comprueban contra el banco nuevo (normalizando acentos).
- `flujo-demo.test.ts` §10 no cambió: sigue documentando el estado previo del fixture; la regla P1-01 se prueba en `demo-auditoria.test.ts`.
Ningún test se eliminó.
