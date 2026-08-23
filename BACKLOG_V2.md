# BACKLOG V2

Lo que no entra en V1 porque no afecta seguridad, privacidad, integridad, experiencia fundamental, rendimiento ni evolución necesaria. Ordenado por valor para el método.

## Metodología / profundidad
- Cadena PERSONA → PUESTO → PROCESO → CLIENTE → INGRESO como modelo (tabla de puestos, `WITH RECURSIVE`); hoy `participants.puesto` es texto.
- Detección mecánica de patrones desde datos (canal único, concentración de clientes, reclamos por día) antes de llamar al modelo.
- Consolidación cross-pilar con fusión semántica (hoy: dedupe por evidencia idéntica).
- Biblioteca de casos como ejemplos para empresas nuevas (recuperación por sector/tamaño).
- Cobertura de entrevista por profundidad (no solo "una respuesta por bloque"): detectar respuestas evasivas y obligar repregunta.
- Sesión `validacion` creada automáticamente cuando aparecen contradicciones.
- Agenda semanal de 30 minutos generada por el sistema (qué se cerró, qué se trabó, qué se abre).
- Alerta "KPI sin moverse 30 días" (requiere modelo de indicadores con valores en el tiempo).

## Evidencia / fuentes
- Lector nativo de Excel (xlsx) con hoja/fila/columna; OCR propio para fotos de baja calidad.
- Timestamps para lo dictado con el micrófono del navegador.
- `VerFuente` que salte a la página del PDF (`#page=N`).
- Paginación en la UI de afirmaciones (la API ya pagina).

## Producto / UX
- Realtime para el cliente (política de lectura de sus propios jobs o canal de broadcast).
- Selector de empresa para clientes con varias; `workspaces` para varias consultorías.
- Enlace de participante de un solo uso que canjea por cookie httpOnly (hoy: sessionStorage + cabecera).
- Rate limiting en `/api/participar` y `/entrar` (plataforma).
- Exportación PDF servidor (hoy: imprimir desde el navegador).
- QR del enlace del participante.

## Arquitectura / operación
- Vista agregada de `token_usage` (tope por empresa en O(1)).
- Evaluar PGMQ como transporte si el heartbeat resulta frágil (la tabla `jobs` sigue siendo el registro).
- Tabla `claim_pairs` para pares juzgados (hoy: `claim_relations` + `jobs.resultado`).
- Tests E2E en navegador (Playwright) para canvas y voz.
- Limpieza de Storage al borrar fuentes individuales ya existe; añadir job periódico de huérfanos.

## Agent Designer (V2 declarada en el método)
- UI sobre `agent_specs`: ficha por nodo `ia`/`hibrido` con misión, trigger, inputs, outputs, conocimiento (know-how del nodo), herramientas, reglas, autoridad, prohibiciones, escalamiento, aprobación, versión.
- `agent_runs` (evidencia de ejecución). **Sin runtime hasta V3.**

## P2 heredados de la auditoría (no cerrados en V1)
P2-01 cerrado en V1 (`estadoSesion` ya selecciona `respuesta_audio_path`) · P2-03 carrera de `contrastar` (idempotente por fuente ahora; residual mínimo) · P2-05 multiempresa · P2-07 código muerto (`preguntaDeVigencia`) · P2-08 sesión `validacion` · P2-09 constantes en `lib/config.ts` · P2-11 cerrado · P2-13 README precisado · P2-14 `company_stats` a 100+ empresas · P2-15 cosmético · P2-16 `sourceHandle` en edges de decisión generados por IA (verificar en navegador).
