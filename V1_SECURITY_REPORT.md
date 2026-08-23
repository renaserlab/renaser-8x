# 8X V1 — INFORME DE SEGURIDAD (fase 14)

Alcance: código y SQL del repositorio. Ataques ejecutados por razonamiento y por tests estáticos/unitarios; los que exigen una instancia viva están marcados BLOCKED_EXTERNAL con su test de integración ya escrito.

## Superficie atacada

| Vector | Ataque | Defensa | Verificación |
|---|---|---|---|
| AUTH | Sesión inexistente llama `/api/*` | `proxy.ts` → 401 JSON; `protegido()` → 401 | `tests/seguridad.test.ts` (toda ruta no pública usa `protegido`) |
| RLS | Empresa A lee B | `mis_empresas()` en 15 políticas; 8 tablas sin política de cliente | `p0-schema` (estático) · `supabase/integracion` (real: PASS 2026-08-23) |
| RLS | Dueño lee respuestas/sesiones de empleados | Políticas por `participants.user_id = auth.uid()`; `/api/sources` 403 en entrevistas; nombres vaciados en `portal/resultados` | `p0-schema`, `p0-frontera` · integración PASS |
| IDOR | Cliente opera sesión ajena por `session_id` | `autorizaSesion`: 403 propia empresa / 404 ajena o inexistente | `p0-sesiones` (10 casos) |
| IDOR | Cliente valida/borra claims o fuentes ajenas | `visibleParaCliente` en `/validate`; `/extract` DELETE solo origen cliente y no entrevista | `p0-frontera`, revisión de rutas |
| IDOR | Canvas con ids de otro proceso | ids ajenos tratados como nuevos; conexión a desconocido → 400; en SQL → exception/rollback | `p0-canvas` (13) |
| TOKENS | Enlace de participante: fuga, reuso, fuerza bruta | **Enlace de un solo uso**: 192 bits base64url, solo hash en DB, expira 30 d, revocable. Al abrirse se canjea (`POST /api/participar/canjear`, update condicional por hash → sin carrera) por un token de sesión nuevo cuyo hash sustituye al del enlace: el enlace original queda inutilizado (`token_canjeado_at`). La sesión vive en el dispositivo (localStorage), viaja en cabecera `x-participante-token`, hereda la expiración, es revocable y tiene tope de usos; la URL se reemplaza por `/participar/sesion`. Sin canje previo, ninguna ruta acepta el token. Logs redactados. | `p0-tokens` (15), `seguridad`, integración: canje condicional |
| SIGNED URLS | Archivo de A pedido por B | bucket privado; política por carpeta de empresa; URL firmada 600 s solo desde servidor tras `exigirAcceso` | integración PASS (A obtiene URL firmada; B recibe 403/404) |
| RPC | `take_job`, `recover_stale_jobs`, `refresh_company_stats`, `guardar_proceso`, `heartbeat_jobs`, `archivos_de_empresa` desde el navegador | `revoke … from public, anon, authenticated; grant … to service_role` | `p0-schema` (6 funciones) · integración PASS (anon/authenticated DENY, service_role ALLOW) |
| SERVICE_ROLE | Llega al navegador | Solo en `supabaseAdmin()` (server); ningún `"use client"` la importa; ningún `NEXT_PUBLIC_` | `seguridad` |
| STORAGE | Ruta manipulada (`../`), nombre raro, MIME falso | `rutaStorage` exige uuid de empresa y sanea el nombre; `validarArchivo`: whitelist MIME/extensión, coincidencia, tamaño 0–30 MB | `fase1` › archivos |
| API INPUT | JSON inválido, campos extra, `tipo` arbitrario | `leerJSON` tolerante; whitelist de campos en PATCH; `tipo` validado contra conjunto | revisión |
| FILES | Word/Excel/HTML/EXE | Rechazados con mensaje; sin ejecución de contenido; PDF parseado con pdf-lib (`ignoreEncryption`), fallo → error legible | `fase1` |
| PROMPT INJECTION | "Ignora instrucciones…" en PDF/audio/foto/respuesta | `GUARDIA` al inicio de los 12 prompts; material delimitado con `comoDato`; extractor marca `posible_instruccion` → tipo `otro`; el AUDITOR marca `benchmark_como_hecho` | `seguridad` (6 tests) |
| LOGS | Tokens o secretos en consola | `redactarToken` en `api.ts` y `worker.ts`; `token_usage.error` truncado a 300 chars sin contenido | `seguridad` |

## Reclasificación de P2 de seguridad (fase 2)

- **P2-17 token en URL → cerrado (fase de integración, 2026-08-23).** Verificación previa a Supabase: el enlace NO era de un solo uso (reutilizable hasta 200 veces, sin canje). Corregido: canje único por token de sesión; el enlace se inutiliza tras el canje; expiración, hash y revocación se mantienen. Residual: el primer GET de la página lleva el enlace en la URL (queda en el log de acceso una vez) — ya inservible tras ese primer uso.
  Endurecido en navegador real (2026-08-23): el reemplazo de URL ahora usa `router.replace` (con `history.replaceState` el router de Next restauraba la URL con el enlace en el siguiente refresh — verificado); el canje comparte una sola petición en vuelo (StrictMode o doble toque ya no queman el enlace ni muestran "enlace usado" con la sesión ya guardada), y ante un canje fallido se relee el almacenamiento del dispositivo.
- **P2-18 vistas con privilegios del dueño → aceptado con justificación.** `claims_cliente` y `participants_cliente` corren como su dueño (sin `security_invoker`) porque el cliente no tiene política sobre las tablas base; el filtro de pertenencia está dentro de la vista y `security_barrier` impide que un predicado del cliente se evalúe antes. El linter de Supabase emitirá advertencia; queda documentado.
- **P2-06 API sin sesión → cerrado** (401 JSON).
- **P2-04 archivos huérfanos → cerrado** (`archivos_de_empresa` + borrado en `DELETE /api/companies/[id]`).

## Pendiente (BLOCKED_EXTERNAL)

- ~~Ejecutar `tests/supabase/integracion.test.ts`~~ hecho contra el proyecto remoto: 24/24 (2026-08-23).
- Revisar el linter de seguridad de Supabase tras aplicar `schema.sql` (panel; pendiente de revisión por el usuario).
- Rotar las llaves y el token de acceso personal usados durante la integración (se compartieron por chat): Project Settings → API Keys y Account → Access Tokens.
- Rate limiting en `/api/participar` y `/entrar` (V2: depende de la plataforma de despliegue; el token de 192 bits hace inviable la fuerza bruta).

Seguridad crítica pendiente en código: **0**.
