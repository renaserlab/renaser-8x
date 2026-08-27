# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos modos con dos usuarios distintos:

- **Empresario (cliente)**: dueño de pyme peruana (2–30 personas). Estresado, impaciente, poco tecnológico; puede no escribir bien o preferir hablar. Entra desde el celular (a veces PC), muchas veces en la nave o entre atenciones. Su trabajo por hacer: entender qué frena su negocio y sistematizarlo para multiplicar resultados — quiere ver avance YA, no leer informes.
- **Consultor (RENASER: Kelin y Darren)**: dirige varias empresas a la vez. Necesita criterio concentrado: qué requiere su atención hoy, evidencia detrás de cada hallazgo, y control de calidad de lo que el agente produce. El detalle es del consultor; el empresario ve simple.

## Product Purpose

8X es un consultor digital autoservicio que sistematiza empresas en tres fases: (1) **primer diagnóstico** (levantamiento hablado, alta cosecha, el dinero primero), (2) **auditoría profunda** (validación de datos y contraste contra documentación y otras entrevistas — el "espejo" entre lo declarado y lo real), (3) **sistematización** (documentos de calidad construidos con el dueño: procesos, funciones, cultura, plan estratégico) e implementación con seguimiento. Éxito = una empresa que opera sin depender de la memoria ni del dueño, con evidencia de avance visible.

## Positioning

Lo que una consultora vecina no puede copiar honestamente: **nada se inventa**. Cada número, hallazgo y documento sale de la evidencia de ESA empresa, con su fuente y su estado (contado / verificado / sin dato / contradicho); la ausencia de dato es un hallazgo, nunca se rellena. Metodología propia RENASER (Base Maestra: contrato de razonamiento, motores, proporcionalidad) operando dentro del producto, no como PDF adjunto. Aspira a superar a Asana/Odoo/Camunda en su nicho: sistematización real de pymes, de diagnóstico a implementación.

## Constraints

- Idioma: español peruano; montos SIEMPRE en soles (S/). Preguntas en lenguaje oral, sin jerga, con ejemplos entre paréntesis; jamás repetir una pregunta ya respondida.
- Proporcionalidad: a una empresa de 4 personas no se le piden 100 documentos ni comités.
- La voz es canal principal (audios largos reales); lo hablado JAMÁS se pierde.
- Sistema de diseño existente y obligatorio: `src/design/tokens.css` — un solo radio (14px), sin sombras, sin emojis ni íconos decorativos (SVG de línea solo funcionales), colores con significado de estado (verde confirmado / ámbar caducado / rojo contradicho), serif para titulares de documento, fondo gris frío con tarjetas blancas, "la caja se reserva para lo accionable".
- Criterio de la dueña del producto: sobrio, preciso, adulto, exclusivo, funcional bajo presión; prohibido el dashboard SaaS genérico, tarjetas por cada dato, barras de progreso innecesarias y botones equivalentes.
- PWA instalable en Android/iOS; todo navegable rápido en celular, tablet y PC.

## Evidence

- Motor real: pipeline Supabase + Gemini (272 pruebas, benchmark de calidad de diagnóstico, `npm run qa` = 19 pasos del viaje crítico contra producción).
- Empresas reales en uso desde 2026-08-26 (RENASER es la primera cliente de su propio producto).

## Open decisions

- Concepto visual de la pantalla de inicio del empresario: propuesta A "El despacho" (editorial, papel/tinta) vs B "La sala de control" (instrumentos, cola por impacto en soles) — pendiente de elección de Kelin.
- Transcriptor dedicado (AssemblyAI/Deepgram) para actas con varias voces: evaluado, no adoptado aún.
