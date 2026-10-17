/**
 * LA BASE EN MEMORIA QUE HACE DE `supabaseAdmin()` EN LAS PRUEBAS DE RUTAS (16-10-2026).
 *
 * Copia ampliada de `crearBaseFalsa` de tests/producto.test.ts (que no se toca): encadenable y «thenable» como el
 * cliente real; filtra por .eq/.neq/.in/.is/.gte/.lte/.gt/.lt; respeta la lista de columnas del .select() (así se ve
 * qué se le pidió a la base); cuenta con { count: "exact", head: true }; inserta, actualiza, hace upsert por la clave
 * de conflicto y borra. Hace cumplir las claves únicas que importan a estas pruebas: (company_id, codigo) de
 * lineas_producto, una solicitud ACTIVA por (company_id, seccion), (company_id, clave) de ruta_marcas y company_id de
 * ficha_negocio. Lo que no es Postgres (checks, RLS, cascadas) se prueba en tests/sql con PGlite, no aquí.
 */
export type Fila = Record<string, unknown>;
export type ErrorFalso = { code: string; message: string };
type Op = "select" | "insert" | "update" | "upsert" | "delete";
export type Pedido = { tabla: string; op: Op; columnas?: string; filas?: Fila[]; filtros?: [string, string, unknown][] };

/** Las claves únicas: dos filas chocan si esta función dice que sí. */
const UNICAS: Record<string, (a: Fila, b: Fila) => boolean> = {
  lineas_producto: (a, b) => a.company_id === b.company_id && a.codigo != null && a.codigo === b.codigo,
  solicitudes_cliente: (a, b) => a.company_id === b.company_id && a.seccion === b.seccion && a.estado === "activa" && b.estado === "activa",
  ruta_marcas: (a, b) => a.company_id === b.company_id && a.clave === b.clave,
  ficha_negocio: (a, b) => a.company_id === b.company_id,
};

/** Lo que la base pone sola al insertar, por tabla (los default de la migración). */
const DEFAULTS: Record<string, () => Fila> = {
  solicitudes_cliente: () => ({ estado: "activa", activada_at: new Date().toISOString(), completada_at: null, retirada_at: null }),
  costos_mes: () => ({ periodo: "mes_tipico", estado: "estimado", orden: 0 }),
  operaciones_moneda: () => ({ estado: "estimado" }),
  ficha_negocio: () => ({ historia: {}, modulos: {}, totales: {}, moneda: {}, credito: {}, inventario: {} }),
  lineas_producto: () => ({ componentes_costo: [], estados: {} }),
};

/**
 * Lo que una prueba puede sumar sin cambiar nada de lo de arriba (spec-estrategia-8x.md §9.1): claves únicas de otras
 * tablas (se suman a UNICAS; para una tabla que ya tiene la suya, chocan las dos) y funciones de la base para `.rpc()`,
 * que reciben sus argumentos y las tablas en memoria.
 */
export type ExtraBaseFalsa = {
  unicas?: Record<string, (a: Fila, b: Fila) => boolean>;
  rpc?: Record<string, (args: Record<string, unknown>, tablas: Record<string, Fila[]>) => { data: unknown; error: ErrorFalso | null }>;
};

export function crearBaseFalsa(inicial: Record<string, Fila[]> = {}, fallos: Record<string, ErrorFalso> = {}, extra: ExtraBaseFalsa = {}) {
  const tablas: Record<string, Fila[]> = {};
  for (const [t, filas] of Object.entries(inicial)) tablas[t] = filas.map((f) => ({ ...f }));
  const pedidos: Pedido[] = [];
  let n = 0;
  const nuevoId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

  const from = (tabla: string) => {
    tablas[tabla] ??= [];
    const filtros: [string, string, unknown][] = [];
    let op: Op = "select";
    let columnas = "*";
    let contar = false;
    let soloContar = false;
    let nuevas: Fila[] = [];
    let cambios: Fila = {};
    let conflicto: string[] = [];
    let rango: [number, number] | null = null;
    let tope = Number.POSITIVE_INFINITY;

    const pasa = (f: Fila) =>
      filtros.every(([tipo, k, v]) => {
        const x = f[k];
        switch (tipo) {
          case "eq": return x === v;
          case "neq": return x !== v;
          case "in": return (v as unknown[]).includes(x);
          case "is": return v === null ? x == null : x === v;
          case "gte": return String(x ?? "") >= String(v);
          case "lte": return String(x ?? "") <= String(v);
          case "gt": return String(x ?? "") > String(v);
          case "lt": return String(x ?? "") < String(v);
          default: return true;
        }
      });
    const recortar = (f: Fila): Fila => {
      if (columnas === "*" || !columnas) return { ...f };
      const cols = columnas.split(",").map((c) => c.trim()).filter((c) => c && !c.includes("("));
      return Object.fromEntries(cols.map((c) => [c, f[c] ?? null]));
    };
    const choca = (f: Fila, ignorar?: Fila) => {
      const reglas = [UNICAS[tabla], extra.unicas?.[tabla]].filter((r): r is (a: Fila, b: Fila) => boolean => !!r);
      return reglas.some((regla) => tablas[tabla]!.some((x) => x !== ignorar && regla(x, f)));
    };
    const duplicado = { code: "23505", message: "duplicate key value violates unique constraint" };

    const ejecutar = (): { data: Fila[] | null; error: ErrorFalso | null; count?: number | null } => {
      if (fallos[tabla]) return { data: null, error: fallos[tabla]! };
      if (op === "insert") {
        const creadas = nuevas.map((f) => ({ id: nuevoId(), created_at: new Date().toISOString(), ...(DEFAULTS[tabla]?.() ?? {}), ...f }));
        for (const f of creadas) if (choca(f)) return { data: null, error: duplicado };
        tablas[tabla]!.push(...creadas);
        pedidos.push({ tabla, op, filas: creadas });
        return { data: creadas.map(recortar), error: null };
      }
      if (op === "upsert") {
        const hechas: Fila[] = [];
        for (const f of nuevas) {
          const previa = conflicto.length ? tablas[tabla]!.find((x) => conflicto.every((c) => x[c] === f[c])) : undefined;
          if (previa) {
            Object.assign(previa, f);
            hechas.push(previa);
          } else {
            const creada = { id: nuevoId(), created_at: new Date().toISOString(), ...(DEFAULTS[tabla]?.() ?? {}), ...f };
            if (choca(creada)) return { data: null, error: duplicado };
            tablas[tabla]!.push(creada);
            hechas.push(creada);
          }
        }
        pedidos.push({ tabla, op, filas: hechas });
        return { data: hechas.map(recortar), error: null };
      }
      if (op === "update") {
        const tocadas = tablas[tabla]!.filter(pasa);
        for (const f of tocadas) {
          const queda = { ...f, ...cambios };
          if (choca(queda, f)) return { data: null, error: duplicado };
        }
        for (const f of tocadas) Object.assign(f, cambios);
        pedidos.push({ tabla, op, filas: tocadas, filtros: [...filtros] });
        return { data: tocadas.map(recortar), error: null };
      }
      if (op === "delete") {
        const borradas = tablas[tabla]!.filter(pasa);
        tablas[tabla] = tablas[tabla]!.filter((f) => !borradas.includes(f));
        pedidos.push({ tabla, op, filas: borradas, filtros: [...filtros] });
        return { data: borradas.map(recortar), error: null };
      }
      pedidos.push({ tabla, op, columnas, filtros: [...filtros] });
      const todas = tablas[tabla]!.filter(pasa);
      if (soloContar) return { data: null, error: null, count: todas.length };
      const vistas = (rango ? todas.slice(rango[0], rango[1] + 1) : todas).slice(0, tope).map(recortar);
      return { data: vistas, error: null, ...(contar ? { count: todas.length } : {}) };
    };

    const q = {
      select: (c?: string, o?: { count?: string; head?: boolean }) => {
        if (op === "select") {
          columnas = c ?? "*";
          contar = !!o?.count;
          soloContar = !!o?.head;
        } else if (c) {
          columnas = c;
        }
        return q;
      },
      insert: (f: Fila | Fila[]) => {
        op = "insert";
        nuevas = Array.isArray(f) ? f : [f];
        return q;
      },
      upsert: (f: Fila | Fila[], o?: { onConflict?: string }) => {
        op = "upsert";
        nuevas = Array.isArray(f) ? f : [f];
        conflicto = (o?.onConflict ?? "id").split(",").map((s) => s.trim());
        return q;
      },
      update: (c: Fila) => {
        op = "update";
        cambios = c;
        return q;
      },
      delete: () => {
        op = "delete";
        return q;
      },
      eq: (k: string, v: unknown) => (filtros.push(["eq", k, v]), q),
      neq: (k: string, v: unknown) => (filtros.push(["neq", k, v]), q),
      in: (k: string, v: unknown[]) => (filtros.push(["in", k, v]), q),
      is: (k: string, v: unknown) => (filtros.push(["is", k, v]), q),
      gte: (k: string, v: unknown) => (filtros.push(["gte", k, v]), q),
      lte: (k: string, v: unknown) => (filtros.push(["lte", k, v]), q),
      gt: (k: string, v: unknown) => (filtros.push(["gt", k, v]), q),
      lt: (k: string, v: unknown) => (filtros.push(["lt", k, v]), q),
      order: () => q,
      limit: (k: number) => ((tope = k), q),
      range: (desde: number, hasta: number) => ((rango = [desde, hasta]), q),
      maybeSingle: async () => {
        const r = ejecutar();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      single: async () => {
        const r = ejecutar();
        if (r.error) return { data: null, error: r.error };
        if (!r.data?.length) return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
        return { data: r.data[0], error: null };
      },
      then: (res: (v: ReturnType<typeof ejecutar>) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  /** Una función de la base: la de `extra.rpc`, o «no existe» como la respondería PostgREST. */
  const llamadas: { nombre: string; args: Record<string, unknown> }[] = [];
  const rpc = async (nombre: string, args: Record<string, unknown> = {}) => {
    llamadas.push({ nombre, args });
    const f = extra.rpc?.[nombre];
    return f ? f(args, tablas) : { data: null, error: { code: "PGRST202", message: `Could not find the function public.${nombre}` } };
  };
  // `fallos` se devuelve para que una prueba haga fallar una tabla después de armar la base (b.fallos.tabla = {...}).
  return { from, rpc, llamadas, tablas, pedidos, fallos };
}

export type BaseFalsa = ReturnType<typeof crearBaseFalsa>;
