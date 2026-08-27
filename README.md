# 8X

Consultor digital autoservicio de RENASER: diagnostica, audita en profundidad y sistematiza pymes peruanas — de la primera conversación hablada al plan estratégico con calidad de firma top. Comprender → contrastar → descubrir → diagnosticar → rediseñar → sistematizar → implementar → medir → aprender.

Estado: **1.0.0-rc.1**, en producción en `https://8x-renaser-s-projects.vercel.app`, con RENASER como primera empresa cliente de su propio producto.

---

## Avance y decisiones — especificación completa (agosto 2026)

Cada punto lleva su **porqué**: aquí no se avanzó por avanzar; cada decisión responde a un problema real visto con clientes reales.

### 1 · El producto pivotó a consultor digital autoservicio

**Qué:** 8X dejó de ser una herramienta interna del consultor y se volvió un producto que el empresario usa solo: se registra, crea su empresa (nace admitida, sin puertas), conversa hablando, y recibe diagnóstico, auditoría y sistematización sin esperar a nadie.
**Por qué:** el valor de RENASER escala solo si el levantamiento no depende de las horas de Kelin y Darren. El consultor entra donde aporta criterio (revisar, corregir, profundizar), no en la recolección.

### 2 · Las tres fases del método, operativas de punta a punta

**Qué:** (1) **Primer diagnóstico** — levantamiento hablado de alta cosecha; (2) **Auditoría profunda** — validación de datos y contraste contra documentación y otras entrevistas (el "espejo" entre lo declarado y lo real); (3) **Sistematización** — documentos de calidad construidos con el dueño (funciones, cultura, procesos, SOPs imprimibles) e implementación con plan de 45 días.
**Por qué:** es la metodología RENASER (Base Maestra) convertida en software. La Base está integrada dos veces: como reglas operativas en los prompts (contrato de razonamiento, conductas prohibidas, proporcionalidad) y como conocimiento recuperable (59 secciones en `conocimiento_base`, recuperación por motor y pilar).

### 3 · El lenguaje de las preguntas: la ventaja competitiva

**Qué:** toda pregunta se entiende a la primera, pregunta UNA cosa, se responde contando algo vivido, lleva ejemplo entre paréntesis cuando hace falta, y jamás se repite (bloqueos en código: comparación de palabras significativas, reuso de generador vivo, deduplicación contra abiertas). Registro **formal pero cálido**: "dinero", nunca "plata"; los términos comerciales correctos (ventas totales, facturación, margen de ganancia) siempre con su ancla simple ("de cada 100 soles que vendes, ¿cuántos te quedan?").
**Por qué:** el cliente objetivo incluye dueños millonarios que no manejan lenguaje de oficina — y hasta quienes no escriben. Una pregunta técnica o repetida rompe la confianza (un cliente real abandonó por una pregunta repetida 6 veces). La carga de ser claro es del sistema, nunca de la persona.

### 4 · La Radiografía Mínima: números primero

**Qué:** el levantamiento no se da por completo sin 9 números (contados o declarados sin dato — y sin dato es hallazgo): venta del mes, lo libre, caja hoy y días de aguante, gastos fijos, producto estrella (precio y costo), conversión de cada 10, cuánto le deben, cuánto debe, mejor mes histórico. Regla de las dos horas: el dinero va antes que cualquier tema blando.
**Por qué:** pregunta directa de Darren — "¿esto nos permite hacer el trabajo de Lemonis/McKinsey?". Con esos 9 se calcula margen real, punto de equilibrio y el árbol completo de la venta; sin ellos, cualquier diagnóstico es opinión.

### 5 · La voz jamás se pierde

**Qué:** grabación sin límite; audios largos (2+ min) se transcriben con el modelo grande (el ligero recortaba la cola); si la transcripción en vivo falla o tarda, el audio queda listo con el botón "Guardar mi audio (lo escuchamos nosotros)" y se transcribe en segundo plano; el tiempo del servidor subió de 120 a 300 s.
**Por qué:** Darren perdió un audio de 5 minutos en vivo. Regla de la casa desde entonces: lo hablado es el material más caro del sistema y no se descarta jamás.

### 6 · Motor de IA con respaldo automático

**Qué:** Gemini como proveedor (principal `gemini-3.7-flash`); ante tormenta sostenida de demanda (503) el proveedor cambia solo a `AI_MODEL_RESPALDO` (3.6-flash, calidad validada) y reintenta. Esquemas grandes que exceden la salida estructurada se degradan inyectando el esquema como texto (validación Zod sigue siendo la puerta). Nombres de modelo blindados con `trim()` (un salto de línea invisible en la variable tumbó producción una vez). Transcripción con modelo dedicado estable.
**Por qué:** el 3.7 tiene mejor cobertura de diagnóstico (benchmark 1.0 vs 0.83) pero sufre caídas por demanda; el usuario impaciente no puede esperar minutos. Calidad cuando el principal está sano, estabilidad cuando no — sin intervención humana.

### 7 · Plan Estratégico con estándar de firma top (19 hojas)

**Qué:** agente EL ESTRATEGA que redacta el plan completo: mandato, resumen con decisión "pasar de X a Y mediante Z", 3 apuestas y 3 renuncias reales, radiografía con fuente y confianza por indicador, máximo 3 problemas con costo, FODA con cruces-decisión, canvas con estados comprobado/por validar/contradicho, elecciones Playing-to-Win, opciones comparadas incluyendo "No actuar", supuestos con señal temprana, modelo operativo (quién decide/ejecuta), portafolio acelerar/probar/detener, roadmap, tablero con tipos de KPI, riesgos, gobierno con aprendizaje, y nota de confianza. Se imprime a PDF con calidad editorial.
**Por qué:** auditoría contra lo que entregan las firmas top (estructura de Kelin + correcciones adoptadas con criterio: mandato, modelo operativo, recursos y aprendizaje sí; PMO y cascadas no — proporcionalidad pyme). Diferencial: cada cifra sale de la evidencia de ESA empresa y lo no probado se declara.

### 8 · Biblioteca proporcional, cumplimiento legal y el valor en soles

**Qué:** los documentos exigidos crecen con el tamaño (a 3 personas no se le piden 100 procesos); umbrales legales de Perú visibles para el consultor (hostigamiento y SST desde 20 trabajadores, RIT desde 100, siempre "verificar con asesoría"); y en el Plan del cliente: "Lo que le falta trabajar a tu empresa" con el costo y tiempo de hacerlo afuera con consultoría tradicional (rangos referenciales por pieza y total) contra "aquí está dentro de tu acompañamiento".
**Por qué:** el diagnóstico dicta la biblioteca (anti copia-pega), la ley no se improvisa, y el empresario decide mejor cuando ve el valor en soles y semanas.

### 9 · El diseño: híbrido premium elegido por la dueña

**Qué:** proceso de dirección de producto (brief nivel Apple de Kelin → dos conceptos → elección: **híbrido**): franja de **instrumentos** entre líneas finas (numerales tabulares, sin tarjetas por dato), **la voz del consultor** en serif con su número y su fuente ("visto en tu propia información — nada es inventado"), y **una sola acción** dominante. Paleta Apple: fondo casi blanco, tinta gris fina, hairlines, un azul sereno; tipografía contenida (la jerarquía viene del peso y el espacio). Mismo idioma en los dos modos: inicio del empresario, "Tu día" del consultor y panorama de empresa comparten el componente `Franja`.
**Por qué:** iteración real con Kelin ("todo blanco sobre blanco se veía igual", "el navy muy oscuro", "letras muy grandes"): sobrio, adulto, de consultoría premium — prohibido el dashboard SaaS genérico. Guardián instalado: **Impeccable** (skills + hooks anti-patrones de UI generada por IA) + `PRODUCT.md` como verdad del producto.

### 10 · Visual que trabaja: ruta, mapa-plan, paneles y avance

**Qué:** la **ruta de preguntas** es un diagrama de estaciones que se encienden al comprenderse cada área ("3 de 7 · ahora: Origen"); el **mapa de tu empresa** es un plan de acción descargable en PNG para la pared (la empresa al centro, 4 áreas con color de estado, y en cada una POR QUÉ —su hallazgo principal— y HAZ ESTO —la acción del dueño—, más lo que más frena con flecha); **"Ver más" abre al costado** (panel lateral en PC, hoja desde abajo en celular — nada empuja el contenido); **barra de avance** de las 3 fases con flechitas; **árbol de la venta** con casillas contadas/verificadas y las vacías como invitación; navegación de app (barra inferior con íconos en celular, lateral clara en PC) en ambos modos.
**Por qué:** el empresario estresado no lee informes: ve. Cada gráfico usa solo datos reales de su empresa — "sin dato" invita a contarlo, jamás se rellena.

### 11 · Cuatro alturas de control de calidad

**Qué:** (a) 272 pruebas de código; (b) benchmark de calidad del diagnóstico contra patrón congelado; (c) **`npm run qa`**: el viaje crítico completo contra producción con cuenta desechable — registro, empresa, idempotencia, primera pregunta en <30 s con control de calidad (personalizada, sin jerga), respuesta, siguiente sin repetir, las 9 páginas con navegación, lado consultor, limpieza (19 pasos, corridas recientes todo verde); (d) **centinela** en vivo que vigila la cola cada 20 s y grita fallos, atascos y lentitud.
**Por qué:** "que nada se buguee" no puede depender de que alguien esté mirando. La calidad es un sistema, no una promesa.

### 12 · Robustez ganada a golpe de incidente real (cada fix con su lección)

- **Registro caído** → la confirmación de correo de Supabase bloqueaba a todos (el correo nunca llegaba). Autoconfirmación activada; errores de auth traducidos al español claro.
- **"Un momento…" eterno y empresas duplicadas** → el refresco silencioso fallaba en celulares y cada reintento creaba otra empresa (caso real: 3 duplicadas). Recarga completa al éxito + endpoint idempotente ("Ya tienes una empresa en 8X") + sesiones muertas redirigen a entrar.
- **"No traduce todo lo que digo"** → modelo grande para audios largos + detección de corte por límite con aviso honesto.
- **Preguntas repetidas** → triple candado en código (no en promesas al modelo).
- **El detalle es del consultor; el empresario ve simple** — frontera aplicada en RLS, vistas y UI.

---

## Qué hay (mapa del código)

| Capa | Dónde |
|---|---|
| Esquema Supabase (tablas, índices, RLS, vistas seguras, cola, storage) | `supabase/schema.sql` (+ migraciones vía Management API) |
| Método en texto, sincronizado con el código; Base Maestra completa | `methodology/*.md` |
| Sistema visual (tokens Apple, Franja/Lectura, panel lateral, DocMd) | `src/design/tokens.css`, `src/components/base/` |
| Capa de IA (Gemini con respaldo automático; transcripción dedicada) | `src/lib/ai/`, `src/lib/ai/gemini.ts` |
| Agentes (entrevistador, diagnosticador+auditor, arquitecto, SOP, estratega, planificador, redactor…) con guardia anti-inyección y reglas RENASER | `src/lib/ai/agents/`, `src/lib/rules/base-renaser.ts` |
| Esquemas Zod de cada salida (incluye `SalidaPlanEstrategico`) | `src/lib/schemas/` |
| Reglas sin IA: vigencia, contradicción, evidencia, cobertura, suficiencia, anomalías, pérdida, caminos, biblioteca proporcional, mercado | `src/lib/rules/`, `src/lib/{perdida,caminos,biblioteca,mercado,tablero,hoy}.ts` |
| Cola + worker serverless (drenado en Vercel disparado por encolar + cron de respaldo; worker local opcional) | `src/lib/jobs/`, `/api/worker/drain` |
| Panel del consultor · Portal del cliente · Enlace de participante | `src/app/(consultor)/`, `src/app/(cliente)/portal/`, `src/app/participar/` |
| Plan estratégico imprimible (19 hojas) | `src/app/(consultor)/empresa/[id]/plan-estrategico/` |
| Visuales del empresario: mapa-plan descargable, árbol de la venta, ruta de estaciones | `src/components/cliente/MapaMental.tsx`, `portal/hoy`, `src/components/Entrevista.tsx` |
| Benchmark congelado + QA de producción | `benchmark/`, `scripts/qa.mts` |
| Guardián de diseño (Impeccable) + verdad del producto | `.claude/skills/impeccable/`, `PRODUCT.md`, `.impeccable/surfaces/` |

## Comandos

```bash
npm run verificar        # typecheck + lint + tests + build (puerta de calidad)
npm run test             # vitest (272 pruebas, sin Supabase ni IA)
npm run qa               # el viaje crítico completo contra PRODUCCIÓN (19 pasos, cuenta desechable)
npm run test:supabase    # integración real (24 pruebas)
npm run benchmark        # calidad del diagnóstico con IA real contra patrón congelado
npm run dev              # app
npm run worker           # worker local opcional (producción se drena sola en Vercel)
```

## Puesta en marcha

1. **Supabase.** Proyecto con `supabase/schema.sql` (idempotente). DDL posterior vía Management API con `SUPABASE_ACCESS_TOKEN`.
2. **Variables.** `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `AI_MODEL` (y opcional `AI_MODEL_RESPALDO`), `WORKER_DRAIN_SECRET`, `CRON_SECRET`.
3. **Primer consultor.** Regístrate y ejecuta `update users set rol='consultor' where email='tu@correo';` (todo registro nuevo nace cliente).
4. **Compuerta antes de cualquier demo:** `npm run qa` en verde.

## Cómo fluye

```
Registro (entra directo) → empresa (nace admitida; ficha con ciudad y WhatsApp del dueño)
→ Conversar HABLANDO (ruta de estaciones; radiografía mínima de 9 números; lo grabado jamás se pierde)
→ extraer → contrastar (espejo declarado vs real) → validación del dueño (3 botones)
→ suficiencia → diagnosticar por pilar (Base Maestra como motor; auditor; anomalías; preguntas pendientes en lenguaje oral)
→ revisión del consultor → sistematización (documento declarado vs versión trabajada, lado a lado) → SOP imprimible
→ plan 45 días (≤3 frentes/semana) → Plan Estratégico (19 hojas, PDF) → entregables → monitoreo
```

Ninguna llamada a IA ocurre dentro de una petición HTTP: todo pasa por `jobs`, y la cola se drena sola en Vercel.

## Frontera

El cliente nunca ve hallazgos sin aprobar, columnas internas, respuestas de otras personas, prompts, otras empresas ni trabajos. RLS + vistas en Supabase y `src/lib/frontera.ts` en las rutas con service role. La metodología (4P, motores, matrices) es interna: el cliente solo ve preguntas claras.

## Despliegue

Next.js en Vercel (proyecto `8x`). El worker YA NO necesita proceso aparte: `drenarCola()` corre por ráfagas dentro de Vercel, disparado por cada `encolar()` y con cron `*/5` de respaldo. PWA instalable en Android/iOS desde el navegador (Play Store: pendiente cuenta de desarrollador + empaquetado TWA).

## Documentos

`PRODUCT.md` (verdad del producto) · `docs/reporte-verificacion-2026-08-26.md` · `V1_FINAL_AUDIT.md` · `V1_SECURITY_REPORT.md` · `V1_PERFORMANCE_REPORT.md` · `V1_KNOWN_LIMITATIONS.md` · `BACKLOG_V2.md` · `methodology/` (Base Maestra y método completo).
