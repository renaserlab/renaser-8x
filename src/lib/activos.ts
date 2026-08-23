/**
 * Inventario guiado de activos empresariales (fase 10): "veamos qué información existe hoy en tu empresa".
 * Por bloques, no 50 tarjetas a la vez. Cada activo tiene 4 respuestas posibles (fase 11):
 * lo tengo · lo tengo incompleto · no lo tengo · no sé qué es.
 * La ausencia NO es defecto (fase 12): es una señal de investigación.
 */

export type ActivoDef = { clave: string; nombre: string; ayuda: string };
export type BloqueActivos = { clave: string; nombre: string; intro: string; activos: ActivoDef[] };

export const BLOQUES_ACTIVOS: BloqueActivos[] = [
  {
    clave: "personas",
    nombre: "Personas",
    intro: "Quiénes son, qué hace cada uno y cómo entra alguien nuevo.",
    activos: [
      { clave: "organigrama", nombre: "Organigrama", ayuda: "Aunque sea una foto de la pizarra o un dibujo a mano." },
      { clave: "funciones", nombre: "Funciones por puesto", ayuda: "Qué se espera de cada puesto. Si vive en la cabeza de alguien, también cuenta." },
      { clave: "mvv", nombre: "Misión, visión y valores", ayuda: "Lo que la empresa dice que es y quiere ser." },
      { clave: "seleccion", nombre: "Cómo contratan", ayuda: "Cómo eligen a alguien nuevo: aviso, entrevista, prueba…" },
      { clave: "onboarding", nombre: "Cómo entra alguien nuevo", ayuda: "Qué le enseñan los primeros días y quién." },
      { clave: "evaluacion", nombre: "Cómo saben si alguien lo hace bien", ayuda: "Evaluación, conversación, indicador o simple ojo del jefe." },
    ],
  },
  {
    clave: "procesos",
    nombre: "Procesos",
    intro: "Cómo se hace el trabajo, dónde vive la información y con qué herramientas.",
    activos: [
      { clave: "mapa_procesos", nombre: "Mapa o lista de procesos", ayuda: "Los pasos de las cosas importantes: vender, entregar, cobrar." },
      { clave: "procedimientos", nombre: "Procedimientos escritos", ayuda: "Manuales, checklists, guías. Aunque estén desactualizados." },
      { clave: "politicas", nombre: "Políticas y reglas", ayuda: "Descuentos, créditos, devoluciones, permisos: ¿quién decide qué?" },
      { clave: "indicadores", nombre: "Indicadores que miran", ayuda: "Los números que revisan cada semana o mes, si existen." },
      { clave: "sistemas", nombre: "Sistemas y herramientas", ayuda: "Excel, WhatsApp, algún software: dónde vive la información." },
    ],
  },
  {
    clave: "producto",
    nombre: "Producto / Servicio",
    intro: "Qué venden, cómo lo entregan y cómo saben que quedó bien.",
    activos: [
      { clave: "catalogo", nombre: "Lista de productos o servicios", ayuda: "Con precios si los tienes a mano." },
      { clave: "entrega", nombre: "Cómo entregan", ayuda: "Del pedido a la entrega: pasos, tiempos, quién." },
      { clave: "calidad", nombre: "Cómo cuidan la calidad", ayuda: "Revisiones, estándares o el criterio de alguien con ojo." },
      { clave: "reclamos", nombre: "Reclamos y devoluciones", ayuda: "Qué reclaman los clientes y qué hacen ustedes con eso." },
      { clave: "testimonios", nombre: "Testimonios o contratos", ayuda: "Lo que los clientes dicen; contratos tipo si los usan." },
    ],
  },
  {
    clave: "marketing",
    nombre: "Marketing / Ventas",
    intro: "De dónde vienen los clientes y qué pasa desde el primer contacto hasta la venta.",
    activos: [
      { clave: "cliente_ideal", nombre: "Quién es su cliente", ayuda: "A quién le venden hoy de verdad, no el ideal del plan." },
      { clave: "oferta", nombre: "Qué prometen", ayuda: "Su oferta: qué te llevas, a qué precio, con qué garantía." },
      { clave: "canales", nombre: "De dónde llegan los clientes", ayuda: "Referidos, redes, local, llamadas: por dónde entran." },
      { clave: "proceso_comercial", nombre: "Qué pasa con un interesado", ayuda: "Del primer mensaje a la venta: pasos y quién hace seguimiento." },
      { clave: "resultados_comerciales", nombre: "Números de ventas", ayuda: "Ventas por mes, cotizaciones, cuántos compran." },
    ],
  },
  {
    clave: "resultados",
    nombre: "Resultados",
    intro: "Los números que muestran cómo le va a la empresa.",
    activos: [
      { clave: "ventas", nombre: "Ventas", ayuda: "Facturación por mes, aunque sea del cuaderno." },
      { clave: "margen", nombre: "Margen o utilidad", ayuda: "Cuánto queda después de los costos, si lo saben." },
      { clave: "retencion", nombre: "Clientes que vuelven", ayuda: "Recompra, permanencia o la sensación con nombres concretos." },
      { clave: "tiempos", nombre: "Tiempos de entrega", ayuda: "Cuánto tarda lo prometido, y cuánto tarda de verdad." },
    ],
  },
];

export const ESTADOS_ACTIVO: { clave: string; nombre: string; sub: string }[] = [
  { clave: "lo_tengo", nombre: "Lo tengo", sub: "Súbelo: foto, audio o archivo" },
  { clave: "incompleto", nombre: "Lo tengo incompleto", sub: "Sube lo que haya; completamos juntos" },
  { clave: "no_lo_tengo", nombre: "No lo tengo", sub: "No pasa nada: podemos construirlo" },
  { clave: "no_se", nombre: "No sé qué es", sub: "Te lo explicamos en una frase" },
];
