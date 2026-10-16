---
name: 8X · RENASER Consulting
description: Tablero de cielo y hojas blancas donde cada trazo es un dato real de la empresa y lo que falta se ve rayado.
colors:
  papel: "#ffffff"
  fondo-cielo: "#e4ecfb"
  tinta: "#0e1a2b"
  tinta-hover: "#22324d"
  grafito: "#56657c"
  tenue: "#8a97ab"
  linea: "#e6ecf5"
  suave: "#f3f6fc"
  marca: "#2f6fe4"
  azul-medio: "#7ea3ef"
  azul-claro: "#bcd0f7"
  azul-velo: "#e3ebfc"
  raya: "#cbd4e3"
  confirmado: "#127049"
  confirmado-velo: "#e2f4ec"
  caducado: "#8d5609"
  caducado-velo: "#fbf0dc"
  contradicho: "#bf3b26"
  contradicho-velo: "#fbe6e2"
  sin-verificar: "#5f6b7d"
typography:
  display:
    fontFamily: "Manrope, Public Sans, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Manrope, Public Sans, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  numeral:
    fontFamily: "Manrope, Public Sans, system-ui, sans-serif"
    fontSize: "clamp(26px, 4.5vw, 36px)"
    fontWeight: 750
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  title:
    fontFamily: "Manrope, Public Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  card-title:
    fontFamily: "Manrope, Public Sans, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    fontFeature: "tnum"
  label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.02em"
  document:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "17px"
    lineHeight: 1.6
rounded:
  tile: "12px"
  control: "14px"
  row: "16px"
  card: "24px"
  sheet: "28px"
  pill: "999px"
spacing:
  grid-gap: "16px"
  grid-gap-phone: "12px"
  card-pad: "18px 20px"
  sheet-pad: "28px 32px 36px"
  sheet-pad-phone: "20px 16px 26px"
  page-gutter: "28px"
  page-gutter-phone: "16px"
  touch-target: "44px"
components:
  button-primary:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.papel}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.tinta-hover}"
  button-secondary:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.azul-velo}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.contradicho}"
    rounded: "{rounded.pill}"
    height: "44px"
  button-danger-hover:
    backgroundColor: "{colors.contradicho}"
    textColor: "{colors.papel}"
  input:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
    height: "44px"
  card:
    backgroundColor: "{colors.papel}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  sheet:
    backgroundColor: "{colors.papel}"
    rounded: "{rounded.sheet}"
    padding: "{spacing.sheet-pad}"
  nav-pill-item:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pill}"
    height: "40px"
  nav-pill-active:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.papel}"
    rounded: "{rounded.pill}"
    padding: "0 17px 0 13px"
    height: "40px"
  table-header:
    backgroundColor: "{colors.azul-velo}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.tile}"
    padding: "11px 12px"
  chip-ok:
    backgroundColor: "{colors.confirmado-velo}"
    textColor: "{colors.confirmado}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  chip-espera:
    backgroundColor: "{colors.caducado-velo}"
    textColor: "{colors.caducado}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  chip-alto:
    backgroundColor: "{colors.contradicho-velo}"
    textColor: "{colors.contradicho}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  chip-neutro:
    backgroundColor: "{colors.suave}"
    textColor: "{colors.grafito}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
---

# Design System: 8X · RENASER Consulting

<!-- Registrado el 13-10-2026 desde el código entregado (src/design/tokens.css, src/design/tablero.css, componentes de tablero y navegación), no desde la intención. Sustituye las reglas del 27-08 («paleta Apple, sin sombras, un solo radio, sin medidores»). Fuente normativa de valores: src/design/tokens.css; si este archivo y el CSS discrepan, manda el CSS y se corrige este archivo. -->

## Overview

**Creative North Star: "Hojas blancas sobre el cielo"**

8X vive sobre un cielo azul suave que no se mueve, y todo lo que se lee está en hojas blancas muy redondeadas que flotan sobre él con una sombra azulada y difusa. Los tableros (portal del dueño y bandeja de la consultora) son una cuadrícula de tarjetas blancas sueltas; el resto de las pantallas viven dentro de una sola hoja grande. La navegación es una píldora: arriba y centrada en PC, flotando abajo en el celular.

El mundo lo pidió la usuaria con su imagen de referencia («manda la imagen en toda la app»), pero la regla de la casa no cambió con el estilo: cada trazo de un gráfico sale de un dato real de la empresa, y lo que no hay se dibuja rayado y se nombra. El tablero rechaza el tablero SaaS que rellena con números de adorno. Los números grandes van en Manrope; el texto para leer, en Public Sans; la serif queda para los documentos impresos.

La densidad es media: tarjetas con aire, una cifra protagonista por tarjeta, gráficos finos. El color dice estado solo en las marcas de estado; en los gráficos, el azul dice «cuál es cuál», no «bien o mal».

**Key Characteristics:**
- Cielo azul en degradado fijo sobre `html`; en tableros, una esquina azul más intensa abajo a la derecha.
- Hojas y tarjetas blancas (24px tarjetas, 28px hoja) con sombra suave azulada.
- Navegación en píldora; el destino activo es la píldora oscura con su nombre.
- Numerales en Manrope con cifras tabulares; texto en Public Sans.
- Rayado diagonal = sin dato, y solo eso.
- Íconos de trazo propios (grosor 1.6, puntas redondas), nunca emoji.

## Colors

Un azul de cielo, una tinta casi negra azulada, una sola familia de azules para los datos y tres colores de estado, cada uno con su velo.

### Primary
- **Azul Acción** (marca): enlaces de acción, barras recientes con dato, punto final de la línea, foco visible. Es el único azul saturado; los demás azules son diluciones suyas.
- **Tinta Noche** (tinta): texto, botón principal, píldora activa, acción de hoy, avatar, fase actual. El oscuro es el gesto de «aquí estás / haz esto».

### Secondary
- **Azul Medio** (azul-medio) y **Azul Claro** (azul-claro): tramos de la franja por fases, barras antiguas, selección de texto, púas del peine en el periodo activo.
- **Velo Azul** (azul-velo): banda de cabecera de tabla, hover de controles claros, anillo de foco de los campos, fondo de los cuadros de ícono, cápsulas vacías del medidor.

### Tertiary
- **Verde Confirmado** (confirmado / confirmado-velo): estado «ok», fases hechas.
- **Ámbar Caducado** (caducado / caducado-velo): estado «espera», lo que pide al dueño, «por confirmar».
- **Rojo Contradicho** (contradicho / contradicho-velo): estado «alto», lo urgente, botón de peligro, pérdida en riesgo.
- **Gris Sin Verificar** (sin-verificar): marca de estado de lo no verificado.

### Neutral
- **Papel** (papel): hojas, tarjetas, panel lateral, campos.
- **Cielo** (fondo-cielo): color de respaldo del fondo; el degradado lo cubre (#edf2fd, #e1e9fb, #d3e0f9 a 165°, con un claro arriba a la izquierda). En impresión el fondo es blanco.
- **Grafito** (grafito): texto secundario, subtítulos, ejes, leyendas.
- **Tenue** (tenue): texto terciario.
- **Línea** (linea): bordes de campo, filas de tabla, bordes de lista y de panel dentro de la hoja.
- **Suave** (suave): fondo del botón circular «ir», pie del medidor, chip neutro, pasos pendientes.
- **Raya** (raya): el trazo del rayado diagonal (135°, 2px de trazo cada 6px).

### Named Rules
**The Rayado Rule.** El rayado diagonal significa «sin dato» y nada más. Lo que no hay nunca se dibuja como cero ni como una altura cualquiera: es un carril rayado entero y lleva su nombre («sin dato», «aún por calcular», «rayado: un mes sin venta contada»). Un cero contado sí es cero: una raya fina en la base. Lo dicho pero sin confirmar es solo contorno, sin relleno.

**The Una Rampa Rule.** En gráficos, el azul (de azul claro a marca) distingue series y recencia, nunca estado. El estado solo lo dicen los tres colores de estado, en chips y marcas.

## Typography

**Display Font:** Manrope (con Public Sans, system-ui)
**Body Font:** Public Sans (con system-ui)
**Label/Mono Font:** Source Serif 4 (con Georgia) es la tercera voz, solo para entregables impresos

**Character:** Manrope geométrico y apretado para cifras y títulos de tarjeta; Public Sans sobrio y legible para todo lo que se lee de corrido.

### Hierarchy
- **Display** (500, 30px; 26px en celular; 1.12): el saludo del tablero; el nombre va en 750.
- **Headline** (700, 28px, 1.15, balanceado): título de pantalla dentro de la hoja.
- **Numeral** (750, clamp(26px, 4.5vw, 36px), 1.05, cifras tabulares): la cifra protagonista. En tarjetas de cifra, 30px (26px en celular); en el medidor, 34px. La unidad va pequeña al lado (15px, 650, grafito).
- **Title** (700, 18px, 1.3): sección dentro de una hoja. Título de tarjeta: 700, 15.5px.
- **Hero** (650, clamp(21px, 3.4vw, 27px), 1.25, Manrope): frase grande de lectura.
- **Body** (400, 16px, 1.5, máximo 68ch): texto de lectura.
- **Data** (500, 13.5px, tabular): celdas y datos en línea.
- **Label** (600, 12px, 0.02em, sin mayúsculas): rótulos de campo, leyendas, títulos del menú.

### Named Rules
**The Manrope-para-Cifras Rule.** Todo número que se quiere ver de lejos va en Manrope con cifras tabulares; el texto que lo explica va en Public Sans debajo, en grafito.

**The Serif-Impresa Rule.** Source Serif 4 aparece solo en documentos y en la impresión; nunca en la interfaz en pantalla.

## Layout

Dos modos de página. **Hoja**: toda pantalla que no es tablero vive dentro de una hoja blanca (los layouts del consultor y del cliente envuelven el contenido en ella); la hoja se apaga sola cuando su hijo directo es un tablero. **Tablero**: cuadrícula de 12 columnas con 16px de separación; las tarjetas ocupan 3, 4, 6, 8 o 12 columnas; el saludo y el medidor ocupan 3 columnas y dos filas.

Contenido centrado a 1360px como máximo, con 28px de margen lateral (16px en celular). La lectura se limita a 68ch. Desde 1120px, el lienzo de tableros se abre hasta 1080px.

Responsivo: a 1180px el saludo pasa a fila completa y las tarjetas de cifra y el medidor a 4 columnas; a 760px la cuadrícula pasa a 2 columnas con 12px de separación, la tabla se sustituye por una lista de filas y las cifras se apilan. Por debajo de 1024px la píldora de navegación baja y flota, y el contenido deja 112px abajo para que no la tape. Se respetan las zonas seguras del dispositivo.

Objetivo táctil mínimo de 44px; con puntero grueso, los botones circulares «ir» crecen de 34px a 44px.

## Elevation & Depth

Sistema con sombra, suave y azulada, de dos niveles. La profundidad la dan el contraste blanco sobre cielo y una sombra larga y difusa teñida de azul, nunca negra ni dura. Los paneles dentro de una hoja pierden la sombra y llevan borde de línea.

### Shadow Vocabulary
- **Sombra** (`box-shadow: 0 1px 2px rgba(17,41,92,0.05), 0 14px 34px -14px rgba(28,72,168,0.22)`): hojas, tarjetas, marca de la cabecera, pestaña activa de «En esta sección».
- **Sombra flota** (`box-shadow: 0 1px 2px rgba(17,41,92,0.08), 0 18px 40px -16px rgba(14,26,43,0.35)`): lo que flota sobre el contenido: panel lateral y píldora inferior del celular.
- **Globo** (`box-shadow: 0 8px 22px -10px rgba(14,26,43,0.35)`): el globo de lectura del gráfico de línea.

La píldora inferior del celular es el único vidrio: blanco al 86% con desenfoque de 14px y saturación 1.4.

### Named Rules
**The Profundidad-en-el-Sistema Rule.** Degradados, sombras y desenfoque viven solo en `src/design/*.css`, nunca en componentes ni páginas (lo vigila `tests/visual.test.ts`). Un componente pide profundidad con una clase del sistema; no la escribe.

**The Una-Sombra-por-Capa Rule.** Una tarjeta o panel dentro de una hoja no lleva sombra: lleva borde de línea.

## Shapes

Lenguaje muy redondeado y blando. Píldora completa para botones, navegación, chips de estado, pasos del método y barras de datos; 24px para tarjetas y panel lateral; 28px para la hoja (22px en celular); 16px para filas de lista; 14px para campos, marca de cabecera, entradas del menú y pie del medidor; 12px para cuadros de ícono y los extremos de la banda de cabecera de tabla. Círculos para el botón «ir», el botón redondo, el avatar y los puntos de leyenda. Las cápsulas del medidor tienen las puntas redondas. Bordes de 1px en color línea solo donde no hay sombra.

## Components

### Buttons
Píldora oscura, firme, con respuesta física al presionar.
- **Shape:** píldora completa, alto mínimo 44px (56px en la variante grande, a todo el ancho).
- **Primary:** fondo tinta, texto papel, peso 600.
- **Hover / Focus:** con puntero fino, el fondo se aclara a tinta-hover; al presionar, escala 0.97 en 160ms con ease-out fuerte; foco con contorno de 2px en marca y 2px de separación. Deshabilitado: opacidad 0.45, sin escala.
- **Secondary:** fondo papel, borde línea; hover en velo azul con borde azul claro.
- **Danger:** contorno y texto rojo contradicho sobre transparente; hover relleno rojo con texto papel.
- **Redondo / Ir:** círculo de 42px (vidrio claro) o de 34px (suave) con ícono de 16-18px; escala 0.94-0.95 al presionar.

### Chips
- **Style:** píldora con un punto de 6px del color actual delante, 12.5px, peso 650.
- **State:** ok (verde sobre su velo), espera (ámbar), alto (rojo), neutro (grafito sobre suave). Los chips solo dicen estado.

### Cards / Containers
- **Corner Style:** 24px tarjeta, 28px hoja.
- **Background:** papel sobre el cielo.
- **Shadow Strategy:** «Sombra» (ver Elevation & Depth); dentro de una hoja, borde de línea en su lugar.
- **Border:** ninguno sobre el cielo; línea de 1px dentro de la hoja.
- **Internal Padding:** tarjeta según card-pad (14px en tarjetas de cifra en celular); hoja según sheet-pad.
- **Cabeza de tarjeta:** título en Manrope 15.5px, subtítulo 13px en grafito, botón circular «ir» con flecha diagonal a la derecha.

### Inputs / Fields
- **Style:** fondo papel, borde línea de 1px, radio de control, alto mínimo 44px.
- **Focus:** borde en marca y anillo de 3px en velo azul.
- **Placeholder:** grafito al 60% y en cursiva, para que el ejemplo no se confunda con lo escrito; baja al 38% al enfocar.

### Navigation
- **Cabecera:** marca «8X» en Manrope 800 dentro de una pastilla blanca con sombra (con el nombre de la empresa en pequeño), píldora centrada, acciones a la derecha.
- **Píldora:** contenedor de vidrio claro (blanco al 55%); cada destino es un círculo blanco de 40px con su ícono; el activo se vuelve píldora tinta con su nombre visible. Hover en velo azul solo con puntero fino; escala 0.96 al presionar.
- **Celular y tablet (menos de 1024px):** la misma píldora flota abajo y centrada, con vidrio desenfocado y sombra flota; cada destino de 54px de alto con el nombre debajo del ícono (en un toque no existe el «title»).
- **Portal del dueño:** exactamente cinco destinos (Inicio, Mi empresa, Procesos, Tus documentos, Plan). La barra no crece cuando nace una pantalla: la pantalla nueva se asigna a uno de los cinco y aparece en la fila «En esta sección» (píldoras claras sobre el cielo; la activa es blanca con sombra).
- **Menú completo:** filas de 14px de radio; la activa en velo azul.

### Tablero: piezas de datos
Cada pieza se dibuja desde sus datos; nada es una imagen pegada.
- **Medidor semicircular:** 14 cápsulas radiales con puntas redondas; las llenas van de azul claro a marca, las vacías en velo azul. Sin dato: todas vacías y la lectura lo dice. Cifra al centro en Manrope 34px.
- **Barritas:** una barra fina de 5px por periodo; las tres últimas con dato en marca, las demás en azul claro. Sin dato: carril entero rayado. Cero: raya de 2px en la base. Dicho sin confirmar: solo contorno.
- **Barra segmentada:** tramos en píldora (tinta, gris, gris claro) y rayado para lo que falta, con leyenda de puntos.
- **Línea con peine:** línea azul sobre púas verticales finas por periodo; los periodos sin dato son una zona rayada; globo blanco en píldora que sigue al dedo o al cursor.
- **Pista horizontal:** lo confirmado en una píldora con rampa azul; el resto, rayado.
- **Pasos del método:** píldoras en fila; hecho en verde, actual en tinta, pendiente en suave.

### Tabla
Cabecera en banda de velo azul con los extremos redondeados, 13px 600; filas con línea fina abajo; hover de fila muy tenue solo con puntero fino. En celular se reemplaza por una lista de filas con borde y radio de fila.

### Panel lateral
Se despliega al costado en PC (420px, 12px de margen, radio de tarjeta, sombra flota, entra en 240ms) y desde abajo en celular (hasta 82% del alto, 260ms). Nunca empuja el contenido; telón de tinta al 32%.

### Íconos
Un solo juego dibujado en `src/components/base/Icono.tsx`: trazos en una caja de 24, grosor 1.6, puntas y uniones redondas, color heredado. Tamaños de 16 a 19px.

## Do's and Don'ts

### Do:
- **Do** dibujar lo que falta como carril rayado entero y nombrarlo («sin dato», «aún por calcular»); un cero contado es una raya en la base.
- **Do** sacar cada trazo de un dato real de la empresa; si faltan datos para un gráfico, decir cuántos faltan en lugar de dibujarlo.
- **Do** poner sombras, degradados y desenfoque solo en `src/design/*.css` y aplicarlos por clase.
- **Do** usar los íconos de trazo de `Icono.tsx` (grosor 1.6, puntas redondas).
- **Do** limitar los efectos de hover a `(hover: hover) and (pointer: fine)`.
- **Do** dar respuesta al presionar con una escala pequeña (0.94 a 0.98, 160ms, cubic-bezier(0.23, 1, 0.32, 1)).
- **Do** mantener toda animación por debajo de 300ms y apagarla con `prefers-reduced-motion`.
- **Do** mantener objetivos táctiles de 44px como mínimo.
- **Do** envolver toda pantalla que no sea tablero en la hoja blanca.

### Don't:
- **Don't** usar el rayado para nada que no sea «sin dato»: ni decoración, ni fondo, ni énfasis.
- **Don't** dibujar un dato ausente como cero ni con una altura arbitraria.
- **Don't** escribir `box-shadow`, `gradient(` o `backdrop-filter` en componentes o páginas.
- **Don't** usar emoji como íconos.
- **Don't** agregar un sexto destino a la píldora del portal del dueño; las pantallas nuevas van al mapa de grupos.
- **Don't** usar el color de los gráficos para decir estado; el estado va en los chips.
- **Don't** usar Source Serif 4 en la interfaz en pantalla.
- **Don't** apilar sombra dentro de sombra: una tarjeta dentro de la hoja lleva borde, no sombra.
