import { contextoOS } from "@/lib/os/acceso";
import {
  esParaHoy, estadoVisible, estaVencida, hoyEn, lunesDe, minutosDe, minutosTotales, ordenarTareas, sumarDias,
  textoDiaRelativo, textoDuracion, NOMBRE_ESTADO,
} from "@/lib/os/calculos";
import { trabajoDe, fechaLarga, textoHora } from "@/lib/os/dia";
import { diaEnZona } from "@/lib/revision-semanal";
import { MiTrabajo, type TareaVista, type Foco } from "@/components/os/dia/MiTrabajo";
import { Vacio } from "@/components/base/Vacio";

export const dynamic = "force-dynamic";

/**
 * MI TRABAJO (prototipo aprobado el 19-10-2026): las tareas de quien entra, con el cronómetro de foco arriba. Todo se
 * calcula aquí con el reloj de la empresa (qué es de hoy, de la semana, qué está vencido) y el componente solo filtra,
 * elige y pide cambios. Lo de otra persona no se ve aquí: la gestión lo ve en «Equipo en vivo».
 */
export default async function MiTrabajoPag({ searchParams }: { searchParams: Promise<{ tarea?: string }> }) {
  const c = await contextoOS();
  if (!c.persona) {
    return <>
      <h1 className="t-titulo mb-4">Mi trabajo</h1>
      <Vacio texto="«Mi trabajo» es de cada persona del equipo. El trabajo de todos está en «Equipo en vivo»." accion="Ver Equipo en vivo" href="/os/equipo" />
    </>;
  }
  const sp = await searchParams;
  const ahora = new Date();
  const hoy = hoyEn(c.zona, ahora);
  const lunes = lunesDe(hoy);
  const domingo = sumarDias(lunes, 6);
  const { tareas, registros, reprogramaciones, bloqueos, proyectos } = await trabajoDe(c.companyId, c.persona.id);
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]));
  const diaDe = (instante: string | null) => (instante ? diaEnZona(instante, c.zona) : null);

  const vistas: TareaVista[] = ordenarTareas(tareas, hoy).map((t) => {
    const tramos = registros.filter((r) => r.tarea_id === t.id);
    const abierto = bloqueos.find((b) => b.tarea_id === t.id && !b.hasta) ?? null;
    const completadaDia = diaDe(t.completada_at);
    const enSemana = (d: string | null) => !!d && d >= lunes && d <= domingo;
    return {
      ...t,
      estadoVisible: estadoVisible(t, hoy),
      nombreEstado: NOMBRE_ESTADO[estadoVisible(t, hoy)],
      proyecto: t.proyecto_id ? (nombreProyecto.get(t.proyecto_id) ?? null) : null,
      minutos: minutosTotales(tramos, ahora),
      hoy: esParaHoy(t, hoy) || completadaDia === hoy,
      semana: (t.estado !== "completada" && (esParaHoy(t, hoy) || enSemana(t.fecha_inicio) || enSemana(t.fecha_limite))) || enSemana(completadaDia),
      textoFecha: t.fecha_limite ? textoDiaRelativo(t.fecha_limite, hoy) : "Sin fecha",
      tarde: estaVencida(t, hoy),
      textoInicio: t.fecha_inicio ? textoDiaRelativo(t.fecha_inicio, hoy) : "Sin día",
      creadaHoy: diaDe(t.created_at) === hoy,
      bloqueo: abierto ? { causa: abierto.causa, depende_de: abierto.depende_de, desde: textoHora(abierto.desde, c.zona), desdeDia: diaDe(abierto.desde) === hoy ? "" : textoDiaRelativo(diaDe(abierto.desde), hoy) } : null,
      historial: reprogramaciones
        .filter((r) => r.tarea_id === t.id)
        .map((r) => ({
          texto: `${r.tipo === "prorroga" ? "Prórroga" : "Aplazamiento"}: ${textoDiaRelativo(r.antes, hoy)} → ${textoDiaRelativo(r.despues, hoy)}`,
          motivo: r.motivo,
        })),
      tramos: tramos.slice(0, 20).map((r) => ({
        id: r.id,
        cuando: `${textoDiaRelativo(diaDe(r.inicio), hoy)} · ${textoHora(r.inicio, c.zona)} a ${r.fin ? textoHora(r.fin, c.zona) : "ahora"}`,
        duracion: textoDuracion(minutosDe(r, ahora)) === "—" ? "menos de 1 min" : textoDuracion(minutosDe(r, ahora)),
        nota: r.nota,
      })),
    };
  });

  const corriendo = registros.find((r) => !r.fin) ?? null;
  const ultimo = registros.find((r) => r.fin && diaDe(r.inicio) === hoy) ?? null; // vienen del más nuevo al más viejo
  const tareaDe = (id: string) => tareas.find((t) => t.id === id);
  let foco: Foco | null = null;
  if (corriendo && tareaDe(corriendo.tarea_id)) {
    foco = { tarea_id: corriendo.tarea_id, titulo: tareaDe(corriendo.tarea_id)!.titulo, inicio: corriendo.inicio, pausa: false };
  } else if (ultimo && tareaDe(ultimo.tarea_id)?.estado === "en_curso") {
    foco = { tarea_id: ultimo.tarea_id, titulo: tareaDe(ultimo.tarea_id)!.titulo, inicio: null, pausa: true };
  }
  const minutosHoy = minutosTotales(registros.filter((r) => diaDe(r.inicio) === hoy), ahora);
  const elegida = vistas.find((t) => t.id === sp.tarea)?.id ?? foco?.tarea_id ?? vistas.find((t) => t.hoy)?.id ?? vistas[0]?.id ?? null;

  return (
    <MiTrabajo
      tareas={vistas}
      proyectos={proyectos}
      foco={foco}
      hoy={hoy}
      fecha={fechaLarga(hoy)}
      registradoHoy={textoDuracion(minutosHoy)}
      capacidad={textoDuracion(c.persona.capacidad_min)}
      elegidaInicial={elegida}
    />
  );
}
