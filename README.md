# 8X

Consultor digital autoservicio de RENASER: diagnostica, audita en profundidad y sistematiza pymes peruanas — de la primera conversación hablada al plan estratégico con calidad de firma top. Comprender → contrastar → descubrir → diagnosticar → rediseñar → sistematizar → implementar → medir → aprender.

Estado: **1.0.0**, en producción en `https://8x-renaser-s-projects.vercel.app`, con RENASER como primera empresa cliente de su propio producto.

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

### 13 · Auditoría técnica del 29-08-2026 y sus nueve correcciones

Se auditó el aplicativo contra **ISO/IEC 27001** (seguridad de la información), **ISO 9001 7.5**
(control documental), **ISO/IEC 25010** (calidad de producto) y la **Ley 29733** de Protección de
Datos Personales del Perú. Aclaración que ahorra dinero: **ISO no certifica software, certifica
organizaciones** — no existe "el ISO de un aplicativo". Lo que se puede certificar es a RENASER
bajo 27001 o 9001; 25010 es un modelo de evaluación, no un sello.

**Lo que ya pasaba la inspección:** 46 de 47 rutas bajo `protegido()` y la 47ª con secreto propio;
todas las que reciben `company_id` llaman `exigirAcceso()`; las del portal derivan la empresa de la
sesión y no del cuerpo del pedido (sin acceso indirecto por ID); RLS en las 29 tablas con vistas
separadas para que el cliente no vea campos internos; credenciales de participante hasheadas, con
expiración y tope de usos, viajando en cabecera y no en la URL; secretos fuera del repositorio;
0 vulnerabilidades en dependencias; cola con arriendo, recuperación de zombis y cortacircuitos.

**Los nueve hallazgos, y qué se hizo con cada uno:**

| # | Hallazgo | Corrección | Norma |
|---|---|---|---|
| 1 | **Crítico.** No había registro de auditoría: nadie podía responder "quién vio o cambió los datos de mi empresa" | `audit_log` inmutable (revocados insert/update/delete a `authenticated`), enganchada en `protegido()` para que las 46 rutas la hereden; registro explícito al abrir el informe, aprobar un documento, subir el logo y entrar o salir, con IP. Visible para el dueño en *Mi empresa → Historial* y para el consultor en *Salud del sistema* | 27001 A.8.15 |
| 2 | **Alto.** Sin límite de peticiones: cualquiera con cuenta podía disparar IA en bucle y quemar la cuota de Google | `consumir_cupo()` atómica en Postgres —no en memoria, porque en serverless cada instancia olvida lo suyo—. Cuatro cupos: IA 20/5 min, subidas 12/5 min, escritura 120/min, sesión 10/15 min. 21 rutas caras etiquetadas. Si el contador falla se deja pasar: un límite roto no puede dejar sin servicio al dueño | 27001 A.8.6 / A.8.20 |
| 3 | **Alto.** Sin cabeceras de seguridad: se podía embeber en una página ajena | CSP con `frame-ancestors 'none'` y `object-src 'none'`, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP, y `no-store` en todo `/api` | 27001 A.8.9 |
| 4 | **Medio.** Los errores morían en la consola: te enterabas porque el cliente llamaba | `error_log` con token redactado y la página `/salud` con errores de 24 h, movimientos y rastro reciente | 27001 A.8.16 |
| 5 | **Medio.** Sin integración continua: las pruebas corrían solo si alguien se acordaba | `.github/workflows/ci.yml` con tipos, lint, pruebas, build y `npm audit` en cada push y cada PR | ISO 12207 / 9001 |
| 6 | **Medio.** Ley 29733 sin cubrir, con datos personales de trabajadores de empresas terceras | Página `/privacidad` completa (responsable, qué se guarda, encargados y flujo transfronterizo, plazo de 5 años, derechos ARCO, vía de reclamo ante la ANPD); consentimiento explícito al registrarse con versión y fecha; y **la persona entrevistada consiente antes de la primera pregunta**, con el texto guardado literal e incluyendo que sus respuestas no se usan para sancionarla | Ley 29733 |
| 7 | **Medio.** Validación a mano; Zod solo validaba salidas de la IA | `leerValidado()` con `EntradaInvalida` → 400 en castellano en vez de 500 con el volcado de Zod. Aplicado donde entran datos personales y texto libre que se paga por carácter | 25010 |
| 8 | **Bajo.** El logo se aceptaba por lo que *decía* el navegador, SVG incluido (puede llevar script) | Lista cerrada PNG/JPG/WebP verificada por los bytes del archivo. Se guarda la ruta junto a la URL firmada y se vuelve a firmar al vuelo: el logo del informe ya no se rompe solo dentro de un año | 27001 A.8.9 |
| 9 | **Bajo.** `version` era un entero suelto: sin historial, sin quién aprobó, sin obsoletos | Estados borrador/vigente/obsoleto, `aprobado_por`, `aprobado_at`, `motivo_cambio`, `reemplaza_a`, y `aprobar_documento()` que en una transacción sube versión, pone vigente y deja obsoleta la anterior. El dueño aprueba diciendo qué cambió y conserva las versiones anteriores | ISO 9001 7.5 |

**Además, la plataforma de autenticación estaba floja** y se endureció por API: clave mínima de 6 → 8,
comprobación contra claves ya filtradas (HIBP) activada, aviso al correo si te cambian la clave, y
límite de verificación bajado de 30 a 20 por hora (27001 A.5.17).

**Dos bugs cazados durante el propio trabajo, antes de que los viera nadie:** las pruebas de
seguridad que ya existían detectaron tres rutas nuevas mías mal etiquetadas; y `aprobar_documento()`
fallaba con *"column reference estado is ambiguous"* porque los nombres de salida chocaban con las
columnas de la tabla — se detectó ejecutándola contra la base real, no leyéndola.

**Pruebas: 272 → 290.** Las nuevas son barreras de regresión, no adorno: si alguien crea una ruta sin
proteger, recibe un `company_id` sin comprobar acceso, olvida el cupo en una ruta cara, quita una
cabecera, vuelve a confiar en el tipo declarado del archivo o rompe el consentimiento previo, la
prueba se cae.

**Dónde queda 8X frente a una certificación 27001:** controles técnicos ~70 %; sistema de gestión
(políticas, análisis de riesgos, continuidad, gestión de proveedores) ~10 %, y esa parte pesa más de
la mitad. Camino real a certificar: ~35 %. Pero para *vender* casi nunca piden el certificado: piden
un cuestionario de seguridad, y con estas nueve correcciones ese cuestionario se responde sin mentir
en una sola línea.


### 14 · Los nueve números dejan de ser una intención (30-08-2026)

Revisión de si 8X podía ya sistematizar una empresa de punta a punta. El veredicto fue que **sabe
fotografiar pero todavía no pesar**: Qori tenía 18 números y solo 3 de los nueve vitales, y
prácticamente todo vivía en un único periodo `actual`. La Radiografía Mínima existía escrita dentro
del prompt, pero **nada en el código la verificaba**.

**Vocabulario canónico** (`src/lib/metricas.ts`). Los nueve vitales con clave exacta, pregunta
hablada y sinónimos. `normalizarMetrica()` se aplica **al escribir**, en el handler de extracción:
`utilidad_mes`, `ganancia_neta_mes` y `facturacion_mes` dejan de ser números distintos. Regla que
importa: si el dueño desglosa por línea o local, esa cifra parcial va en su propia clave y **no** en
la del vital — el vital es siempre el total. `radiografia()` dice cuántos faltan y distingue *nadie
lo preguntó* de *el dueño no lo sabe* (lo segundo es hallazgo, no vacío). `derivados()` calcula
margen real, margen unitario, punto de equilibrio y días de aguante, y devuelve `null` en vez de
inventar cuando falta un insumo.

**Levantamiento por meses** (`/portal/numeros`). El dueño ve *X de 9* con su barra, contesta de
memoria lo que falta —o marca «No lo sé»— y responde **su año en tres preguntas**: mes pasado, mejor
mes y peor mes. Con esos tres puntos ya hay curva. Encima, el **calendario comercial peruano** (julio
y diciembre con gratificación, agosto de bajón, mayo Día de la Madre) para que marcar temporadas no
sea hacer memoria en frío: sin eso, un agosto bajo se lee como problema cuando es estacionalidad.
Arriba de todo se muestra lo que ya se puede calcular — cuánto le queda de cada 100 soles, cuántos
días aguanta si mañana no entra nada, cuánto tiene que vender para no perder.

**Dónde vive.** Sin sexto botón en la barra: la tarjeta «Tus números» abre Mi empresa y
`/portal/numeros` se agrupa bajo ella.

**Para la consultora.** La bandeja trae el ítem «Le faltan N de los 9 números» nombrando los tres
primeros, y la tabla de empresas una columna *Números* (X/9 y meses de venta). Todas las métricas se
leen en **una** consulta, no una por empresa.

**Datos existentes.** `scripts/normalizar-metricas.mts` corre el mismo mapeo que la aplicación —una
sola fuente de verdad—, con informe por defecto y `--aplicar` para escribir. Ejecutado: 5 claves
normalizadas, 0 duplicados. La mejora es pequeña **a propósito**: normalizar recupera lo que existe,
y lo que faltaba de verdad es que esos números nunca se preguntaron.

**Dos bugs cazados por las propias pruebas antes de desplegar:** `"2026-13"` pasaba como mes válido,
y un vital declarado «no lo sé» y después respondido con número se contaba dos veces (la radiografía
llegaba a decir 10 de 9). Pruebas: **294 → 323**.

**Lo que sigue faltando para cerrar el ciclo:** línea base congelada al terminar el diagnóstico,
cortes con números en vez de texto libre, cierre de acciones con evidencia real, e incidencias
convertidas en KPIs.


### 15 · La línea base y los cortes: «¿funcionó?» deja de ser incontestable (30-08-2026)

Hasta hoy la pregunta **no tenía respuesta posible**: los diagnósticos eran una foto única (4 por
empresa, todos del mismo día, nunca repetidos) y los cortes de control guardaban sus indicadores como
**texto libre**, sin conexión con los números. Aunque se hiciera un corte, nada podía calcular si el
indicador se movió. Y nunca se hizo ninguno: 0 registros.

**Mediciones.** Una medición es una foto **congelada** de los nueve vitales con su fecha. La primera
es la línea base —el «antes»—; cada corte posterior es un «después» que se compara contra ella. Se
congelan también los derivados para que la historia siga siendo honesta aunque cambie la fórmula.
Índice único: **una sola línea base por empresa** (si hubiera dos, el «antes» dejaría de significar
algo). `congelar_medicion()` numera los cortes dentro de la función, así dos cortes en paralelo no
pueden salir con el mismo número.

**Dirección de mejora.** Cada vital sabe hacia dónde es mejorar: sin eso, bajar la deuda se leería
como retroceso y subir el gasto fijo como avance. El precio del producto estrella queda **neutro** a
propósito — subirlo puede ser sanear el margen o espantar clientes, y eso no lo decide una flecha.

**Lo que no se finge.** Un vital que nunca se midió no aparece: es un vacío, no un retroceso. Si el
corte no midió algo que la base sí, se dice «esta vez no se midió» en lugar de contarlo como caída a
cero. De un punto de partida en cero no se calcula porcentaje. Y el titular dice *«el negocio deja
S/3,800 más al mes que cuando empezamos»*, nunca *«gracias a nosotros»*: no se promete una
causalidad que no se puede probar.

**Para el dueño** (`/portal/numeros`): con menos de 5 de 9 números ni siquiera se ofrece fijar la
línea base, porque con dos números no sirve de punto de partida. Con línea base y un corte, arriba de
todo: el titular en soles, cuántos mejoraron y empeoraron, y qué se movió en cada uno — **lo que
necesita atención primero**.

**Para la consultora:** bloque «¿Mejoró?» en el panorama de cada empresa con los tres números que
empeoraron, y dos avisos nuevos en la bandeja — «ya se puede fijar el punto de partida» al llegar a
5 de 9, y «toca medir: N días sin corte» pasado un mes.

**El corte cualitativo no se tira.** Lo que ya existía —qué se hizo, qué se trabó, qué regresó— se
queda; le faltaban los números. Ahora `/close` congela además una medición y las enlaza por
`medicion_id`.

**Prueba del ciclo completo contra la base real** (`npm run prueba:medicion`): crea su empresa, pone
números, fija la base, simula tres meses de trabajo, corta y verifica el veredicto — y la borra
al terminar pase lo que pase. Verifica lo que las pruebas en memoria no alcanzan: que
`congelar_medicion()` numera y reemplaza como debe **en Postgres**. Pruebas: **323 → 348**.


### 16 · La prueba de que se hizo, y los números que salen de lo que falla (30-08-2026)

Puntos 5 y 6: los que cierran el ciclo.

**Evidencia de implementación.** Las acciones del plan traían escrito qué evidencia haría falta
(*«listas de chequeo firmadas por lote despachado»*) y **no guardaban nada**: las nueve que existían
estaban todas en pendiente y ningún documento tenía implementación registrada. Ahora una acción se
cierra con foto, PDF o al menos una nota, y queda con quién la verificó y cuándo. La ruta **rechaza**
darla por verificada sin ninguna prueba — no es un aviso de la interfaz que se pueda saltar llamando
a la API. Una foto del celular basta: es lo que un dueño puede dar de verdad.

Los archivos se verifican **por sus bytes**, no por lo que declara el navegador — el mismo
endurecimiento del logo, añadido a `lib/archivos.ts` en vez de duplicado. Entra HEIC porque el
celular peruano lo manda sin avisar; el SVG no entra porque puede llevar script.

**Incidencias → números.** El agente **medidor** lee lo que sale mal seguido, los hallazgos críticos
y los indicadores que el plan ya nombró, y propone como máximo **seis**. Reglas que lo hacen útil y
no un generador de tableros: solo sale de lo que la empresa **contó** (sin material devuelve lista
vacía, no los típicos del rubro); el dueño tiene que poder contarlo **con lo que ya tiene** —si
medirlo exige un sistema que no tiene, es una tarea más, no una medición—; nada de vanidad; contar
hechos antes que estimar porcentajes; y prohibido inventar una meta redonda porque suena bien.

Nacen **propuestos**: un número que el dueño no eligió no lo va a contar, y un indicador que nadie
cuenta es peor que ninguno — aparenta control sin darlo. Al adoptarlo, sus valores viven en
`company_metricas` con su clave, así que se congelan en los cortes junto a los nueve vitales.

Probado contra datos reales (`npm run prueba:indicadores`): cuatro indicadores con instrucciones
ejecutables mañana — *«contando en el cuaderno de recepción de almacén»*, *«por WhatsApp o guía de
remisión»*.

**El bug de fondo que apareció en el camino.** Google dejó de devolver 503 y pasó a algo peor:
**200 tras 111 segundos** en una petición trivial, mientras el respaldo contestaba en 3. El
cortacircuitos solo contaba los 503, así que un modelo lentísimo **nunca lo disparaba** — no fallaba,
solo era inservible. Tres cambios: agotar el tiempo cuenta como caída y salta al respaldo (una sola
vez, sin consumir el intento); el principal tiene su propio plazo (`AI_TIMEOUT_PRINCIPAL_MS`, 15 s)
y solo cuando hay respaldo al que saltar; y el respaldo conserva el plazo completo, porque después
de él no hay a quién saltar. **Primera pregunta: 34 s → 8,4 s.**

El registro de errores construido el día anterior se ganó su sitio: dijo sin adivinar que el HTTP 500
del control de calidad era *«No hay pregunta abierta en esta sesión»* — consecuencia de la lentitud,
no un bug nuevo. Y el propio control de calidad tenía un **falso negativo**: daba por genérica una
pregunta que decía *«el día que decidiste abrir Doña Prueba»* porque buscaba una lista fija de
palabras sin el nombre de la empresa. Un falso negativo cuesta tanto como un fallo real: hace dudar
de lo que sí funciona.

Pruebas: **348 → 377**.


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
