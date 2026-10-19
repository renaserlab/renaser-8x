import ExcelJS from "exceljs";
import { protegido, fallo } from "@/lib/api";
import { exigirOS } from "@/lib/os/acceso";
import { hoyEn, lunesDe, textoDia } from "@/lib/os/calculos";
import { esLunes } from "@/lib/revision-semanal";
import { leerReporte } from "@/lib/os/reporte";

/**
 * EL REPORTE SEMANAL EN EXCEL (Reporte semanal → «Descargar en Excel»). Las mismas cuentas que la pantalla (leerReporte),
 * en dos hojas: el día por día de cada persona y lo que más se trabó. Las horas van en número (con un decimal) para que
 * el dueño pueda sumar y filtrar en su Excel.
 */
export const GET = protegido({ entidad: "os_reporte" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { gestion: true });
  const pedido = new URL(req.url).searchParams.get("semana");
  const hoy = hoyEn(c.zona);
  const lunes = pedido && esLunes(pedido) ? pedido : lunesDe(hoy);
  if (lunes > lunesDe(hoy)) return fallo("Esa semana todavía no empieza.");
  const r = await leerReporte(c.companyId, c.zona, lunes, hoy);

  const wb = new ExcelJS.Workbook();
  wb.creator = "8X · Equipos";
  const hoja = wb.addWorksheet("Semana");
  hoja.addRow([`${c.empresa} · reporte de la semana del ${lunes}`]).font = { bold: true, size: 13 };
  hoja.addRow([]);
  const cabeza = ["Persona", "Puesto", ...r.dias.flatMap((d) => [`${textoDia(d)} · horas`, `${textoDia(d)} · tareas`, `${textoDia(d)} · abrió/cerró`]), "Horas de la semana", "Tareas terminadas", "Cierre semanal"];
  hoja.addRow(cabeza).font = { bold: true };
  for (const f of r.filas) {
    hoja.addRow([
      f.persona.nombre,
      f.persona.puesto ?? "",
      ...f.dias.flatMap((d) => [Math.round((d.minutos / 60) * 10) / 10, d.terminadas, d.abrio ? (d.cerro ? "Abrió y cerró" : "Abrió, sin cierre") : "No abrió"]),
      Math.round((f.minutos / 60) * 10) / 10,
      f.terminadas,
      f.cierreSemanal ? "Hecho" : "Falta",
    ]);
  }
  hoja.addRow([]);
  hoja.addRow(["Tareas terminadas", r.terminadas]);
  hoja.addRow(["Cumplimiento", r.cumplimiento.pct == null ? "Sin tareas que vencieran" : `${r.cumplimiento.pct}%`]);
  hoja.addRow(["Horas registradas", Math.round((r.minutos / 60) * 10) / 10]);
  hoja.addRow(["Horas bloqueadas", Math.round((r.minutosBloqueado / 60) * 10) / 10]);
  hoja.getColumn(1).width = 26;
  hoja.getColumn(2).width = 18;

  const trabas = wb.addWorksheet("Lo que se trabó");
  trabas.addRow(["Tarea", "Persona", "Veces bloqueada", "Horas bloqueada"]).font = { bold: true };
  for (const t of r.trabas) trabas.addRow([t.tarea, t.persona, t.veces, Math.round((t.minutos / 60) * 10) / 10]);
  trabas.getColumn(1).width = 40;
  trabas.getColumn(2).width = 22;

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="reporte-semanal-${lunes}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
