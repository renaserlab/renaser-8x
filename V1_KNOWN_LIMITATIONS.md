# 8X V1 — LIMITACIONES CONOCIDAS

Lo que V1 NO hace o hace con condiciones. Nada de esto está oculto en la interfaz: donde aplica, el sistema lo dice.

## Requiere infraestructura que no existe en este entorno (BLOCKED_EXTERNAL)

1. **Supabase no conectado.** El esquema, las políticas y las funciones están escritas y verificadas estáticamente; su efecto real no se ha ejecutado. 24 tests de integración esperan credenciales (`npm run test:supabase`).
2. **Modelo de IA no ejecutado.** Todos los prompts, esquemas y reglas están probados con salidas simuladas. La calidad real (cobertura, precisión, preguntas) se mide con `npm run benchmark` al tener `ANTHROPIC_API_KEY`; hasta entonces, los umbrales del benchmark son objetivos, no resultados.
3. **Sin prueba en navegador ni móvil.** React Flow (canvas), Web Speech (voz) y MediaRecorder no corren en Node. Las garantías de UX verificadas por código (44 px, 17 px, foco, etiquetas, reduced-motion) no sustituyen la prueba con tres personas.
4. **Piloto RENASER no realizado.** No hay datos reales en el repositorio.

## Decisiones de diseño con efecto visible

5. **Audio subido (notas de WhatsApp) requiere `OPENAI_API_KEY`.** Sin ella, la interfaz no ofrece grabar ni subir audio; responder hablando sigue funcionando con el micrófono del navegador (Chrome/Edge/Safari; en Firefox solo texto).
6. **Word y Excel se rechazan** con instrucción (exportar a PDF / guardar como CSV). Lector nativo en V2.
7. **PDF escaneado sin texto** depende de la lectura de imágenes del proveedor; se trocea en tramos de 15 páginas. No hay OCR propio.
8. **Marcas de tiempo de audio** solo con Whisper (`verbose_json`). Lo dictado con el micrófono del navegador no tiene minutos.
9. **Validación estructural de procesos avisa, no bloquea.** Una decisión con una salida o un proceso sin final malo se guarda con aviso, porque el dibujo real de una empresa puede estar incompleto a propósito; el consultor decide.
10. **Realtime para el cliente funciona por sondeo (4 s)**, no por suscripción: el cliente no tiene política de lectura sobre `jobs`. El consultor sí recibe Realtime.
11. **`company_stats` se refresca cada 60 s** y al crear una empresa; un cambio de estado puede tardar hasta un minuto en la bandeja.
12. **Una sola consultoría por instancia** (sin `workspaces`). Un cliente con varias empresas ve la primera.
13. **El token del participante viaja en la URL una vez** (el primer clic del enlace); luego vive en `sessionStorage` y va en cabecera. Expira a los 30 días, se puede revocar y tiene tope de 200 usos.
14. **El hallazgo "sueño vs empresa" depende del modelo**: la regla mecánica solo marca la brecha (aspiracional sin actual) para validación; el patrón lo emite el DIAGNOSTICADOR cuando hay evidencia de ambos lados.
15. **Consolidación cross-pilar sin IA**: deduplica hallazgos con la misma evidencia; no fusiona hallazgos parecidos con evidencia distinta (los verá el consultor dos veces si el modelo los repite).
16. **Los referentes no se muestran al cliente, pero sí se usan**: si el modelo ignora la guardia y escribe un nombre, `verificarDocumento` lo reemplaza en los entregables; en hallazgos en pantalla del consultor no se filtra (es para él).
17. **Cobertura de entrevista = al menos una respuesta por bloque.** No mide profundidad de cada respuesta; la repregunta la decide el modelo.
18. **Tope de tokens por empresa** se evalúa sumando `token_usage` en cada trabajo (costo O(n) por empresa).
19. **Sin rate limiting de red** en rutas públicas (`/api/participar`, `/entrar`); depende de la plataforma de despliegue.
20. **Sin OCR ni lectura de Excel; sin cadena PERSONA→PUESTO→PROCESO como modelo** (no hay tabla de puestos).

## Lo que el sistema dice cuando no puede

- "Solo N definiciones confirmadas sobre X. No hay información suficiente" (DESCONOCIDO).
- "Todavía no es suficiente: …" (409 al diagnosticar sin suficiencia; se puede forzar).
- "Necesita validación: una sola opinión no sostiene un hallazgo crítico" (no llega al cliente).
- "Por ahora no podemos escuchar audios" (sin transcriptor).
- "No pudimos leer ese Word/Excel/PDF…" (con qué hacer).
