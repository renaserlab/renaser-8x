# SUPABASE READINESS — ¿se puede conectar ya?

**Veredicto original (antes de la corrección P0): NO LISTO.** Ver la actualización al final: los 6 P0 están cerrados.

## Bloqueadores (todos P0, en orden de corrección)

| # | Bloqueador | Archivo | Corrección (tamaño) |
|---|---|---|---|
| 1 | RPC `take_job`, `recover_stale_jobs`, `refresh_company_stats` ejecutables por `anon`/`authenticated` | `supabase/schema.sql` | 3 `revoke` + 3 `grant … to service_role` (5 líneas) |
| 2 | Política `cliente_claims` expone `estado`, `pilar`, `contradice_a`, `explicacion_contradiccion`, `pregunta_sugerida` | `supabase/schema.sql` | Quitar política; vista `claims_cliente` con columnas permitidas + política por membresía (15 líneas); el portal ya usa service role, nada cambia en UI |
| 3 | Políticas `cliente_sessions` / `cliente_responses` dejan leer respuestas de empleados | `supabase/schema.sql` | Restringir a `participants.user_id = auth.uid()` o eliminar (el portal no las necesita) (6 líneas) |
| 4 | Política `cliente_participants` expone `token` | `supabase/schema.sql` | `revoke select (token) on participants from authenticated` o vista (2 líneas) |
| 5 | `/api/companies/[id]/interview/next` y `/api/interviews/[sesion]/answer` permiten al cliente operar sesiones ajenas | `src/app/api/companies/[id]/interview/next/route.ts`, `src/app/api/interviews/[sesion]/answer/route.ts` | Comprobar `participants.user_id === perfil.id` cuando `rol !== 'consultor'` (8 líneas × 2) |
| 6 | PUT del canvas pierde conexiones de nodos nuevos | `src/app/api/processes/[id]/route.ts:45` | Usar `_tmp` como clave del mapa (2 líneas) |

## Correcciones P1 recomendadas ANTES de conectar (rompen el primer caso aunque no la seguridad)

- P1-01 Afirmaciones del equipo nunca llegan a `confirmado` → el diagnóstico ignora al equipo. Decidir regla (quien lo dijo lo sostiene) antes de levantar datos reales.
- P1-07 Conectar `rules/grafo.ts` al PUT y al ARQUITECTO (avisos), para no acumular procesos inválidos desde el primer día.
- P1-10 Idempotencia de claims por tramo (evita duplicados en el primer PDF que falle a la mitad).
- P1-11 Desactivar `alAudio` cuando no haya transcriptor configurado (evita sesiones bloqueadas).
- P1-13 Heartbeat de lease (evita doble extracción del primer documento largo).
- P1-15 Respetar `validado_por` en el contraste (evita que el dueño confirme y el sistema lo deshaga).

## Puede esperar a después de conectar (P1 de metodología que se corrigen con datos reales a la vista)

P1-02/03/04 (cobertura de entrevistas y suficiencia), P1-05/06/08 (modelo de know-how, evidencia por formato, campos de nodo), P1-09 (`requiere_validacion` como estado), P1-12 (Realtime/stats), P1-14 (troceo de PDF), P1-16/17/18/19/20.

## Orden sugerido para el día de conexión

1. Aplicar los 6 bloqueadores (≈ 40 líneas) y agregar a `tests/pendientes.test.ts` los 5 `it.todo` de RLS como tests reales contra Supabase local (`supabase start` + `supabase db reset` con `schema.sql`).
2. Correr `schema.sql` en **Supabase local** primero; verificar: trigger de usuarios, `refresh … concurrently` sobre la vista recién creada, `take_job` con 3 workers, políticas con dos usuarios (consultor, dueño) y un JWT de cliente probando `claims`, `interview_responses`, `participants`, `jobs`.
3. Recién entonces: proyecto remoto, `.env.local`, `npm run dev` + `npm run worker`, empresa #0 (la consultoría).

## Decisión sobre la cola (no ejecutada)

Mantener `jobs` + `take_job`. Evaluar PGMQ solo si el heartbeat (P1-13) resulta frágil en el primer caso real; si se adopta, `jobs` sigue siendo la tabla de registro/UI y PGMQ el transporte, como plantea el capítulo 28.2.


---

# ACTUALIZACIÓN — tras la corrección P0 (2026-08-22)

**Bloqueadores P0: 0 de 6.** Los seis están cerrados en código y SQL, con tests locales; su efecto real (grants, RLS, vistas, transacción) se verifica al ejecutar `schema.sql` contra Postgres.

| # | Bloqueador | Estado |
|---|---|---|
| 1 | RPC de la cola ejecutables por anon/authenticated | Cerrado · `p0-schema` |
| 2 | `cliente_claims` expone columnas internas | Cerrado · vista `claims_cliente` + `frontera.ts` · `p0-schema`, `p0-frontera` |
| 3 | Respuestas de empleados legibles por el dueño | Cerrado · políticas por `user_id` + 403 en `/api/sources` + nombre vaciado en portal · `p0-schema`, `p0-frontera` |
| 4 | `participants.token` expuesto y en claro | Cerrado · hash/expiración/revocación/usos + rotación · `p0-tokens`, `p0-schema` |
| 5 | Rutas de sesión solo comprobaban empresa | Cerrado · `sesiones.ts` · `p0-sesiones` |
| 6 | Canvas perdía conexiones; sin transacción | Cerrado · `guardar_proceso` + `canvas-guardar.ts` · `p0-canvas`, `p0-schema` |

**Estado: NO LISTO para conectar Supabase todavía — pero ya no por seguridad.** Quedan los P1 que rompen el primer caso (P1-01, P1-07, P1-10, P1-11, P1-13, P1-15) y dos nuevos de integridad (P1-21, P1-22). La decisión de pasar a corrección P1 es del usuario; la base de seguridad está cerrada salvo verificación de integración.

## Qué verificar el día de conexión (primero en Supabase local)

1. `supabase start` + ejecutar `schema.sql`. Confirmar que no falla en: `alter table participants drop column if exists token` (tabla recién creada: no-op), creación de vistas, `grant execute … to service_role`.
2. Con un JWT de cliente (dueño): `rpc('take_job')` → 42501; `from('claims')` → 0 filas; `from('claims_cliente')` → solo 9 columnas y sin claims de empleados; `from('participants')` → 0 filas; `from('participants_cliente')` → sin `token_hash`; `from('interview_responses')` → solo las propias.
3. Con service role: `guardar_proceso` con una conexión a id inventado → error y tablas intactas.
4. Linter de Supabase: aceptará advertencia "security definer view" en `claims_cliente`/`participants_cliente` (P2-18, intencional).
5. Convertir los 5 `it.todo [P0-0x]` en tests reales contra la base local.
