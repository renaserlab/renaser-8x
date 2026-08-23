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
| `supabase/integracion.test.ts` | 24 skipped + 1 todo | AUTH, RLS, RPC, VIEWS, STORAGE, TRANSACTION, QUEUE, REALTIME — corren con `SUPABASE_TEST_*` |

## Qué está probado y qué no

- **Probado (local):** toda la lógica metodológica (reglas puras), los esquemas de salida, el texto exacto del SQL de seguridad, el algoritmo de persistencia del canvas, la planificación y recuperación de la cola (simulada), la frontera de columnas, los tokens, la autorización de sesiones, el flujo completo de la empresa demo con salidas de IA simuladas, y las prohibiciones visuales por análisis de código.
- **No probado (BLOCKED_EXTERNAL):** efecto real de RLS/grants/vistas/transacción en Postgres (24 tests escritos), comportamiento del modelo real (`npm run benchmark`), React Flow en navegador, voz en Chrome/Firefox, UX con personas, piloto RENASER.

## Tests modificados en esta fase

- `evidencia.test.ts`: "evidencia caducada → medio" pasó a "→ bajo + requiere validación" (regla más estricta, deliberada).
- `p0-schema.test.ts`: firma de `take_job` (ahora con fairness y tope global) y dos funciones nuevas.
- `knowhow.test.ts`: las preguntas del minero se comprueban contra el banco nuevo (normalizando acentos).
- `flujo-demo.test.ts` §10 no cambió: sigue documentando el estado previo del fixture; la regla P1-01 se prueba en `demo-auditoria.test.ts`.
Ningún test se eliminó.
