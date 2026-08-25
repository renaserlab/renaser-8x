/**
 * CAMINOS — después del diagnóstico, el aplicativo ofrece en forma de pregunta lo que ESA empresa
 * necesita: "¿Quieres una guía para contratar bien?" nace de SU hallazgo de rotación, no de un menú.
 */
export type Camino = { pregunta: string; detalle: string; href: string };

type H = { patron: string | null; titulo: string; causa?: string | null };

const MAPA: { re: RegExp; camino: Camino }[] = [
  { re: /rotacion|renuncia|contrat|seleccion/i, camino: { pregunta: "¿Quieres una guía para contratar bien y que tu gente se quede?", detalle: "Con lo que ya nos contaste armamos tu forma de elegir gente y tu plan para retenerla.", href: "/portal/activos" } },
  { re: /dependencia|fundador|todo pasa|aprueba|decisiones.*duen|duen.*decisiones/i, camino: { pregunta: "¿Quieres que el negocio funcione sin que todo pase por ti?", detalle: "Definimos juntos qué decide cada persona y hasta cuánto — por escrito y en práctica.", href: "/portal/activos" } },
  { re: /seguimiento|interesad|no compra|sin responder|leads/i, camino: { pregunta: "¿Quieres dejar de perder a los que preguntan y no compran?", detalle: "Instalamos el registro simple y el responsable de volver a buscar a cada interesado.", href: "/portal/activos" } },
  { re: /abandono|retencion|recompra|no vuelven|no terminan/i, camino: { pregunta: "¿Quieres que tus clientes terminen su proceso y vuelvan?", detalle: "Armamos el seguimiento que hace que el cliente sienta el valor a tiempo.", href: "/portal/procesos" } },
  { re: /calidad|reclamo|estandar/i, camino: { pregunta: "¿Quieres que la calidad no dependa del ojo de una sola persona?", detalle: "Convertimos ese ojo en un estándar que cualquiera del equipo pueda aplicar.", href: "/portal/activos" } },
  { re: /desempen|evaluacion|rendimiento|equipo no|know.?how/i, camino: { pregunta: "¿Quieres construir un equipo de alto rendimiento?", detalle: "Cada puesto con su entrega clara, su indicador simple y su conversación de avance.", href: "/portal/activos" } },
];

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function caminosDesdeHallazgos(hallazgos: H[]): Camino[] {
  const out: Camino[] = [];
  const vistos = new Set<string>();
  for (const h of hallazgos) {
    const texto = sinTildes(`${h.patron ?? ""} ${h.titulo} ${h.causa ?? ""}`);
    const m = MAPA.find((x) => x.re.test(texto));
    if (m && !vistos.has(m.camino.pregunta)) {
      vistos.add(m.camino.pregunta);
      out.push(m.camino);
      if (out.length >= 3) break;
    }
  }
  return out;
}
