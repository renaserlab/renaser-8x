/**
 * LAS LECTURAS DE «SUBIR EN CADA PARTE» (16-10-2026). SERVIDOR: lo usan las páginas, nunca un componente de cliente.
 *
 * Cada lectura es de UNA empresa, con columnas explícitas (ni el contenido del archivo ni su ruta en el almacén) y con
 * tope, y ninguna tumba la página: si falla, devuelve null y la pantalla dice «no pudimos leer», nunca «no hay».
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ProcesoResumen } from "@/components/ProcesosLista";
import type { ProcesoEnLista } from "./ImportarProcesos";
import { COLUMNAS_FUENTE_SUBIDA, type FuenteSubida, type ProcesoPorDibujar } from "./subidas";

/** Cuántos procesos se preguntan por consulta: la lista de ids viaja en la URL de PostgREST. */
const POR_TANDA = 100;
/** Tope de procesos sin dibujar que se miran: el mismo de una importación. */
const MAX_SIN_DIBUJAR = 500;

const porFecha = (a: FuenteSubida, b: FuenteSubida) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));

/**
 * Los archivos subidos a unos procesos de la empresa, del más nuevo al más viejo, por proceso. Filtrado en la consulta:
 * esta empresa y estos procesos. null si no se pudo leer.
 */
export async function archivosDeProcesos(companyId: string, ids: string[]): Promise<Map<string, FuenteSubida[]> | null> {
  const mapa = new Map<string, FuenteSubida[]>();
  if (!ids.length) return mapa;
  try {
    const sb = supabaseAdmin();
    const tandas: string[][] = [];
    for (let i = 0; i < ids.length; i += POR_TANDA) tandas.push(ids.slice(i, i + POR_TANDA));
    const respuestas = await Promise.all(
      tandas.map((t) => sb.from("sources").select(COLUMNAS_FUENTE_SUBIDA).eq("company_id", companyId).in("process_id", t).order("created_at", { ascending: false }).limit(1000))
    );
    for (const r of respuestas) {
      if (r.error) throw new Error(r.error.message);
      for (const f of (r.data ?? []) as unknown as FuenteSubida[]) {
        if (!f.process_id) continue;
        mapa.set(f.process_id, [...(mapa.get(f.process_id) ?? []), f]);
      }
    }
    for (const lista of mapa.values()) lista.sort(porFecha);
    return mapa;
  } catch (e) {
    console.error("[procesos] no se pudieron leer los archivos de los procesos", e);
    return null;
  }
}

/**
 * Los procesos que existen y no están dibujados, partidos en dos: los que ya tienen un archivo subido (se ven con su
 * estado, para dibujarlos con él) y los que no (lo que trajo una lista importada). Si los archivos no se pudieron
 * leer, todos van a la segunda lista y `archivosLeidos` es false: la pantalla lo dice en vez de callarlo.
 */
export async function porDibujar(
  companyId: string,
  procesos: ProcesoResumen[]
): Promise<{ conArchivo: ProcesoPorDibujar[]; sinArchivo: ProcesoEnLista[]; archivosLeidos: boolean }> {
  const sinDibujar = procesos.filter((p) => p.version === "sin_dibujar").slice(0, MAX_SIN_DIBUJAR);
  const mapa = await archivosDeProcesos(companyId, sinDibujar.map((p) => p.id));
  if (!mapa) return { conArchivo: [], sinArchivo: sinDibujar.map((p) => ({ id: p.id, nombre: p.nombre, area: p.area })), archivosLeidos: false };
  const conArchivo: ProcesoPorDibujar[] = [];
  const sinArchivo: ProcesoEnLista[] = [];
  for (const p of sinDibujar) {
    const archivos = mapa.get(p.id) ?? [];
    if (archivos.length) conArchivo.push({ id: p.id, nombre: p.nombre, area: p.area, archivos });
    else sinArchivo.push({ id: p.id, nombre: p.nombre, area: p.area });
  }
  return { conArchivo, sinArchivo, archivosLeidos: true };
}

/** Lo que la empresa subió (o contó) en un documento de «Tu información»: el activo y el archivo ligado a él. */
export type SubidoEnSeccion =
  | { ok: true; activo: { estado: string | null; actualizado: string | null } | null; fuente: FuenteSubida | null }
  | { ok: false };

/**
 * El documento de una clave de `company_assets` (por ejemplo «personas.organigrama») de UNA empresa, con su archivo.
 * El archivo se lee con la misma empresa en el filtro: aunque el activo apuntara a una fuente ajena, no se mostraría.
 * `company_assets` guarda un archivo por documento (el último que se subió ahí); los anteriores siguen en Fuentes.
 */
export async function subidoEnSeccion(companyId: string, clave: string): Promise<SubidoEnSeccion> {
  try {
    const sb = supabaseAdmin();
    const { data: a, error } = await sb.from("company_assets").select("clave,estado,source_id,updated_at").eq("company_id", companyId).eq("clave", clave).maybeSingle();
    if (error) throw new Error(error.message);
    if (!a) return { ok: true, activo: null, fuente: null };
    const activo = a as { estado: string | null; source_id: string | null; updated_at: string | null };
    let fuente: FuenteSubida | null = null;
    if (activo.source_id) {
      const { data: f, error: eF } = await sb.from("sources").select(COLUMNAS_FUENTE_SUBIDA).eq("id", activo.source_id).eq("company_id", companyId).maybeSingle();
      if (eF) throw new Error(eF.message);
      fuente = (f as unknown as FuenteSubida | null) ?? null;
    }
    return { ok: true, activo: { estado: activo.estado, actualizado: activo.updated_at }, fuente };
  } catch (e) {
    console.error(`[procesos] no se pudo leer lo subido en ${clave}`, e);
    return { ok: false };
  }
}
