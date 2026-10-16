import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { validarArchivo } from "@/lib/archivos";
import { MIME_EXCEL, firmaDe } from "@/lib/documentos";
import { lineasDesdeExcel, vistaPreviaLineas, listarLineas, importarLineas, periodoValido, ErrorDeLinea, FORMA_PERIODO, TIPOS_LINEA, type TipoLinea } from "@/lib/producto";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string }> };

const MAX_LINEAS = 2000;

/**
 * POST multipart: archivo (.xlsx), modo (vista_previa | confirmar), hoja?, periodo?, tipo?.
 *
 * Importa las líneas de lo que vende la empresa desde su propio Excel: columnas código, nombre, precio,
 * costo, unidades (y tipo, horas si las hay), con el encabezado escrito como sea. Primero la vista previa
 * —qué se crea, qué se actualiza, qué se omite y por qué— y solo con «confirmar» se escribe. Las celdas
 * vacías se importan vacías: un costo que no está no es un costo de cero. Nada se borra, y la decisión
 * de una línea que ya existe no se toca.
 *
 * `tipo` (producto | servicio) vale para las filas cuya hoja no dice de qué tipo son.
 */
export const POST = protegido<Ctx>({ consultor: true, cupo: "subida", entidad: "linea_producto" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const form = await req.formData();
  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) return fallo("Sube el Excel (.xlsx) con tus productos o servicios.");
  const v = validarArchivo({ nombre: archivo.name, mime: archivo.type || MIME_EXCEL, bytes: archivo.size });
  if (!v.ok) return fallo(v.error);
  if (v.mime !== MIME_EXCEL) return fallo("Para las líneas de producto hace falta un Excel (.xlsx). Si lo tienes en otro formato, ábrelo en Excel y guárdalo como .xlsx.");
  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (firmaDe(bytes) !== "zip") return fallo("El archivo dice ser un Excel (.xlsx) pero su contenido no lo es. Ábrelo en Excel y guárdalo de nuevo como .xlsx.");

  const modo = String(form.get("modo") ?? "vista_previa");
  if (modo !== "vista_previa" && modo !== "confirmar") return fallo("El modo tiene que ser vista_previa o confirmar.");
  const hoja = String(form.get("hoja") ?? "").trim() || null;
  const periodo = String(form.get("periodo") ?? "").trim() || null;
  if (periodo && !periodoValido(periodo)) return fallo(`El periodo se escribe así: ${FORMA_PERIODO}.`);
  const tipoPedido = String(form.get("tipo") ?? "").trim();
  if (tipoPedido && !(TIPOS_LINEA as readonly string[]).includes(tipoPedido)) return fallo("El tipo tiene que ser producto o servicio.");
  const tipoPorDefecto = (tipoPedido || "producto") as TipoLinea;

  let leido: Awaited<ReturnType<typeof lineasDesdeExcel>>;
  try {
    leido = await lineasDesdeExcel(bytes, hoja, { tipoPorDefecto });
  } catch {
    return fallo("No pudimos abrir ese Excel: parece dañado o no es un .xlsx de verdad. Ábrelo en Excel, guárdalo de nuevo y súbelo otra vez.");
  }
  if (!leido.lectura) return fallo(leido.motivo ?? "No encontramos las columnas de nombre o código.");
  if (leido.lectura.filas.length > MAX_LINEAS) return fallo(`El archivo trae ${leido.lectura.filas.length} filas; el tope por importación es ${MAX_LINEAS}. Divídelo.`);

  const existentes = await listarLineas(id);
  const vista = vistaPreviaLineas(leido.lectura.filas, existentes, leido.lectura.omitidas);
  const columnas = Object.fromEntries(Object.entries(leido.lectura.columnas).map(([campo, c]) => [campo, c?.encabezado ?? null]));
  const base = {
    archivo: v.nombre,
    hoja: leido.lectura.hoja,
    hojas: leido.hojas,
    fidelidad: leido.fidelidad,
    columnas,
    faltantes: leido.lectura.faltantes,
    periodo,
    tipo: tipoPorDefecto,
    total_filas: leido.lectura.filas.length + leido.lectura.omitidas.length,
  };

  if (modo === "vista_previa") return ok({ ...base, nuevas: vista.nuevas, actualizan: vista.actualizan, omitidas: vista.omitidas });

  try {
    const r = await importarLineas(id, vista, { periodo });
    void registrar({
      companyId: id,
      actor: perfil,
      accion: "crear",
      entidad: "linea_producto",
      detalle: { archivo: v.nombre, hoja: leido.lectura.hoja, creadas: r.creadas, actualizadas: r.actualizadas, omitidas: vista.omitidas.length },
      ruta: "/api/companies/producto/importar",
      ip: ipDe(req),
    });
    refrescarRuta(id, "negocio");
    return ok({ ...base, ...r, omitidas: vista.omitidas }, 201);
  } catch (e) {
    if (e instanceof ErrorDeLinea) return fallo(e.message, 500);
    throw e;
  }
});
