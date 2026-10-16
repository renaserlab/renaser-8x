import { createHash, randomUUID } from "crypto";
import { VITAL_POR_CLAVE } from "./metricas";
import { fechaDia, nombreVersion, textoPeriodo, fraseProvisionales, type Medicion } from "./medicion";

/**
 * ACTAS DE ACEPTACIÓN: QUIÉN ACEPTÓ QUÉ, CUÁNDO, QUÉ VERSIÓN Y CON QUÉ CONTENIDO EXACTO (sección 14).
 *
 * Hasta el 13-10-2026 «el dueño aceptó el punto de partida» era una frase en una conversación. Un acta
 * guarda una copia LITERAL de lo aceptado, su huella (SHA-256 del JSON canónico: mismas claves en
 * distinto orden dan la misma huella), la versión a la que pertenece, quién aceptó y cuándo. Después se
 * puede comprobar si lo que hoy dice la base coincide con lo que se aceptó: si la referencia cambió, se
 * dice; nunca se corrige el acta para que vuelva a coincidir.
 *
 * LO QUE NO ES. No es una firma electrónica certificada ni un contrato. La columna `nota_juridica` lo
 * dice en la base y `exportarActa` lo imprime en el documento: el mecanismo queda sujeto a revisión
 * jurídica antes de cualquier uso contractual. Tampoco es auditoría financiera ni renuncia a reclamar.
 */

export const NOTA_JURIDICA = "Mecanismo de aceptación sujeto a revisión jurídica antes de uso contractual.";
export const ALCANCE_ACTA = "Esta aceptación registra el contenido tal como se mostró a quien lo aceptó. No es una auditoría financiera ni una renuncia a reclamar.";

export const TIPOS_ACTA = ["linea_base", "plan", "ficha_direccion", "corte"] as const;
export type TipoActa = (typeof TIPOS_ACTA)[number];

export const NOMBRE_TIPO: Record<TipoActa, string> = {
  linea_base: "Punto de partida",
  plan: "Plan de trabajo",
  ficha_direccion: "Ficha de dirección",
  corte: "Corte de medición",
};

export const NOMBRE_ROL: Record<string, string> = {
  dueno: "Dueño de la empresa",
  socio: "Socio de la empresa",
  consultor: "Consultor",
  cliente: "Cliente",
};

export type Acta = {
  id: string;
  company_id: string;
  tipo: TipoActa;
  referencia_id: string;
  version: number;
  contenido: unknown;
  hash_contenido: string;
  aceptado_por: string | null;
  aceptado_nombre: string | null;
  aceptado_rol: string | null;
  aceptado_at: string;
  documento_path: string | null;
  nota_juridica: string;
};

export type EntradaActa = {
  company_id: string;
  tipo: TipoActa;
  referencia_id: string;
  version?: number | null;
  contenido: unknown;
  aceptado_por: string | null;
  nombre: string | null;
  rol: string | null;
};

/**
 * JSON canónico: claves ordenadas en todos los niveles, listas en su orden. Dos objetos iguales con
 * claves en distinto orden producen el mismo texto, y por tanto la misma huella. `undefined` se omite
 * como hace JSON.stringify; los números se escriben tal cual.
 */
export function jsonCanonico(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x) ?? "null";
  if (Array.isArray(x)) return `[${x.map((v) => jsonCanonico(v === undefined ? null : v)).join(",")}]`;
  const o = x as Record<string, unknown>;
  const claves = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(",")}}`;
}

/** SHA-256 (hexadecimal) del JSON canónico del contenido. */
export function hashContenido(contenido: unknown): string {
  return createHash("sha256").update(jsonCanonico(contenido), "utf8").digest("hex");
}

/** La ruta imprimible de un acta. Cuando haya storage en el entorno, `documento_path` podrá apuntar al archivo exportado. */
export function rutaActa(id: string): string {
  return `/acta/${id}`;
}

/**
 * El contenido literal que se acepta de una medición: lo que se congeló y lo que lo identifica. Se
 * copia tal cual (no se recalcula nada) para que la huella sea de lo que se vio, no de lo que se ve hoy.
 */
export function contenidoDeMedicion(m: Medicion): Record<string, unknown> {
  return {
    id: m.id,
    tipo: m.tipo,
    numero: m.numero,
    version: m.version ?? 1,
    fecha: m.fecha,
    valores: m.valores ?? {},
    derivados: m.derivados ?? {},
    nota: m.nota ?? null,
    linea_base_id: m.linea_base_id ?? null,
    periodo_desde: m.periodo_desde ?? null,
    periodo_hasta: m.periodo_hasta ?? null,
    condiciones: m.condiciones ?? {},
    hash_contenido: m.hash_contenido ?? null,
  };
}

/** El acta lista para guardar: id, huella, fecha y ruta imprimible ya resueltos. Pura salvo el id y la hora. */
export function prepararActa(e: EntradaActa, ahora: Date = new Date(), id: string = randomUUID()): Acta {
  if (!(TIPOS_ACTA as readonly string[]).includes(e.tipo)) throw new Error(`Tipo de acta no válido: ${e.tipo}.`);
  if (e.contenido === undefined || e.contenido === null) throw new Error("Un acta sin contenido no acepta nada.");
  return {
    id,
    company_id: e.company_id,
    tipo: e.tipo,
    referencia_id: e.referencia_id,
    version: e.version ?? 1,
    contenido: e.contenido,
    hash_contenido: hashContenido(e.contenido),
    aceptado_por: e.aceptado_por,
    aceptado_nombre: e.nombre?.trim() || null,
    aceptado_rol: e.rol?.trim() || null,
    aceptado_at: ahora.toISOString(),
    documento_path: rutaActa(id),
    nota_juridica: NOTA_JURIDICA,
  };
}

/** Lo mínimo de un cliente de base que `crearActa` necesita: insertar y devolver la fila. Así se prueba con un doble. */
export type Guardador = {
  from(tabla: string): {
    insert(fila: Record<string, unknown>): {
      select(columnas?: string): { single(): PromiseLike<{ data: unknown; error: { message: string } | null }> };
    };
  };
};

/**
 * Calcula la huella, guarda el acta en `actas_aceptacion` y la devuelve. El `documento_path` queda ligado
 * a la ruta imprimible del acta; si algún día hay storage en el entorno, ahí se colgará el archivo exportado.
 */
export async function crearActa(e: EntradaActa, sb: Guardador): Promise<Acta> {
  const acta = prepararActa(e);
  const { data, error } = await sb.from("actas_aceptacion").insert({ ...acta }).select("*").single();
  if (error) throw new Error(`No se pudo guardar el acta: ${error.message}`);
  return { ...acta, ...((data as Partial<Acta> | null) ?? {}) };
}

export type Verificacion = {
  resultado: "coincide" | "difiere";
  hashActa: string;
  hashActual: string;
  motivo: string;
};

/**
 * ¿Lo que hoy existe es lo que se aceptó? Se recalcula la huella del contenido actual y se compara con
 * la del acta. Si difiere, se dice que la referencia cambió después de la aceptación, y el acta no se toca.
 */
export function verificarActa(acta: Pick<Acta, "hash_contenido" | "version" | "aceptado_at">, contenidoActual: unknown): Verificacion {
  const hashActual = hashContenido(contenidoActual);
  if (hashActual === acta.hash_contenido) {
    return { resultado: "coincide", hashActa: acta.hash_contenido, hashActual, motivo: "El contenido actual coincide con lo aceptado." };
  }
  const v = (contenidoActual as { version?: unknown } | null)?.version;
  const cambioVersion = typeof v === "number" && v !== acta.version ? ` Además la versión cambió: se aceptó la ${acta.version} y hoy es la ${v}.` : "";
  return {
    resultado: "difiere",
    hashActa: acta.hash_contenido,
    hashActual,
    motivo: `La referencia cambió después de la aceptación (${fechaHora(acta.aceptado_at)}): la huella actual no coincide con la del acta.${cambioVersion} El acta conserva lo que se aceptó.`,
  };
}

// ---------------------------------------------------------------------------------------------
// QUIÉN ACEPTÓ: EL DUEÑO ACEPTA, LA CONSULTORA DEJA CONSTANCIA
// ---------------------------------------------------------------------------------------------

/**
 * Los roles con los que acepta LA EMPRESA: «dueno» (lo que escribe la ruta de actas cuando acepta quien
 * tiene membresía de dueño) y «cliente» (el rol de su cuenta). Un socio, un rol sin registrar o la
 * consultora no son el dueño: la falta de dato no se convierte en «aceptado».
 */
export const ROLES_DUENO: readonly string[] = ["dueno", "cliente"];

export type ClaseActa = "dueno" | "consultora" | "otro";

/** De quién es un acta, por el rol con el que se guardó. */
export function claseDeActa(a: Pick<Acta, "aceptado_rol">): ClaseActa {
  const rol = a.aceptado_rol?.trim().toLowerCase() ?? "";
  if (ROLES_DUENO.includes(rol)) return "dueno";
  if (rol === "consultor") return "consultora";
  return "otro";
}

type ActaFechada = Pick<Acta, "referencia_id" | "aceptado_rol" | "aceptado_at">;

/** La más reciente de una lista, sin fiarse del orden en que llegó. */
function masReciente<T extends ActaFechada>(lista: readonly T[]): T | null {
  let elegida: T | null = null;
  let cuando = -Infinity;
  for (const a of lista) {
    const t = Date.parse(a.aceptado_at);
    const n = Number.isNaN(t) ? -Infinity : t;
    if (!elegida || n > cuando) {
      elegida = a;
      cuando = n;
    }
  }
  return elegida;
}

/**
 * LA ACEPTACIÓN QUE CUENTA PARA EL DUEÑO ES LA DEL DUEÑO. Devuelve el acta más reciente con la que el
 * dueño aceptó esa referencia (una versión del punto de partida o un corte), o null si todavía no lo hizo.
 * Hasta el 13-10-2026 se tomaba el acta más reciente de CUALQUIER rol: bastaba con que la consultora
 * levantara la suya para que el dueño viera «Aceptado» y perdiera el botón con el que aceptar él.
 * Cada versión del punto de partida es una fila distinta: aceptar la versión 1 no acepta la 2.
 */
export function aceptacionDelDueno<T extends ActaFechada>(actas: readonly T[], referenciaId: string): T | null {
  return masReciente(actas.filter((a) => a.referencia_id === referenciaId && claseDeActa(a) === "dueno"));
}

/** La constancia más reciente que dejó la consultora sobre esa referencia. Informa; no reemplaza la aceptación del dueño. */
export function constanciaDeLaConsultora<T extends ActaFechada>(actas: readonly T[], referenciaId: string): T | null {
  return masReciente(actas.filter((a) => a.referencia_id === referenciaId && claseDeActa(a) === "consultora"));
}

/**
 * El día de un acta en hora de Lima. La aceptación es un instante: a las 20:00 de Lima ya es el día
 * siguiente en UTC, y el servidor no vive en Lima.
 */
export function fechaActa(iso: string | null | undefined): string {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "sin fecha";
  return d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------------------------
// EXPORTACIÓN: EL DOCUMENTO IMPRIMIBLE
// ---------------------------------------------------------------------------------------------

function escapar(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "sin fecha";
  return d.toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " (hora de Lima)";
}

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

function valorLegible(clave: string, v: unknown): string {
  if (v == null) return "sin dato";
  if (typeof v !== "number") return escapar(v);
  const vital = VITAL_POR_CLAVE.get(clave);
  if (vital?.unidad === "de_cada_10") return `${Math.round(v)} de cada 10`;
  if (vital?.unidad === "dias") return `${Math.round(v)} días`;
  if (vital?.unidad === "soles") return soles(v);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

const NOMBRE_DERIVADO: Record<string, string> = {
  margen: "De cada 100 soles vendidos, quedan (%)",
  margenUnitario: "Margen por unidad del producto estrella",
  equilibrio: "Venta mensual para cubrir los costos (empresa)",
  equilibrioProductoEstrella: "Venta mensual para cubrir los costos si todo fuera el producto estrella (hipótesis)",
  diasAguante: "Días de aguante sin ingresos",
};

/** Si el contenido es una medición (trae `valores`), se muestra además como tabla legible; si no, solo el literal. */
function tablaMedicion(contenido: unknown): string {
  const c = contenido as { valores?: Record<string, unknown>; derivados?: Record<string, unknown>; fecha?: string; periodo_desde?: string | null; periodo_hasta?: string | null; nota?: string | null; condiciones?: { temporada?: string | null; cambios?: { que_cambio: string; desde: string; efecto_esperado: string }[] } } | null;
  if (!c || typeof c !== "object" || !c.valores || typeof c.valores !== "object") return "";
  const filas = Object.entries(c.valores)
    .map(([k, v]) => `<tr><td>${escapar(VITAL_POR_CLAVE.get(k)?.nombre ?? k)}</td><td class="num">${valorLegible(k, v)}</td></tr>`)
    .join("");
  // «provisionales» es la lista de números que salieron de un documento sin revisar: no es un cálculo, se dice en palabras.
  const provisional = fraseProvisionales({ derivados: (c.derivados ?? {}) as Medicion["derivados"] }, "esta medición");
  const derivadosFilas = Object.entries(c.derivados ?? {})
    .filter(([k]) => k !== "provisionales")
    .map(([k, v]) => `<tr><td>${escapar(NOMBRE_DERIVADO[k] ?? k)}</td><td class="num">${v == null ? "sin dato" : typeof v === "number" ? (k === "margen" ? `${v.toFixed(0)} %` : k === "diasAguante" ? `${Math.round(v)} días` : soles(v)) : escapar(v)}</td></tr>`)
    .join("");
  const cambios = (c.condiciones?.cambios ?? []).map((x) => `<li>Desde el ${escapar(fechaDia(x.desde))}: ${escapar(x.que_cambio)} — ${escapar(x.efecto_esperado)}</li>`).join("");
  return `
    <section>
      <h2>Lo aceptado, en palabras</h2>
      <p class="meta">Fecha de la medición: ${escapar(fechaDia(c.fecha))} · Período medido: ${escapar(textoPeriodo({ periodo_desde: c.periodo_desde ?? null, periodo_hasta: c.periodo_hasta ?? null }))}${c.condiciones?.temporada ? ` · Temporada: ${escapar(c.condiciones.temporada)}` : ""}</p>
      <table><thead><tr><th>Número</th><th class="num">Valor congelado</th></tr></thead><tbody>${filas || `<tr><td colspan="2">Sin números congelados.</td></tr>`}</tbody></table>
      ${derivadosFilas ? `<table><thead><tr><th>Cálculo congelado</th><th class="num">Valor</th></tr></thead><tbody>${derivadosFilas}</tbody></table>` : ""}
      ${provisional ? `<p class="meta">${escapar(provisional)}</p>` : ""}
      ${cambios ? `<p class="meta">Cambios de condiciones registrados:</p><ul>${cambios}</ul>` : ""}
      ${c.nota ? `<p class="meta">Nota: ${escapar(c.nota)}</p>` : ""}
    </section>`;
}

/**
 * El acta en limpio: un HTML completo y autocontenido (sin hojas de estilo externas) que se imprime o
 * se guarda como PDF, y que algún día podrá colgarse en storage tal cual. Lleva quién aceptó, cuándo,
 * qué versión, la huella, el contenido literal y la nota jurídica a la vista, no en letra pequeña.
 */
export function exportarActa(acta: Acta, opciones: { empresa?: string | null; verificacion?: Verificacion | null; nombreMedicion?: string | null } = {}): string {
  const tipo = NOMBRE_TIPO[acta.tipo] ?? acta.tipo;
  const rol = acta.aceptado_rol ? (NOMBRE_ROL[acta.aceptado_rol] ?? acta.aceptado_rol) : "rol no registrado";
  const titulo = `Acta de aceptación · ${tipo} · versión ${acta.version}`;
  const v = opciones.verificacion;
  const estadoVerificacion = v
    ? v.resultado === "coincide"
      ? `<p class="ok">Comprobado hoy: ${escapar(v.motivo)}</p>`
      : `<p class="alerta">Atención: ${escapar(v.motivo)}</p>`
    : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 32px 20px 56px; font-family: "Public Sans", "Segoe UI", system-ui, sans-serif; font-size: 16px; line-height: 1.5; color: #1a1a1a; background: #fff; }
  main { max-width: 780px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; flex-wrap: wrap; }
  h1 { font-family: "Source Serif 4", Georgia, serif; font-size: 26px; margin: 24px 0 4px; line-height: 1.2; }
  h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #555; margin: 28px 0 8px; }
  .meta { color: #555; font-size: 14px; margin: 4px 0; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
  dt { color: #555; font-size: 14px; }
  dd { margin: 0; font-variant-numeric: tabular-nums; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 15px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; }
  th { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #555; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  pre { background: #f5f4f0; border: 1px solid #ddd; border-radius: 14px; padding: 12px; font-size: 12.5px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  .juridica { border: 2px solid #1a1a1a; border-radius: 14px; padding: 14px 16px; margin-top: 28px; }
  .juridica strong { display: block; margin-bottom: 4px; }
  .ok { color: #1f6b3a; }
  .alerta { color: #9a2a1f; font-weight: 600; }
  button { min-height: 44px; padding: 0 18px; border-radius: 14px; border: 1px solid #1a1a1a; background: #1a1a1a; color: #fff; font: inherit; cursor: pointer; }
  footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 12px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 13px; color: #555; }
  @media print { .no-imprimir { display: none !important; } @page { margin: 16mm; } body { padding: 0; } }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <p class="meta" style="margin:0">${escapar(opciones.empresa ?? "Empresa")}</p>
      <p class="meta" style="margin:0">Sistema de Alto Rendimiento Renaser</p>
    </div>
    <button type="button" class="no-imprimir" onclick="window.print()">Imprimir / Guardar PDF</button>
  </header>

  <h1>${escapar(titulo)}</h1>
  <p class="meta">${escapar(opciones.nombreMedicion ?? tipo)} · referencia ${escapar(acta.referencia_id)}</p>

  <section>
    <h2>Quién acepta</h2>
    <dl>
      <dt>Nombre</dt><dd>${escapar(acta.aceptado_nombre ?? "no registrado")}</dd>
      <dt>En calidad de</dt><dd>${escapar(rol)}</dd>
      <dt>Fecha y hora</dt><dd>${escapar(fechaHora(acta.aceptado_at))}</dd>
      <dt>Identificador de cuenta</dt><dd>${escapar(acta.aceptado_por ?? "sin cuenta registrada")}</dd>
    </dl>
  </section>

  <section>
    <h2>Qué acepta</h2>
    <dl>
      <dt>Documento</dt><dd>${escapar(tipo)}</dd>
      <dt>Versión</dt><dd>${acta.version}</dd>
      <dt>Huella (SHA-256)</dt><dd><code>${escapar(acta.hash_contenido)}</code></dd>
      <dt>Acta</dt><dd><code>${escapar(acta.id)}</code></dd>
    </dl>
    ${estadoVerificacion}
  </section>

  ${tablaMedicion(acta.contenido)}

  <section>
    <h2>Contenido aceptado, literal</h2>
    <p class="meta">Copia exacta de lo aceptado, en el orden canónico con el que se calculó la huella.</p>
    <pre>${escapar(jsonCanonico(acta.contenido))}</pre>
  </section>

  <aside class="juridica" role="note">
    <strong>Nota jurídica</strong>
    <p style="margin:0">${escapar(acta.nota_juridica || NOTA_JURIDICA)} ${escapar(ALCANCE_ACTA)}</p>
  </aside>

  <footer>
    <span>Documento ligado a la versión ${acta.version} · huella ${escapar(acta.hash_contenido.slice(0, 12))}…</span>
    <span>${escapar(acta.documento_path ?? rutaActa(acta.id))}</span>
  </footer>
</main>
</body>
</html>`;
}

/** Nombre corto de la referencia de un acta cuando es una medición, para el encabezado. */
export function nombreReferencia(acta: Pick<Acta, "tipo">, medicion: Medicion | null): string {
  if (medicion) return nombreVersion(medicion);
  return NOMBRE_TIPO[acta.tipo] ?? acta.tipo;
}
