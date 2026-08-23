# TEST REPORT — 8X (local, sin Supabase, sin IA, sin navegador)

Comando: `npx vitest run` · Runner: vitest 4 · Node 24 · 2026-08-22

```
Test Files  9 passed | 1 skipped (10)
Tests       87 passed | 21 todo (108)
```

`npx tsc --noEmit` → 0 errores · `npx eslint src worker tests` → 0 errores.

## Por archivo

| Archivo | Tests | Qué demuestra | Módulo real bajo prueba |
|---|---|---|---|
| `tests/vigencia.test.ts` | 7 ✔ | La edad solo dispara validación; propósito nunca; precio a los 3 meses; doc/foto/dato sin fecha → validación; confirmado nunca vuelve a pedir | `src/lib/rules/vigencia.ts` |
| `tests/contradiccion.test.ts` | 9 ✔ | Candidatas solo mismo tipo + actual + distinta fuente/autor; aspiracional excluida; `otro` excluido; pares juzgados/resueltos no se repiten; tope 60; brecha estratégica | `src/lib/rules/contradiccion.ts` |
| `tests/schemas.test.ts` | 9 ✔ | Fecha inválida → null; pilar inválido → transversal; máx. 3 preguntas; uuid en origen_claim_id; hallazgo sin claim_ids rechazado; 3 filtros obligatorios; semanas 1–7 | `src/lib/schemas/index.ts` |
| `tests/evidencia.test.ts` | 15 ✔ | Alto exige 2 fuentes independientes o 1 `dato`; misma persona = 1 fuente; caducado no cuenta; auditor derriba → bajo + requiere_validacion; filtros bloquean; DESCONOCIDO < N | `src/lib/rules/evidencia.ts` |
| `tests/plan.test.ts` | 5 ✔ | Máx. 3 abiertos por semana; se corren frentes; duración conservada; 1–7; huérfanos fuera; 2 primeras semanas solo críticos | `src/lib/rules/plan.ts` |
| `tests/grafo.test.ts` | 10 ✔ | Decisión con 1 salida inválida; salida sin etiqueta; sin fin; camino sin fin; inalcanzable; huérfana; final malo; remove con dependientes; remove/`?` no se automatiza; diff AS-IS/TO-BE; dagre asigna posiciones únicas | `src/lib/rules/grafo.ts`, `src/lib/layout.ts` |
| `tests/jobs.test.ts` | 7 ✔ | Orden p1 < p5 < p7; FIFO a igual prioridad; solo pendientes; prioridades del spec; clave idempotente determinista; pendiente→fallido al agotar; lease vencido; backoff 1/4/16 y tope 2 | `src/lib/jobs/reglas.ts`, `src/lib/jobs/queue.ts` |
| `tests/knowhow.test.ts` | 11 ✔ | Unidad incompleta se guarda con lo dicho; destino; 6 preguntas del minero en el banco; **sesgos**: ningún prompt culpa al dueño ni absuelve a la persona; lentes presentes y no bloqueados; "ante la duda false"; "nunca estimes fecha"; sin jerga | `src/lib/ai/agents/*` (texto), `schemas` |
| `tests/flujo-demo.test.ts` | 14 ✔ | EMPRESA DEMO completa (ver abajo) | reglas + schemas + fixture |
| `tests/pendientes.test.ts` | 21 todo | Lo que no se puede probar localmente (RLS, RPC, Storage, Realtime, navegador, IA) | — |

## EMPRESA DEMO · Frutas del Valle SAC (`tests/fixtures/empresa-demo.ts`)

7 personas (dueño, socia, 2 líderes, 3 colaboradores) · 9 fuentes (plan 2022, foto de organigrama sin fecha, lista de precios, CSV de pedidos, 5 entrevistas) · 15 fragmentos con página/celda/minuto · 15 afirmaciones · 6 juicios de contraste simulados · 5 validaciones · 7 sesiones · 7 respuestas · 1 unidad de know-how (Rosa) · 5 hallazgos simulados (1 que culpa a una persona, 1 que vacía el propósito) · AS-IS y TO-BE de ventas · plan con 5 frentes (4 en la semana 1 y 1 huérfano).

| § | Paso | Resultado |
|---|---|---|
| 1 | Trazabilidad claim→fragmento→fuente por formato; rol si es persona; fecha nunca estimada | ✔ |
| 2 | Tres versiones: documentos / dueño / equipo | ✔ |
| 3 | Vigencia: plan 2022 y organigrama sin fecha → validación; dato de julio no; ningún estado cambió | ✔ (tras corregir el bug `?? 24`) |
| 4 | Contraste: 3 contradicciones reales de 6 pares; la aspiracional no entra; lo dicho hoy por el dueño no se pisa; "ventas funciona bien" no es contradicción mecánica | ✔ |
| 5 | Brecha estratégica entre visión 2022 y visión actual | ✔ (la función existe; **en runtime nadie la llama**) |
| 6 | Tres botones: caducado lo decide el dueño | ✔ |
| 7 | PERSONA→ROL→SESIÓN→PREGUNTA→RESPUESTA→AFIRMACIÓN; 5 personas en paralelo | ✔ (con ids explícitos del fixture; el runtime no guarda `response_id`) |
| 8 | Sueño del dueño: la empresa del plan ≠ la vida que quiere (30 h, solo Lima) | ✔ |
| 9 | Know-how de Rosa estructurado, destino criterio_calidad, escalamiento | ✔ |
| 10 | Diagnóstico bloqueado con contradicciones abiertas; DESCONOCIDO con pocas confirmadas; **las afirmaciones del equipo siguen sin_verificar** | ✔ (documenta P1-01) |
| 11 | Red team: "jefe incompetente" → bajo + requiere_validacion + bloqueado por Sabiduría; descuentos → alto (2 personas); fruta → alto (dato+2 personas) y cuestiona al dueño; canal único → alto (1 dato); subir precio → bloqueado por Propósito; 2 pilares críticos | ✔ |
| 12 | AS-IS válido, final malo, remove con dependientes detectado | ✔ |
| 13 | TO-BE: conserva, elimina el remove, marca create, no automatiza lo indefinido, `software` en paso de regla fija | ✔ |
| 14 | Plan: 4 en semana 1 → 3; huérfano fuera; 2 primeras semanas solo críticos | ✔ |

## Fallos encontrados por los tests durante la auditoría (ya en verde)

1. `vigencia.ts`: `VIDA_UTIL_MESES[tipo] ?? 24` → propósito pedía validación a los 24 meses. Corregido.
2. `vigencia.ts`: foto/dato sin fecha no disparaban validación. Corregido (`FUENTES_FECHABLES`).
3. Dos aserciones del fixture estaban mal planteadas (estado tras validación; etiqueta de un nodo `improve`); corregido el fixture, no el código.

## Lo que los tests NO cubren (21 todo)

RLS (4 con P0 conocidos), RPC ejecutables por cualquiera (P0-01), `take_job` concurrente, `recover_stale_jobs`, idempotencia de claims, Storage/signed URL, Realtime para clientes, `company_stats`, trigger de usuarios, PUT del canvas (P0-05), React Flow handles, voz en Chrome/Firefox, bloqueo por audio sin transcriptor, `pendienteTranscripcion`, y 4 métricas que exigen llamadas reales al modelo.

**Tests totales 108 · aprobados 87 · fallidos 0 · pendientes (todo) 21.**


---

# ACTUALIZACIÓN — Fase de corrección P0 (2026-08-22)

```
npx vitest run     → Test Files 14 passed | 1 skipped (15) · Tests 145 passed | 22 todo (167)
npx tsc --noEmit   → 0 errores
npx eslint src worker tests → 0 errores
npx next build     → exit 0 (32 rutas; nueva: /api/participants/[id]/enlace)
```

## Tests nuevos por P0

| Archivo | Tests | P0 | Qué demuestra |
|---|---|---|---|
| `tests/p0-schema.test.ts` | 19 | 01, 02, 03, 04, 05(canvas) + regresión | Verificación estática del SQL que se va a ejecutar: revoke/grant por función (y ninguna concesión a anon/authenticated), ausencia de `cliente_claims`/`cliente_participants`, columnas exactas de `claims_cliente` (ninguna interna), filtro de pertenencia y exclusión de terceros, políticas de sesiones/respuestas con `user_id = auth.uid()`, columna `token` eliminada y columnas de hash/expiración/revocación/usos, `guardar_proceso` con resolución `_tmp` y `raise exception`; regresión de políticas existentes. |
| `tests/p0-tokens.test.ts` | 11 | 04 | 192 bits aleatorios, hash irreversible y estable, válido, de otra sesión, vencido, revocado, usos agotados, sin token, formato manipulado (sql/path/vacío/largo), expiración 30 días, redacción en logs. |
| `tests/p0-sesiones.test.ts` | 10 | 05 (sesiones) | dueño→empleada 403 · empleado A→B 403 · propia ✔ · dueño propia ✔ · consultor ✔ · otra empresa 404 · inexistente 404 · acceso a empresa no basta · sesión por enlace no operable con cuenta · company_id manipulado ignorado. |
| `tests/p0-frontera.test.ts` | 5 | 02, 03 | La fila del cliente no contiene columnas internas; traducción a pregunta + 3 opciones; `requiere_validacion`; lo dicho por otra persona invisible; contraparte sin ids. |
| `tests/p0-canvas.test.ts` | 13 | 06 (canvas) | Dos existentes · nuevo↔existente · dos nuevos · decisión nueva con 2 salidas · eliminar nodo · eliminar conexión · posiciones · conexión inválida → rollback · fallo intermedio → rollback · ningún `_tmp` almacenado · ninguna conexión desaparece (7) · validación previa · canvas manipulado con id de otro proceso. |

Total nuevos: **58**. Ningún test existente fue eliminado ni cambió de expectativa (los 87 anteriores siguen idénticos).

## Qué sigue requiriendo infraestructura (22 todo)

- **Supabase (13):** 5 marcados `[P0-0x]` (efecto real de grants, RLS, vistas y transacción), aislamiento A/B, `take_job` concurrente, `recover_stale_jobs`, idempotencia de claims, Storage, Realtime, `company_stats`, trigger de usuarios. Motivo: grants, políticas, vistas y transacciones solo existen dentro de Postgres.
- **Navegador (5):** e2e del canvas, handles de React Flow, voz Chrome/Firefox, bloqueo por audio, `pendienteTranscripcion`. Motivo: React Flow, Web Speech y MediaRecorder no existen en Node.
- **Modelo real (4):** extractor sobre PDF, cobertura del entrevistador, falsos positivos del contrastador, precisión del diagnosticador.

**Tests totales 167 · aprobados 145 · fallidos 0 · todo (infraestructura) 22.**
