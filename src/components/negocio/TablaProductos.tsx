"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { MODELO, type DefModelo, type ModeloNegocio } from "@/lib/negocio";
import { moneda as enMoneda, type ConfigEmpresa } from "@/lib/formato";
import { escalarRango, esExacto, multiplicarRangos, rangoDe, textoRango, type DatoOral, type Rango } from "@/lib/dato-oral";
import type { ComponenteCosto, LineaProducto } from "@/lib/producto";
import { cobraPorHora, lecturaDatosModelo, type Totales } from "@/lib/esquemas-negocio";
import { CampoDato } from "./CampoDato";
import { ChipEstado, SinDato, AvisoGuardado } from "./Marcas";
import { cantidad, leerNumero, mensajeDe, mostrarDato, sumaDePartes, type Modo } from "./dato";

/**
 * LO QUE VENDE LA EMPRESA, PARA LLENAR SIN QUE SEA TEDIOSO (pedido de Kelin, 16-10-2026).
 *
 * En el celular, una tarjeta por producto con tres pasos: el precio, lo que cuesta (parte por parte) y cuánto vendió
 * el mes pasado (se pide el episodio, nunca «un mes normal»). En el escritorio, las mismas columnas en una tabla. Cada tarjeta se guarda al salir de ella (o
 * con «Guardar»), nunca por tecla, y dice «Guardado» o el error de la ruta en palabras. La tarjeta NUEVA también se
 * guarda al salir (con su nombre): crea el producto y sigue abierta con él. Un error de guardado se queda en la fila,
 * aunque la tarjeta ya se haya cerrado; y no se abre otra fila mientras haya un producto nuevo sin nombre.
 *
 * Ayudas que quitan tedio: copiar las partes del producto anterior, solo los nombres o con sus montos (son números
 * del mismo dueño: se copian con su estado, se pueden cambiar, y lo comprobado pasa a «anotado» porque el documento
 * era del otro producto); agregar varios de una vez (un nombre por renglón), y «No sé cuántos vendo de cada uno»:
 * entonces se pregunta de cada 10 de su grupo, más el total del grupo, y se avisa si los «de cada 10» no suman 10, sin
 * bloquear. El precio, el costo total y los «de cada 10» aceptan rango («62 a 66», «3 o 4»): el rango se guarda como
 * rango (datos_modelo), nunca su centro. Quien cobra por hora lo dice, y el precio de un caso sale de las horas que
 * lleva. Con más de 15, buscador y de a 10.
 *
 * El dueño no ve decisiones, origen del dato ni nada de la consultora; lo que la consultora comprobó con un documento
 * lo ve, pero no lo cambia. Las preguntas salen de cómo gana dinero la empresa (src/lib/negocio.ts).
 */

type Props = {
  companyId: string;
  modo: Modo;
  lineas: LineaProducto[];
  /** Cómo gana dinero la empresa (uno o dos modelos). Vacío: preguntas generales. */
  modelos: ModeloNegocio[];
  totales: Totales;
  editable: boolean;
  /** Quién mira: el dueño solo quita lo que él mismo anotó. */
  usuarioId: string | null;
  config: ConfigEmpresa;
  /** Lo que deja cada línea al mes, ya calculado en el servidor (src/lib/rentabilidad.ts), por id. */
  deja: Record<string, string>;
};

const POR_PAGINA = 10;
const BUSCADOR_DESDE = 15;

/** Sin modelo elegido: preguntas que sirven a cualquiera. */
const GENERICO: Record<"producto" | "servicio", DefModelo> = {
  producto: { ...MODELO.compra_y_revende, preguntaCosto: "¿Cuánto te cuesta cada uno? Ve parte por parte.", placeholderPartes: "Nombre de la parte", preguntaSegundoPrecio: "¿Lo vendes también a otro precio?" },
  servicio: MODELO.vende_horas_o_casos,
};

function defDe(modelo: ModeloNegocio | null | undefined, tipo: "producto" | "servicio" | undefined, modelos: ModeloNegocio[]): DefModelo {
  if (modelo) return MODELO[modelo];
  if (modelos[0]) return MODELO[modelos[0]];
  return GENERICO[tipo ?? "producto"];
}

const dinero = (cfg: ConfigEmpresa) => (n: number) => enMoneda(n, cfg, { decimales: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2 });
const redondea = (n: number) => Math.round(n * 100) / 100;

type RangoDicho = { desde: number; hasta: number };

/** Del número o del rango guardados, el dato para la caja. Sin ninguno, «no lo sé» si eso se dijo; si no, nada. */
function datoGuardado(numero: number | null | undefined, rango: Rango | null, estado: DatoOral["estado"] | undefined): DatoOral | null {
  const e = estado && estado !== "no_lo_se" ? estado : "estimado";
  if (numero != null) return { valor: numero, estado: e };
  if (rango) return { desde: rango.bajo, hasta: rango.alto, estado: e };
  return estado === "no_lo_se" ? { estado: "no_lo_se" } : null;
}

/** Lo dicho, a lo que se guarda: un número va a su columna; un rango va aparte (datos_modelo) y la columna queda vacía. */
function partir(d: DatoOral | null): { numero: number | null; rango: RangoDicho | null } {
  const r = rangoDe(d);
  if (!r) return { numero: null, rango: null };
  return esExacto(r) ? { numero: r.bajo, rango: null } : { numero: null, rango: { desde: r.bajo, hasta: r.alto } };
}

/** Las claves de datos_modelo que escribe esta tabla: se conservan las que no cambian. */
const CLAVES_DATOS_MODELO = ["ticket", "comision_pct", "dicho", "por", "por_hora", "rango_precio", "rango_costo", "rango_de_cada_10", "rango_de_cada_10_segundo"] as const;

// ─── El borrador de una tarjeta ──────────────────────────────────────────────────────────────────

type Borrador = {
  nombre: string;
  grupo: string;
  modelo: ModeloNegocio | null;
  /** Un número o un rango. Cobrando por hora, el precio de UNA hora. */
  precio: DatoOral | null;
  /** Cobra por hora (solo donde el modelo lo admite): el precio de un caso = precio × horas que lleva un caso. */
  porHora: boolean;
  porTicket: boolean;
  ticket: string;
  comision: string;
  conSegundo: boolean;
  segundoEs: "por_mayor" | "minimo";
  precioSegundo: DatoOral | null;
  deCada10Segundo: DatoOral | null;
  porPartes: boolean;
  partes: ComponenteCosto[];
  costo: DatoOral | null;
  horas: DatoOral | null;
  modoVolumen: "dicho" | "de_cada_10";
  /** Cuánto vende, como lo dijo: al mes, en tres meses o en un día, según el modelo. */
  volumen: DatoOral | null;
  deCada10: DatoOral | null;
};

type Dicho = { valor?: number | null; desde?: number | null; hasta?: number | null };

function datoDeDicho(d: Dicho | null | undefined, estado: DatoOral["estado"] | undefined): DatoOral | null {
  if (!d) return null;
  const e = estado && estado !== "no_lo_se" ? estado : "estimado";
  if (d.valor != null) return { valor: d.valor, estado: e };
  if (d.desde != null && d.hasta != null) return { desde: d.desde, hasta: d.hasta, estado: e };
  return null;
}

function borradorDe(l: LineaProducto | null, modelos: ModeloNegocio[], totales: Totales): Borrador {
  const modelo = l?.modelo ?? (l ? null : modelos[0] ?? null);
  const def = defDe(modelo, l?.tipo, modelos);
  const est = l?.estados ?? {};
  const dm = (l?.datos_modelo ?? {}) as { ticket?: number | null; comision_pct?: number | null; dicho?: Dicho | null; por?: string | null };
  const dml = lecturaDatosModelo(l?.datos_modelo);
  const partes = l?.componentes_costo ?? [];

  // Cuánto vende, como lo dijo. Si se guardó lo dicho (por trimestre o por día), eso; si no, lo del mes llevado atrás.
  let volumen: DatoOral | null = null;
  const mes: Rango | null = l?.unidades_mes != null ? { bajo: l.unidades_mes, alto: l.unidades_mes } : l?.unidades_mes_desde != null && l?.unidades_mes_hasta != null ? { bajo: l.unidades_mes_desde, alto: l.unidades_mes_hasta } : null;
  if (def.volumenSeDicePor !== "mes" && dm.dicho && dm.por === def.volumenSeDicePor) volumen = datoDeDicho(dm.dicho, est.unidades);
  else if (mes) {
    let dicho: Rango | null = mes;
    if (def.volumenSeDicePor === "trimestre") dicho = escalarRango(mes, 3);
    else if (def.volumenSeDicePor === "dia") {
      const dias = rangoDe(totales.dias_al_mes);
      dicho = dias && esExacto(dias) && dias.bajo > 0 ? escalarRango(mes, 1 / dias.bajo) : null;
    }
    if (dicho) volumen = esExacto(dicho) ? { valor: redondea(dicho.bajo), estado: est.unidades && est.unidades !== "no_lo_se" ? est.unidades : "estimado" } : { desde: redondea(dicho.bajo), hasta: redondea(dicho.alto), estado: est.unidades && est.unidades !== "no_lo_se" ? est.unidades : "estimado" };
  } else if (est.unidades === "no_lo_se" && l?.participacion_de_10 == null) volumen = { estado: "no_lo_se" };

  return {
    nombre: l?.nombre ?? "",
    grupo: l?.grupo ?? "",
    modelo,
    precio: datoGuardado(l?.precio, dml.rangoPrecio, est.precio),
    porHora: !!l && cobraPorHora(l),
    porTicket: dm.ticket != null && dm.comision_pct != null,
    ticket: dm.ticket != null ? String(dm.ticket) : "",
    comision: dm.comision_pct != null ? String(dm.comision_pct) : "",
    conSegundo: l?.precio_segundo != null,
    segundoEs: l?.segundo_precio_es ?? "por_mayor",
    precioSegundo: l?.precio_segundo != null ? { valor: l.precio_segundo, estado: est.precio && est.precio !== "no_lo_se" ? est.precio : "estimado" } : null,
    deCada10Segundo: l?.de_cada_10_segundo != null || dml.rangoDeCada10Segundo ? datoGuardado(l?.de_cada_10_segundo, dml.rangoDeCada10Segundo, "estimado") : null,
    porPartes: partes.length > 0 || (l?.costo_variable_unitario == null && !dml.rangoCosto),
    partes,
    costo: partes.length ? null : datoGuardado(l?.costo_variable_unitario, dml.rangoCosto, est.costo),
    horas: l?.horas_por_unidad != null ? { valor: l.horas_por_unidad, estado: "estimado" } : null,
    modoVolumen: l?.participacion_de_10 != null || dml.rangoDeCada10 ? "de_cada_10" : "dicho",
    volumen,
    deCada10: l?.participacion_de_10 != null || dml.rangoDeCada10 ? datoGuardado(l?.participacion_de_10, dml.rangoDeCada10, est.unidades) : null,
  };
}

// ─── Del borrador a lo que se manda ──────────────────────────────────────────────────────────────

type Grupo = "precio" | "costo" | "unidades";
type Cuerpo = Record<string, unknown>;

/** `admitePorHora`: el modelo de la línea admite cobrar por hora; si no, una marca vieja de «por hora» no se manda. */
function camposPrecio(b: Borrador, admitePorHora = true): { campos: Cuerpo; estado: DatoOral["estado"] | null; datos: Cuerpo } {
  const porHora = admitePorHora && b.porHora && !b.porTicket;
  let precio: number | null = null;
  let rangoPrecio: RangoDicho | null = null;
  let estado = b.precio?.estado ?? null;
  // Todas las claves del precio viajan, también en null: así lo que se desmarca (ticket, por hora, un rango) se borra.
  const datos: Cuerpo = { ticket: null, comision_pct: null };
  if (b.porTicket) {
    const t = leerNumero(b.ticket);
    const c = leerNumero(b.comision);
    const ticket = t.ok ? t.n : null;
    const comision = c.ok ? c.n : null;
    datos.ticket = ticket;
    datos.comision_pct = comision;
    precio = ticket != null && comision != null ? redondea((ticket * comision) / 100) : null;
    estado = precio != null ? (b.precio?.estado && b.precio.estado !== "no_lo_se" ? b.precio.estado : "estimado") : null;
  } else {
    const p = partir(b.precio);
    precio = p.numero;
    rangoPrecio = p.rango;
  }
  datos.rango_precio = rangoPrecio;
  datos.por_hora = porHora ? true : null;
  // Cobrando por hora no hay «por mayor»: el segundo precio es de lo que se vende por unidad.
  const segundo = b.conSegundo && !porHora ? b.precioSegundo?.valor ?? null : null;
  const k = segundo != null ? partir(b.deCada10Segundo) : { numero: null, rango: null };
  datos.rango_de_cada_10_segundo = k.rango;
  return {
    campos: { precio, precio_segundo: segundo, segundo_precio_es: segundo != null ? b.segundoEs : null, de_cada_10_segundo: k.numero },
    estado,
    datos,
  };
}

function camposCosto(b: Borrador): { campos: Cuerpo; estado: DatoOral["estado"] | null; datos: Cuerpo; aviso: string | null } {
  if (b.porPartes) {
    const partes = b.partes.map((p) => ({ nombre: p.nombre.trim(), valor: p.valor ?? null, desde: p.desde ?? null, hasta: p.hasta ?? null, estado: p.estado }));
    const aviso = partes.some((p) => !p.nombre) ? "Ponle nombre a cada parte del costo, o quítala." : null;
    // Con partes, el costo por unidad lo calcula 8X al guardar: no se manda suelto.
    return { campos: partes.length ? { componentes_costo: partes } : { componentes_costo: [], costo_variable_unitario: null }, estado: null, datos: { rango_costo: null }, aviso };
  }
  const c = partir(b.costo);
  return { campos: { componentes_costo: [], costo_variable_unitario: c.numero }, estado: b.costo?.estado ?? null, datos: { rango_costo: c.rango }, aviso: null };
}

function camposUnidades(b: Borrador, def: DefModelo, totales: Totales): { campos: Cuerpo; estado: DatoOral["estado"] | null; datos: Cuerpo; aviso: string | null } {
  const vacio = { unidades_mes: null, unidades_mes_desde: null, unidades_mes_hasta: null, participacion_de_10: null };
  if (b.modoVolumen === "de_cada_10") {
    const p = partir(b.deCada10);
    return { campos: { ...vacio, participacion_de_10: p.numero }, estado: b.deCada10?.estado ?? null, datos: { dicho: null, por: null, rango_de_cada_10: p.rango }, aviso: null };
  }
  const r = rangoDe(b.volumen);
  let mes: Rango | null = null;
  let aviso: string | null = null;
  if (r) {
    if (def.volumenSeDicePor === "mes") mes = r;
    else if (def.volumenSeDicePor === "trimestre") mes = escalarRango(r, 1 / 3);
    else {
      const dias = rangoDe(totales.dias_al_mes);
      if (dias) mes = multiplicarRangos(r, dias);
      else aviso = "Para llevarlo a un mes falta saber cuántos días abriste el mes pasado (la pregunta de arriba).";
    }
  }
  const campos: Cuerpo = { ...vacio };
  if (mes) {
    if (esExacto(mes)) campos.unidades_mes = redondea(mes.bajo);
    else {
      campos.unidades_mes_desde = redondea(mes.bajo);
      campos.unidades_mes_hasta = redondea(mes.alto);
    }
  }
  const datos: Cuerpo = {
    ...(def.volumenSeDicePor !== "mes" && r ? { dicho: esExacto(r) ? { valor: r.bajo } : { desde: r.bajo, hasta: r.alto }, por: def.volumenSeDicePor } : { dicho: null, por: null }),
    rango_de_cada_10: null,
  };
  return { campos, estado: b.volumen?.estado ?? null, datos, aviso };
}

/**
 * Lo que se manda: solo lo que cambió, grupo por grupo (un grupo que la consultora comprobó no se manda: la ruta lo
 * rechazaría aunque no haya cambiado). `bloqueados` son esos grupos.
 */
function cuerpoDe(b: Borrador, base: Borrador, l: LineaProducto | null, def: DefModelo, totales: Totales, bloqueados: Set<Grupo>): { cuerpo: Cuerpo; aviso: string | null } {
  if (!b.nombre.trim()) return { cuerpo: {}, aviso: "Ponle nombre: es lo único que no puede quedar en blanco." };
  if (b.grupo.trim().length > 60) return { cuerpo: {}, aviso: "El nombre del grupo es muy largo: usa una o dos palabras." };
  const cuerpo: Cuerpo = {};
  const estados: Cuerpo = {};
  if (!l || b.nombre.trim() !== base.nombre.trim()) cuerpo.nombre = b.nombre.trim();
  if (!l || b.grupo.trim() !== base.grupo.trim()) cuerpo.grupo = b.grupo.trim() || null;
  if (b.modelo && (!l || b.modelo !== l.modelo)) cuerpo.modelo = b.modelo;
  if (!l) cuerpo.tipo = def.tipoLinea;
  const igual = (a: unknown, c: unknown) => JSON.stringify(a) === JSON.stringify(c);
  let datosModelo: Cuerpo | null = null;
  const previoDm = (l?.datos_modelo ?? {}) as Cuerpo;
  const conservar = Object.fromEntries(CLAVES_DATOS_MODELO.filter((k) => previoDm[k] !== undefined).map((k) => [k, previoDm[k]]));

  if (!bloqueados.has("precio")) {
    const admite = !!def.preguntaPrecioPorHora;
    const nuevo = camposPrecio(b, admite);
    if (!l || !igual(nuevo, camposPrecio(base, admite))) {
      Object.assign(cuerpo, nuevo.campos);
      if (nuevo.estado) estados.precio = nuevo.estado;
      datosModelo = { ...conservar, ...(datosModelo ?? {}), ...nuevo.datos };
    }
  }
  if (!bloqueados.has("costo")) {
    const nuevo = camposCosto(b);
    if (nuevo.aviso) return { cuerpo: {}, aviso: nuevo.aviso };
    if (!l || !igual(nuevo, camposCosto(base))) {
      Object.assign(cuerpo, nuevo.campos);
      if (nuevo.estado) estados.costo = nuevo.estado;
      datosModelo = { ...conservar, ...(datosModelo ?? {}), ...nuevo.datos };
    }
  }
  let aviso: string | null = null;
  if (!bloqueados.has("unidades")) {
    const nuevo = camposUnidades(b, def, totales);
    aviso = nuevo.aviso;
    if (!nuevo.aviso && (!l || !igual(nuevo, camposUnidades(base, def, totales)))) {
      Object.assign(cuerpo, nuevo.campos);
      if (nuevo.estado) estados.unidades = nuevo.estado;
      datosModelo = { ...conservar, ...(datosModelo ?? {}), ...nuevo.datos };
    }
  }
  if (def.tipoLinea === "servicio" && (l?.tipo ?? def.tipoLinea) === "servicio") {
    const horas = b.horas?.valor ?? null;
    if (!l || horas !== (base.horas?.valor ?? null)) cuerpo.horas_por_unidad = horas;
  }
  if (datosModelo) {
    const limpio = Object.fromEntries(Object.entries(datosModelo).filter(([, v]) => v !== undefined));
    // Al crear, un datos_modelo todo vacío no dice nada: no viaja.
    if (l || Object.values(limpio).some((v) => v !== null)) cuerpo.datos_modelo = limpio;
  }
  if (Object.keys(estados).length) cuerpo.estados = estados;
  // Al crear, lo vacío no viaja: una línea nueva solo con su nombre es válida.
  if (!l) for (const [k, v] of Object.entries(cuerpo)) if (v === null || (Array.isArray(v) && v.length === 0)) delete cuerpo[k];
  return { cuerpo, aviso };
}

// ─── Para leer cada fila ─────────────────────────────────────────────────────────────────────────

function textoPrecio(l: LineaProducto, fmt: (n: number) => string): string | null {
  const dm = lecturaDatosModelo(l.datos_modelo);
  const base = l.precio != null ? fmt(l.precio) : dm.rangoPrecio ? textoRango(dm.rangoPrecio, fmt) : null;
  if (!base) return l.estados?.precio === "no_lo_se" ? "No lo sabe" : null;
  if (cobraPorHora(l)) return `${base} por hora${l.horas_por_unidad != null ? ` · ${cantidad(l.horas_por_unidad)} h por caso` : " · faltan las horas de un caso"}`;
  const k = l.de_cada_10_segundo != null ? cantidad(l.de_cada_10_segundo) : dm.rangoDeCada10Segundo ? `${cantidad(dm.rangoDeCada10Segundo.bajo)} a ${cantidad(dm.rangoDeCada10Segundo.alto)}` : null;
  const segundo = l.precio_segundo != null ? ` · ${l.segundo_precio_es === "minimo" ? "mínimo" : "por mayor"} ${fmt(l.precio_segundo)}${k ? ` (${k} de cada 10)` : ""}` : "";
  return `${base}${segundo}`;
}

function textoCosto(l: LineaProducto, fmt: (n: number) => string): string | null {
  const partes = l.componentes_costo ?? [];
  if (partes.length) {
    const s = sumaDePartes(partes);
    if (s.total) return textoRango(s.total, fmt);
    if (s.conocido) return `al menos ${textoRango(s.conocido, fmt)}; falta: ${s.faltan.join(", ")}`;
    return null;
  }
  if (l.costo_variable_unitario != null) return fmt(l.costo_variable_unitario);
  const rango = lecturaDatosModelo(l.datos_modelo).rangoCosto;
  if (rango) return textoRango(rango, fmt);
  return l.estados?.costo === "no_lo_se" ? "No lo sabe" : null;
}

/** «De cada 10»: el número, o el rango dicho («3 a 4»). null si no se dijo. */
function deCada10De(l: LineaProducto): Rango | null {
  if (l.participacion_de_10 != null) return { bajo: l.participacion_de_10, alto: l.participacion_de_10 };
  return lecturaDatosModelo(l.datos_modelo).rangoDeCada10;
}

function textoVolumen(l: LineaProducto): string | null {
  if (l.unidades_mes != null) return cantidad(l.unidades_mes);
  if (l.unidades_mes_desde != null && l.unidades_mes_hasta != null) return `entre ${cantidad(l.unidades_mes_desde)} y ${cantidad(l.unidades_mes_hasta)}`;
  const k = deCada10De(l);
  if (k) return `${esExacto(k) ? cantidad(k.bajo) : `${cantidad(k.bajo)} a ${cantidad(k.alto)}`} de cada 10 ${l.grupo?.trim() || "de lo que vende"}`;
  if (l.unidades_periodo != null) return `${cantidad(l.unidades_periodo)} en el periodo anotado`;
  return l.estados?.unidades === "no_lo_se" ? "No lo sabe" : null;
}

/**
 * Los «de cada 10» de cada grupo, sumados (con rangos, del más bajo al más alto). Se avisa solo si 10 queda FUERA de
 * lo que pueden sumar: «3 a 4» y «6» pueden dar 10, y eso no es un error. No se bloquea.
 */
function sumasDeCada10(lineas: LineaProducto[]): { grupo: string; suma: Rango; lineas: number; enElGrupo: number }[] {
  const porGrupo = new Map<string, { grupo: string; suma: Rango; lineas: number; enElGrupo: number }>();
  const enGrupo = new Map<string, number>();
  for (const l of lineas) {
    const k = (l.grupo?.trim() ?? "").toLowerCase();
    enGrupo.set(k, (enGrupo.get(k) ?? 0) + 1);
  }
  for (const l of lineas) {
    const parte = deCada10De(l);
    if (!parte) continue;
    const g = l.grupo?.trim() ?? "";
    const k = g.toLowerCase();
    const x = porGrupo.get(k) ?? { grupo: g, suma: { bajo: 0, alto: 0 }, lineas: 0, enElGrupo: enGrupo.get(k) ?? 0 };
    x.suma = { bajo: x.suma.bajo + parte.bajo, alto: x.suma.alto + parte.alto };
    x.lineas += 1;
    porGrupo.set(k, x);
  }
  return [...porGrupo.values()];
}

function totalDelGrupo(totales: Totales, grupo: string): DatoOral | null {
  const k = grupo.trim().toLowerCase();
  for (const [nombre, dato] of Object.entries(totales.grupos ?? {})) if (nombre.trim().toLowerCase() === k && dato) return dato;
  return null;
}

// ─── Los totales que pide «de cada 10» y el día normal ──────────────────────────────────────────

function TotalDeGrupo({ companyId, modo, grupo, totales, editable }: { companyId: string; modo: Modo; grupo: string; totales: Totales; editable: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  // El episodio, no «un mes normal». Con grupo, sin artículo que dependa de su género («casacas», «pantalones»).
  const pregunta = grupo.trim() ? `El mes pasado, ¿cuánto vendiste de ${grupo.trim().toLowerCase()}, en unidades?` : "El mes pasado, ¿cuántos productos vendiste en total?";
  const guardar = async (d: DatoOral | null) => {
    setEstado(null);
    try {
      await pedir(`/api/companies/${companyId}/negocio`, { method: "PATCH", json: { bloque: "totales", datos: { grupos: { [grupo.trim()]: d } } } });
      setEstado({ tipo: "ok", texto: "Guardado" });
      router.refresh();
    } catch (e) {
      setEstado({ tipo: "error", texto: mensajeDe(e) });
    }
  };
  return (
    <div>
      <CampoDato etiqueta={pregunta} valor={totalDelGrupo(totales, grupo)} alGuardar={guardar} modo={modo} deshabilitado={!editable} />
      <AvisoGuardado estado={estado} />
    </div>
  );
}

function DiasAlMes({ companyId, modo, totales, editable }: { companyId: string; modo: Modo; totales: Totales; editable: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const guardar = async (d: DatoOral | null) => {
    setEstado(null);
    try {
      await pedir(`/api/companies/${companyId}/negocio`, { method: "PATCH", json: { bloque: "totales", datos: { dias_al_mes: d } } });
      setEstado({ tipo: "ok", texto: "Guardado" });
      router.refresh();
    } catch (e) {
      setEstado({ tipo: "error", texto: mensajeDe(e) });
    }
  };
  return (
    <div>
      <CampoDato etiqueta="El mes pasado, ¿cuántos días abriste?" valor={totales.dias_al_mes ?? null} alGuardar={guardar} modo={modo} max={31} deshabilitado={!editable} />
      <AvisoGuardado estado={estado} />
    </div>
  );
}

// ─── Una parte del costo ─────────────────────────────────────────────────────────────────────────

function ParteCosto({ parte, i, modo, fmt, deshabilitado, placeholder, alCambiar, alQuitar }: {
  parte: ComponenteCosto;
  i: number;
  modo: Modo;
  fmt: (n: number) => string;
  deshabilitado: boolean;
  placeholder: string;
  alCambiar: (p: ComponenteCosto) => void;
  alQuitar: () => void;
}) {
  return (
    <li className="flex flex-col gap-2" style={{ borderTop: "1px solid var(--linea)", paddingTop: 12 }}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={`Nombre de la parte ${i + 1}`}
          className="campo"
          style={{ flex: "1 1 180px", minWidth: 0 }}
          value={parte.nombre}
          maxLength={60}
          placeholder={i === 0 ? placeholder : "Otra parte"}
          disabled={deshabilitado}
          onChange={(e) => alCambiar({ ...parte, nombre: e.target.value })}
        />
        {!deshabilitado && (
          <button type="button" className="boton boton--secundario" style={{ flex: "none" }} onClick={alQuitar} aria-label={`Quitar la parte ${parte.nombre || i + 1}`}>
            Quitar
          </button>
        )}
      </div>
      <CampoDato
        etiqueta={parte.nombre.trim() ? `¿Cuánto te cuesta «${parte.nombre.trim()}» por cada uno?` : "¿Cuánto cuesta esta parte por cada uno?"}
        valor={parte.valor != null || parte.desde != null || parte.estado === "no_lo_se" ? parte : null}
        alGuardar={(d) => alCambiar({ nombre: parte.nombre, valor: d?.valor ?? null, desde: d?.desde ?? null, hasta: d?.hasta ?? null, estado: d?.estado ?? "estimado" })}
        modo={modo}
        formato={fmt}
        deshabilitado={deshabilitado}
      />
    </li>
  );
}

// ─── La tarjeta que se edita ─────────────────────────────────────────────────────────────────────

type PropsEditor = {
  companyId: string;
  modo: Modo;
  linea: LineaProducto | null;
  /** Las partes del producto anterior, para copiar sus nombres (o sus nombres con sus montos). */
  partesAnteriores: ComponenteCosto[];
  modelos: ModeloNegocio[];
  totales: Totales;
  config: ConfigEmpresa;
  usuarioId: string | null;
  alCerrar: () => void;
  /** Solo la tarjeta nueva: el borrador que quedó de antes (un guardado que falló), para no perder lo escrito. */
  borradorPrevio?: Borrador | null;
  /** Solo la tarjeta nueva: cada cambio del borrador, para que la tabla lo guarde y sepa si hay algo sin nombre. */
  alCambiarBorrador?: (b: Borrador, sucio: boolean) => void;
  /** Solo la tarjeta nueva: el producto ya quedó creado (al salir de la tarjeta). */
  alCreada?: (id: string) => void;
  /** El resultado del último guardado, para la fila: el texto del error, o null si se guardó. */
  alResultado?: (id: string, error: string | null) => void;
};

/** Lo comprobado con un documento era de OTRO producto: al copiarlo, pasa a «anotado». Lo demás, como estaba. */
const estadoCopiado = (e: DatoOral["estado"]): DatoOral["estado"] => (e === "comprobado" ? "contado" : e);

function EditorLinea({ companyId, modo, linea, partesAnteriores, modelos, totales, config, usuarioId, alCerrar, borradorPrevio, alCambiarBorrador, alCreada, alResultado }: PropsEditor) {
  const router = useRouter();
  const [vacio] = useState<Borrador>(() => borradorDe(linea, modelos, totales));
  const [inicial] = useState<Borrador>(() => (!linea && borradorPrevio ? borradorPrevio : vacio));
  const [b, setB] = useState<Borrador>(inicial);
  // Lo último guardado, para mandar solo lo que cambió. En una tarjeta nueva, lo vacío.
  const base = useRef<Borrador>(vacio);
  // El borrador también vive en una referencia: al salir de una caja, la caja guarda su dato y enseguida la tarjeta
  // se guarda; las dos cosas pasan en el mismo evento y el estado de React todavía no se actualizó.
  const vivo = useRef<Borrador>(inicial);
  // La línea que se creó desde esta tarjeta nueva: lo que sigue se guarda como cambio de ESA línea, nunca otra nueva.
  const creadaRef = useRef<LineaProducto | null>(null);
  const [creada, setCreada] = useState<LineaProducto | null>(null);
  // Un guardado a la vez: el de salir de la tarjeta y el del botón pueden llegar juntos.
  const enCurso = useRef(false);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);

  const actual = linea ?? creada;
  const sucio = (x: Borrador) => JSON.stringify(x) !== JSON.stringify(base.current);
  const cambiar = (f: (x: Borrador) => Borrador) => {
    vivo.current = f(vivo.current);
    setB(vivo.current);
    // Solo mientras sea nueva de verdad: una vez creada, lo que falte se guarda como cambio de esa línea.
    if (!linea && !creadaRef.current) alCambiarBorrador?.(vivo.current, sucio(vivo.current));
  };

  const def = defDe(b.modelo, actual?.tipo, modelos);
  const fmt = dinero(config);
  const est = linea?.estados ?? {};
  const bloqueados = new Set<Grupo>();
  if (modo === "dueno") {
    if (est.precio === "comprobado") bloqueados.add("precio");
    if (est.costo === "comprobado" || (linea?.componentes_costo ?? []).some((p) => p.estado === "comprobado")) bloqueados.add("costo");
    if (est.unidades === "comprobado") bloqueados.add("unidades");
  }
  const puedeQuitar = !!actual && (modo === "consultora" || (!!usuarioId && actual.creada_por === usuarioId));
  const unidad = def.unidad;
  const cobraPorHora = !!def.preguntaPrecioPorHora && b.porHora && !b.porTicket;

  const guardar = async (cerrar: boolean) => {
    if (enCurso.current) return;
    const destino = linea ?? creadaRef.current;
    const { cuerpo, aviso } = cuerpoDe(vivo.current, base.current, destino, def, totales, bloqueados);
    if (aviso && !Object.keys(cuerpo).length) {
      setEstado({ tipo: "error", texto: aviso });
      if (destino) alResultado?.(destino.id, aviso);
      return;
    }
    const hayCambios = Object.keys(cuerpo).some((k) => k !== "tipo");
    if (!hayCambios) {
      if (aviso) setEstado({ tipo: "error", texto: aviso });
      if (cerrar && !aviso) alCerrar();
      return;
    }
    enCurso.current = true;
    setGuardando(true);
    setEstado(null);
    try {
      const r = await pedir<{ linea?: LineaProducto }>(`/api/companies/${companyId}/producto${destino ? `/${destino.id}` : ""}`, { method: destino ? "PATCH" : "POST", json: cuerpo });
      base.current = vivo.current;
      const id = destino?.id ?? r?.linea?.id ?? null;
      if (!destino && r?.linea?.id) {
        creadaRef.current = r.linea;
        setCreada(r.linea);
        alCreada?.(r.linea.id);
      }
      setEstado(aviso ? { tipo: "error", texto: `Guardado lo demás. ${aviso}` } : { tipo: "ok", texto: "Guardado" });
      if (id) alResultado?.(id, aviso ? `Guardado lo demás. ${aviso}` : null);
      router.refresh();
      if (cerrar) alCerrar();
    } catch (e) {
      const texto = mensajeDe(e);
      setEstado({ tipo: "error", texto });
      // Si la tarjeta ya se cerró (se abrió otra fila mientras guardaba), el error queda en la fila.
      alResultado?.(destino?.id ?? "nueva", texto);
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  };

  const quitar = async () => {
    if (!actual) return;
    setGuardando(true);
    try {
      await pedir(`/api/companies/${companyId}/producto/${actual.id}`, { method: "DELETE" });
      router.refresh();
      alCerrar();
    } catch (e) {
      setEstado({ tipo: "error", texto: mensajeDe(e, "No pudimos quitarlo. Inténtalo de nuevo.") });
      setGuardando(false);
    }
  };

  /** Copia las partes del producto anterior que todavía no estén: solo los nombres, o con sus montos y su estado. */
  const copiarPartes = (conMontos: boolean) =>
    cambiar((x) => {
      const ya = new Set(x.partes.map((p) => p.nombre.trim().toLowerCase()));
      const nuevas = partesAnteriores
        .filter((p) => !ya.has(p.nombre.trim().toLowerCase()))
        .map((p): ComponenteCosto =>
          conMontos
            ? { nombre: p.nombre, valor: p.valor ?? null, desde: p.desde ?? null, hasta: p.hasta ?? null, estado: estadoCopiado(p.estado) }
            : { nombre: p.nombre, valor: null, desde: null, hasta: null, estado: "estimado" }
        );
      return { ...x, porPartes: true, partes: [...x.partes, ...nuevas] };
    });
  const anterioresConMonto = partesAnteriores.some((p) => rangoDe(p) != null);

  const suma = sumaDePartes(b.partes);
  const grupoNombre = b.grupo.trim();

  return (
    <div
      className="pozo pozo--chico flex flex-col gap-5"
      onBlur={(e) => {
        // Se guarda al salir de la tarjeta, no por tecla ni al pasar de una caja a otra dentro de ella. La nueva
        // también, si ya tiene nombre y algo escrito: así no se pierde al abrir otra fila.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (linea || creadaRef.current || (vivo.current.nombre.trim() && sucio(vivo.current))) void guardar(false);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">{def.tipoLinea === "servicio" ? "Servicio" : "Producto"}</span>
          <input aria-label="Nombre del producto o servicio" className="campo" value={b.nombre} maxLength={160} onChange={(e) => cambiar((x) => ({ ...x, nombre: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Grupo (si vendes varias clases)</span>
          <input aria-label="Grupo del producto" className="campo" value={b.grupo} maxLength={60} placeholder="Una o dos palabras" onChange={(e) => cambiar((x) => ({ ...x, grupo: e.target.value }))} />
        </label>
        {modelos.length > 1 && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="t-etiqueta">Con esto, tu negocio…</span>
            <select aria-label="Cómo gana dinero con esto" className="campo" value={b.modelo ?? modelos[0]} onChange={(e) => cambiar((x) => ({ ...x, modelo: e.target.value as ModeloNegocio }))}>
              {modelos.map((m) => (
                <option key={m} value={m}>{MODELO[m].paraDueno}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* 1 · El precio */}
      <fieldset className="flex flex-col gap-3" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-seccion">1 · El precio</legend>
        {def.clave === "intermedia_comision" && !bloqueados.has("precio") && (
          <label className="t-dato flex items-center gap-2" style={{ minHeight: 44 }}>
            <input type="checkbox" checked={b.porTicket} onChange={(e) => cambiar((x) => ({ ...x, porTicket: e.target.checked }))} />
            Lo sé como el monto de la operación y el porcentaje que cobro
          </label>
        )}
        {def.preguntaPrecioPorHora && !b.porTicket && !bloqueados.has("precio") && (
          <label className="t-dato flex items-center gap-2" style={{ minHeight: 44 }}>
            <input type="checkbox" checked={b.porHora} onChange={(e) => cambiar((x) => ({ ...x, porHora: e.target.checked }))} />
            Cobro por hora
          </label>
        )}
        {b.porTicket ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="t-dato">Tu última operación, ¿de cuánto fue?</span>
              <input aria-label="Monto de tu última operación" className="campo" inputMode="decimal" value={b.ticket} onChange={(e) => cambiar((x) => ({ ...x, ticket: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="t-dato">En esa operación, ¿qué porcentaje cobraste?</span>
              <input aria-label="Porcentaje de comisión" className="campo" inputMode="decimal" value={b.comision} onChange={(e) => cambiar((x) => ({ ...x, comision: e.target.value }))} />
            </label>
          </div>
        ) : (
          <CampoDato
            etiqueta={cobraPorHora ? (def.preguntaPrecioPorHora as string) : def.preguntaPrecio}
            valor={b.precio}
            alGuardar={(d) => cambiar((x) => ({ ...x, precio: d }))}
            modo={modo}
            formato={fmt}
            ayuda={cobraPorHora ? `Abajo, en «lo que te cuesta», dinos cuántas horas te llevó tu ${unidad.singular} más reciente: con eso sacamos cuánto cobras por uno.` : null}
            deshabilitado={bloqueados.has("precio")}
          />
        )}
        {def.preguntaSegundoPrecio && !cobraPorHora && (
          <>
            <label className="t-dato flex items-center gap-2" style={{ minHeight: 44 }}>
              <input type="checkbox" checked={b.conSegundo} disabled={bloqueados.has("precio")} onChange={(e) => cambiar((x) => ({ ...x, conSegundo: e.target.checked }))} />
              {def.preguntaSegundoPrecio}
            </label>
            {b.conSegundo && (
              <div className="pozo pozo--chico flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="t-dato">Ese otro precio es…</span>
                  <select aria-label="Qué es el otro precio" className="campo" value={b.segundoEs} disabled={bloqueados.has("precio")} onChange={(e) => cambiar((x) => ({ ...x, segundoEs: e.target.value as Borrador["segundoEs"] }))}>
                    <option value="por_mayor">Por mayor</option>
                    <option value="minimo">El mínimo al que lo dejo</option>
                  </select>
                </label>
                <CampoDato etiqueta={b.segundoEs === "minimo" ? "¿Cuál es el precio mínimo?" : "La última vez que lo vendiste por mayor, ¿a cuánto fue?"} valor={b.precioSegundo} alGuardar={(d) => cambiar((x) => ({ ...x, precioSegundo: d }))} modo={modo} formato={fmt} soloExacto sinNoLoSe deshabilitado={bloqueados.has("precio")} />
                <CampoDato
                  etiqueta={`De tus últimas 10 ventas de este producto, ¿cuántas fueron ${b.segundoEs === "minimo" ? "al precio mínimo" : "por mayor"}?`}
                  valor={b.deCada10Segundo}
                  alGuardar={(d) => cambiar((x) => ({ ...x, deCada10Segundo: d }))}
                  modo={modo}
                  max={10}
                  deshabilitado={bloqueados.has("precio")}
                />
              </div>
            )}
          </>
        )}
      </fieldset>

      {/* 2 · Lo que cuesta */}
      <fieldset className="flex flex-col gap-3" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-seccion">2 · Lo que te cuesta</legend>
        <p className="t-dato" style={{ color: "var(--grafito)" }}>{b.porPartes ? def.preguntaCosto : `¿Cuánto te cuesta cada ${unidad.singular}, en total?`}</p>
        {!bloqueados.has("costo") && (
          <label className="t-dato flex items-center gap-2" style={{ minHeight: 44 }}>
            <input type="checkbox" checked={!b.porPartes} onChange={(e) => cambiar((x) => ({ ...x, porPartes: !e.target.checked }))} />
            Prefiero decir el total, sin partes
          </label>
        )}
        {b.porPartes ? (
          <>
            {b.partes.length > 0 && (
              <ul className="flex flex-col gap-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {b.partes.map((p, i) => (
                  <ParteCosto
                    key={i}
                    parte={p}
                    i={i}
                    modo={modo}
                    fmt={fmt}
                    deshabilitado={bloqueados.has("costo")}
                    placeholder={def.placeholderPartes}
                    alCambiar={(nueva) => cambiar((x) => ({ ...x, partes: x.partes.map((q, j) => (j === i ? nueva : q)) }))}
                    alQuitar={() => cambiar((x) => ({ ...x, partes: x.partes.filter((_, j) => j !== i) }))}
                  />
                ))}
              </ul>
            )}
            {!bloqueados.has("costo") && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="boton boton--secundario" onClick={() => cambiar((x) => ({ ...x, partes: [...x.partes, { nombre: "", valor: null, desde: null, hasta: null, estado: "estimado" }] }))}>
                  Agregar una parte
                </button>
                {partesAnteriores.length > 0 && (
                  <button type="button" className="boton boton--secundario" onClick={() => copiarPartes(false)}>
                    Copiar las partes del producto anterior
                  </button>
                )}
                {anterioresConMonto && (
                  <button type="button" className="boton boton--secundario" onClick={() => copiarPartes(true)}>
                    Copiar las partes con sus montos
                  </button>
                )}
              </div>
            )}
            {b.partes.length > 0 && (
              <p className="t-dato" style={{ color: "var(--grafito)" }}>
                {suma.total ? (
                  <>Te cuesta <b style={{ color: "var(--tinta)" }}>{textoRango(suma.total, fmt)}</b> cada {unidad.singular}.</>
                ) : suma.conocido ? (
                  <>Te cuesta al menos <b style={{ color: "var(--tinta)" }}>{textoRango(suma.conocido, fmt)}</b>. Falta: {suma.faltan.join(", ")}.</>
                ) : (
                  <>Falta el costo de: {suma.faltan.join(", ")}.</>
                )}
              </p>
            )}
          </>
        ) : (
          <CampoDato etiqueta={`¿Cuánto te cuesta cada ${unidad.singular}?`} conEtiqueta={false} valor={b.costo} alGuardar={(d) => cambiar((x) => ({ ...x, costo: d }))} modo={modo} formato={fmt} deshabilitado={bloqueados.has("costo")} />
        )}
        {def.tipoLinea === "servicio" && (actual?.tipo ?? "servicio") === "servicio" && (
          <CampoDato
            etiqueta={`¿Cuántas horas te llevó tu ${unidad.singular} más reciente?`}
            valor={b.horas}
            alGuardar={(d) => cambiar((x) => ({ ...x, horas: d }))}
            modo={modo}
            soloExacto
            sinNoLoSe
            ayuda={cobraPorHora ? `Como cobras por hora, sin este número no sabemos cuánto cobras por un ${unidad.singular}.` : null}
            deshabilitado={cobraPorHora && bloqueados.has("precio")}
          />
        )}
      </fieldset>

      {/* 3 · Cuánto vende */}
      <fieldset className="flex flex-col gap-3" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-seccion">3 · Cuánto vendes</legend>
        {b.modoVolumen === "dicho" ? (
          <>
            {def.volumenSeDicePor === "dia" && <DiasAlMes companyId={companyId} modo={modo} totales={totales} editable={!bloqueados.has("unidades")} />}
            <CampoDato
              etiqueta={def.preguntaVolumen}
              valor={b.volumen}
              alGuardar={(d) => cambiar((x) => ({ ...x, volumen: d }))}
              modo={modo}
              formato={(n) => `${cantidad(n)} ${n === 1 ? unidad.singular : unidad.plural}`}
              ayuda={def.volumenSeDicePor === "trimestre" ? "Lo dividimos entre tres para tenerlo por mes." : def.volumenSeDicePor === "dia" ? "Lo multiplicamos por los días que abres para tenerlo por mes." : null}
              deshabilitado={bloqueados.has("unidades")}
            />
            {!bloqueados.has("unidades") && (
              <button type="button" className="boton boton--secundario" style={{ alignSelf: "flex-start" }} onClick={() => cambiar((x) => ({ ...x, modoVolumen: "de_cada_10" }))}>
                No sé cuántos vendo de cada uno
              </button>
            )}
          </>
        ) : (
          <>
            {!grupoNombre && <p className="t-dato" style={{ color: "var(--grafito)" }}>Si vendes varias clases de productos, escribe arriba el grupo de este: así se compara con los de su clase.</p>}
            <TotalDeGrupo companyId={companyId} modo={modo} grupo={grupoNombre} totales={totales} editable={!bloqueados.has("unidades")} />
            <CampoDato
              etiqueta={`De tus últimas 10 ventas${grupoNombre ? ` de ${grupoNombre.toLowerCase()}` : ""}, ¿cuántas fueron de ${b.nombre.trim() ? `«${b.nombre.trim()}»` : "este"}?`}
              valor={b.deCada10}
              alGuardar={(d) => cambiar((x) => ({ ...x, deCada10: d }))}
              modo={modo}
              max={10}
              deshabilitado={bloqueados.has("unidades")}
            />
            {!bloqueados.has("unidades") && (
              <button type="button" className="boton boton--secundario" style={{ alignSelf: "flex-start" }} onClick={() => cambiar((x) => ({ ...x, modoVolumen: "dicho" }))}>
                Mejor digo cuántos vendo
              </button>
            )}
          </>
        )}
        {linea?.unidades_periodo != null && (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>
            También hay anotado {cantidad(linea.unidades_periodo)} {unidad.plural} en un periodo{linea.periodo ? ` (${linea.periodo})` : ""}.
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="boton" disabled={guardando} onClick={() => void guardar(true)}>
          {guardando ? "Guardando…" : actual ? "Guardar y cerrar" : "Guardar"}
        </button>
        <button type="button" className="boton boton--secundario" disabled={guardando} onClick={alCerrar}>
          {linea ? "Cerrar sin guardar" : creada ? "Cerrar" : "Cancelar"}
        </button>
        {puedeQuitar && !confirmarQuitar && (
          <button type="button" className="boton boton--peligro" disabled={guardando} onClick={() => setConfirmarQuitar(true)}>
            Quitar
          </button>
        )}
      </div>
      {confirmarQuitar && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <span className="t-dato">¿Quitar «{actual?.nombre}»? No se puede deshacer.</span>
          <button type="button" className="boton boton--peligro" disabled={guardando} onClick={() => void quitar()}>Sí, quitarlo</button>
          <button type="button" className="boton boton--secundario" onClick={() => setConfirmarQuitar(false)}>No</button>
        </div>
      )}
      {linea && !puedeQuitar && modo === "dueno" && <p className="t-dato" style={{ color: "var(--grafito)" }}>Este lo anotó tu consultora: si sobra, díselo y ella lo quita.</p>}
      <AvisoGuardado estado={estado} />
    </div>
  );
}

// ─── Una fila (tarjeta en el celular, fila de tabla en el escritorio) ───────────────────────────

// La última columna (el botón) va con ancho fijo: con «auto», el encabezado (vacío ahí) y cada fila (con botón) la
// medían distinto y los títulos quedaban corridos sobre sus columnas.
const COLUMNAS_FILA = "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_96px] lg:gap-3 lg:items-start";

function Celda({ titulo, texto, estado }: { titulo: string; texto: string | null; estado?: DatoOral["estado"] | null }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 lg:block">
      <span className="t-rotulo lg:hidden" style={{ minWidth: 120 }}>{titulo}</span>
      <span className="t-dato">{texto ?? <SinDato />}</span>
      {texto && estado && (
        <span className="lg:block lg:mt-1">
          <ChipEstado estado={estado} />
        </span>
      )}
    </div>
  );
}

function FilaProducto({ l, modo, modelos, config, deja, abierta, editable, error, alAbrir }: { l: LineaProducto; modo: Modo; modelos: ModeloNegocio[]; config: ConfigEmpresa; deja: string | undefined; abierta: boolean; editable: boolean; error?: string | null; alAbrir: () => void }) {
  const fmt = dinero(config);
  const est = l.estados ?? {};
  // El modelo de la línea solo se nombra si la empresa tiene dos: con uno solo, sobra.
  const subtitulo = [l.grupo, modelos.length > 1 && l.modelo ? MODELO[l.modelo].paraDueno : null].filter(Boolean).join(" · ");
  return (
    <div style={{ borderTop: "1px solid var(--linea)" }}>
      <div className={`flex flex-col gap-2 ${COLUMNAS_FILA}`} style={{ padding: "14px 0" }}>
        <div>
          <p className="t-seccion">{l.nombre}</p>
          {subtitulo && <p className="apunte">{subtitulo}</p>}
        </div>
        <Celda titulo="Precio" texto={textoPrecio(l, fmt)} estado={est.precio} />
        <Celda titulo="Te cuesta" texto={textoCosto(l, fmt)} estado={est.costo} />
        <Celda titulo="Al mes" texto={textoVolumen(l)} estado={est.unidades} />
        <div className="flex flex-wrap items-baseline gap-2 lg:block">
          <span className="t-rotulo lg:hidden" style={{ minWidth: 120 }}>Te deja</span>
          <span className="t-dato" style={{ color: "var(--grafito)" }}>{deja ?? "—"}</span>
        </div>
        <div>
          <button type="button" className="boton boton--secundario boton--chico" aria-expanded={abierta} onClick={alAbrir}>
            {abierta ? "Cerrar" : !editable ? "Ver" : modo === "consultora" ? "Editar" : "Llenar"}
          </button>
        </div>
      </div>
      {/* El último guardado de esta fila falló y su tarjeta ya se cerró: el error se queda aquí, no se pierde. */}
      {error && !abierta && (
        <p className="t-dato" role="alert" style={{ color: "var(--contradicho)", paddingBottom: 12 }}>
          No se guardó lo último de «{l.nombre}»: {error} Ábrelo y vuelve a guardarlo.
        </p>
      )}
    </div>
  );
}

/** Solo lectura: lo que se ve al abrir una línea cuando no se puede escribir. */
function DetalleLinea({ l, config, modelos }: { l: LineaProducto; config: ConfigEmpresa; modelos: ModeloNegocio[] }) {
  const fmt = dinero(config);
  const def = defDe(l.modelo, l.tipo, modelos);
  const partes = l.componentes_costo ?? [];
  return (
    <div className="pozo pozo--chico">
      {partes.length > 0 ? (
        <>
          <p className="t-etiqueta mb-2">Lo que cuesta cada {def.unidad.singular}, parte por parte</p>
          <ul className="flex flex-col gap-1" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {partes.map((p, i) => (
              <li key={i} className="t-dato flex flex-wrap items-center gap-2">
                <span className="fuerte">{p.nombre}:</span> {mostrarDato(p, fmt)} <ChipEstado estado={p.estado === "no_lo_se" ? null : p.estado} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="t-dato" style={{ color: "var(--grafito)" }}>Sin partes del costo anotadas.</p>
      )}
    </div>
  );
}

// ─── La tabla ────────────────────────────────────────────────────────────────────────────────────

export function TablaProductos({ companyId, modo, lineas, modelos, totales, editable, usuarioId, config, deja }: Props) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [varios, setVarios] = useState(false);
  const [nombres, setNombres] = useState("");
  const [estadoVarios, setEstadoVarios] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [agregando, setAgregando] = useState(false);
  // El error del último guardado de cada fila (y de la tarjeta nueva, «nueva»): vive aquí, no dentro de la tarjeta,
  // para que no se pierda si la tarjeta se cierra mientras guardaba.
  const [errores, setErrores] = useState<Record<string, string>>({});
  // Lo escrito en la tarjeta nueva mientras no exista. La referencia se escribe con cada cambio (sin volver a pintar
  // la tabla por tecla); al cerrar la tarjeta, lo que quedó pasa a `aMedias`: si su guardado falla o se cerró sin
  // guardar, al abrirla vuelve con todo.
  const borradorNuevo = useRef<{ b: Borrador; sucio: boolean } | null>(null);
  const [aMedias, setAMedias] = useState<{ b: Borrador; sucio: boolean } | null>(null);
  const [avisoNueva, setAvisoNueva] = useState<string | null>(null);

  const q = busqueda.trim().toLowerCase();
  const filtradas = q ? lineas.filter((l) => l.nombre.toLowerCase().includes(q) || (l.grupo ?? "").toLowerCase().includes(q)) : lineas;
  const conPaginas = lineas.length > BUSCADOR_DESDE;
  const aMostrar = conPaginas ? filtradas.slice(0, visibles) : filtradas;
  // El aviso de «no suman 10» solo cuando TODO el grupo va en «de cada 10»: a mitad de llenado (unos en unidades,
  // otros en «de cada 10») es lo normal que no sumen, y avisarlo arriba en naranja solo asustaba.
  const sumas = sumasDeCada10(lineas).filter((s) => s.lineas === s.enElGrupo && (s.suma.bajo > 10 + 1e-9 || s.suma.alto < 10 - 1e-9));
  const nuevaAMedias = abierta !== "nueva" && !!aMedias?.sucio;

  /** Las partes del producto anterior que tenga partes (para copiar sus nombres, o sus nombres con sus montos). */
  const partesAntesDe = (id: string | null): ComponenteCosto[] => {
    const hasta = id ? lineas.findIndex((l) => l.id === id) : lineas.length;
    for (let i = hasta - 1; i >= 0; i--) if ((lineas[i]!.componentes_costo ?? []).length) return lineas[i]!.componentes_costo!;
    return [];
  };

  const anotarResultado = (id: string, error: string | null) =>
    setErrores((x) => {
      if (error == null && !(id in x)) return x;
      const y = { ...x };
      if (error == null) delete y[id];
      else y[id] = error;
      return y;
    });

  /**
   * Abrir (o cerrar) una fila o la tarjeta nueva. Con un producto nuevo a medio escribir y SIN nombre no se cambia de
   * tarjeta: no se puede guardar sin nombre y se perdería; se dice qué hacer. Con nombre, la tarjeta ya se guardó al
   * salir de ella (y si no se pudo, su borrador queda para cuando se vuelva a abrir).
   */
  const abrir = (id: string | null) => {
    const pendiente = borradorNuevo.current;
    if (abierta === "nueva" && id !== "nueva" && pendiente?.sucio && !pendiente.b.nombre.trim()) {
      setAvisoNueva("Tienes un producto nuevo sin guardar: ponle nombre y guárdalo, o descártalo con «Cancelar».");
      return;
    }
    setAvisoNueva(null);
    if (abierta === "nueva" && id !== "nueva") setAMedias(pendiente?.sucio ? pendiente : null);
    setAbierta(id);
  };

  const olvidarNueva = () => {
    borradorNuevo.current = null;
    setAMedias(null);
    setAvisoNueva(null);
    anotarResultado("nueva", null);
  };

  const agregarVarios = async () => {
    const lista = [...new Set(nombres.split(/\r?\n/).map((n) => n.trim()).filter(Boolean))];
    if (!lista.length) {
      setEstadoVarios({ tipo: "error", texto: "Escribe un nombre por renglón." });
      return;
    }
    setAgregando(true);
    setEstadoVarios(null);
    const def = defDe(modelos[0] ?? null, "producto", modelos);
    let hechos = 0;
    const fallidos: string[] = [];
    for (const nombre of lista) {
      try {
        await pedir(`/api/companies/${companyId}/producto`, { method: "POST", json: { nombre: nombre.slice(0, 160), tipo: def.tipoLinea, ...(modelos[0] ? { modelo: modelos[0] } : {}) } });
        hechos++;
      } catch (e) {
        fallidos.push(`${nombre}: ${mensajeDe(e)}`);
      }
    }
    setAgregando(false);
    if (fallidos.length) setEstadoVarios({ tipo: "error", texto: `Agregamos ${hechos} de ${lista.length}. No se pudo: ${fallidos.join(" · ")}` });
    else {
      setEstadoVarios({ tipo: "ok", texto: `Agregamos ${hechos}. Ahora abre cada uno y pon su precio, su costo y cuánto vendes.` });
      setNombres("");
      setVarios(false);
    }
    router.refresh();
  };

  return (
    <section className="flex flex-col gap-4">
      {conPaginas && (
        <label className="flex flex-col gap-1 medida">
          <span className="t-etiqueta">Buscar</span>
          <input aria-label="Buscar un producto o servicio" className="campo" type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setVisibles(POR_PAGINA); }} />
        </label>
      )}

      {sumas.length > 0 && (
        <div className="flex flex-col gap-1" role="status">
          {sumas.map((s) => (
            <p key={s.grupo} className="t-dato" style={{ color: "var(--caducado)" }}>
              {s.grupo ? `En «${s.grupo}», los «de cada 10»` : "Los «de cada 10»"} suman {esExacto(s.suma) ? cantidad(s.suma.bajo) : `entre ${cantidad(s.suma.bajo)} y ${cantidad(s.suma.alto)}`} de 10. Juntos deberían sumar 10: revisa esos números.
            </p>
          ))}
        </div>
      )}

      {avisoNueva && (
        <p className="t-dato" role="alert" style={{ color: "var(--contradicho)" }}>
          {avisoNueva}
        </p>
      )}

      <div>
        <div className={`hidden ${COLUMNAS_FILA} t-rotulo`} style={{ paddingBottom: 10 }} aria-hidden="true">
          <span>Producto o servicio</span>
          <span>Precio</span>
          <span>Te cuesta</span>
          <span>Al mes</span>
          <span>Te deja</span>
          <span />
        </div>
        {lineas.length === 0 && <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>{editable ? "Todavía no hay nada anotado. Empieza con lo que más vendes." : "Todavía no hay nada anotado."}</p>}
        {q && filtradas.length === 0 && <p className="t-dato" style={{ color: "var(--grafito)" }}>Ninguno se llama así.</p>}
        {aMostrar.map((l) => (
          <div key={l.id}>
            <FilaProducto l={l} modo={modo} modelos={modelos} config={config} deja={deja[l.id]} abierta={abierta === l.id} editable={editable} error={errores[l.id] ?? null} alAbrir={() => abrir(abierta === l.id ? null : l.id)} />
            {abierta === l.id &&
              (editable ? (
                <EditorLinea companyId={companyId} modo={modo} linea={l} partesAnteriores={partesAntesDe(l.id)} modelos={modelos} totales={totales} config={config} usuarioId={usuarioId} alCerrar={() => abrir(null)} alResultado={anotarResultado} />
              ) : (
                <DetalleLinea l={l} config={config} modelos={modelos} />
              ))}
          </div>
        ))}
        {conPaginas && filtradas.length > visibles && (
          <button type="button" className="boton boton--secundario mt-3" onClick={() => setVisibles((v) => v + POR_PAGINA)}>
            Ver {Math.min(POR_PAGINA, filtradas.length - visibles)} más (van {visibles} de {filtradas.length})
          </button>
        )}
      </div>

      {editable && (
        <div className="flex flex-col gap-3">
          {abierta === "nueva" ? (
            <EditorLinea
              companyId={companyId}
              modo={modo}
              linea={null}
              partesAnteriores={partesAntesDe(null)}
              modelos={modelos}
              totales={totales}
              config={config}
              usuarioId={usuarioId}
              borradorPrevio={aMedias?.b ?? null}
              alCambiarBorrador={(b, sucio) => {
                borradorNuevo.current = { b, sucio };
                if (avisoNueva && b.nombre.trim()) setAvisoNueva(null);
              }}
              // Ya existe: lo que quede se guarda como cambio de esa línea; el borrador «nuevo» ya no hace falta.
              alCreada={() => olvidarNueva()}
              alResultado={anotarResultado}
              alCerrar={() => {
                olvidarNueva();
                setAbierta(null);
              }}
            />
          ) : (
            <>
              {nuevaAMedias && (
                <p className="t-dato" role={errores.nueva ? "alert" : "status"} style={{ color: errores.nueva ? "var(--contradicho)" : "var(--grafito)" }}>
                  {errores.nueva ? `No se guardó el producto nuevo: ${errores.nueva} ` : ""}Tienes un producto a medio llenar: ábrelo para terminarlo; lo que escribiste sigue ahí.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="boton" onClick={() => abrir("nueva")}>{nuevaAMedias ? "Seguir con el producto a medio llenar" : "Agregar un producto o servicio"}</button>
                <button type="button" className="boton boton--secundario" aria-expanded={varios} onClick={() => setVarios((v) => !v)}>Agregar varios de una vez</button>
              </div>
            </>
          )}
          {varios && abierta !== "nueva" && (
            <div className="pozo pozo--chico flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="t-dato fuerte">Escribe un nombre por renglón</span>
                <textarea aria-label="Nombres, uno por renglón" className="campo" rows={6} value={nombres} onChange={(e) => setNombres(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="boton" disabled={agregando} onClick={() => void agregarVarios()}>{agregando ? "Agregando…" : "Agregarlos"}</button>
                <button type="button" className="boton boton--secundario" onClick={() => setVarios(false)}>Cancelar</button>
              </div>
            </div>
          )}
          <AvisoGuardado estado={estadoVarios} />
        </div>
      )}
    </section>
  );
}
