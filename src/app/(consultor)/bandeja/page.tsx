import Link from "next/link";
import { bandeja, type ItemBandeja } from "@/lib/bandeja";
import { requerirConsultor } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ETAPA, VACIO } from "@/lib/textos";
import { Icono, type NombreIcono } from "@/components/base/Icono";
import { Medidor, Barritas, Segmentos, FranjaFases, Pista } from "@/components/tablero/Piezas";
import { GraficoLinea, type PuntoLinea } from "@/components/tablero/GraficoLinea";

export const dynamic = "force-dynamic";

/*
CONTRATO DE DIRECCIÓN — tablero de la imagen de referencia (pedido de Kelin, 13-10-2026)
THESIS: el panel de la consultora como el de la imagen: saludo con lo más urgente, un medidor, cifras con
  barritas, una línea con peine, barras con resto rayado, la cartera en tabla y lo demás del día en lista.
OWN-WORLD: cielo azul suave, tarjetas blancas de 24px con sombra suave, píldora oscura, Manrope en números.
FINISH: cada trazo es un dato real de la base; lo que no hay va rayado y con su nombre, nunca como cero.
Con treinta empresas, esta pantalla es el producto. Capítulo 33.
*/

const SEMANAS = 8;
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** Lunes (UTC) de la semana de una fecha, como AAAA-MM-DD. */
function lunesDe(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))} ${MES[Number(iso.slice(5, 7)) - 1]}`;

const ICONO_TIPO: Record<string, NombreIcono> = {
  fallidos: "aviso", revisar: "ojo", contradicciones: "aviso", vencidos: "reloj", numeros: "numeros",
  linea_base: "plan", medir: "numeros", diagnosticar: "documento", suficiencia: "documento", validar: "ojo",
  espejo: "documento", escalado: "aviso", corte: "reloj", trabada: "reloj", admision: "persona", nueva: "empresas",
};

/** El estado de una empresa, del más grave de sus pendientes de hoy. */
function estadoDe(items: ItemBandeja[], conActividad: boolean): { clase: string; texto: string; orden: number } {
  const peor = Math.min(...items.map((i) => i.urgencia), 9);
  if (peor === 1) return { clase: "alto", texto: "Urgente", orden: 0 };
  if (peor === 2) return { clase: "espera", texto: "Pendiente", orden: 1 };
  if (!conActividad) return { clase: "neutro", texto: "Sin actividad", orden: 2 };
  if (peor === 3) return { clase: "neutro", texto: "Por avanzar", orden: 3 };
  return { clase: "ok", texto: "Al día", orden: 4 };
}

export default async function Bandeja() {
  const ahora = new Date().getTime();
  const desde = new Date(ahora - SEMANAS * 7 * 86_400_000);
  const [u, { items, empresas }, { data: confirmaciones }] = await Promise.all([
    requerirConsultor(),
    bandeja(),
    // Lo comprobado por semana: cuenta las afirmaciones por la fecha en que se confirmaron.
    supabaseAdmin().from("claims").select("validado_at").eq("estado", "confirmado").gte("validado_at", desde.toISOString()).limit(20000),
  ]);

  const primero = items[0] ?? null;
  const resto = items.slice(1);
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const stats = empresas.map((e) => (e.stats ?? {}) as Record<string, unknown>);
  const afirmaciones = stats.reduce((a, s) => a + n(s.afirmaciones), 0);
  const confirmadas = stats.reduce((a, s) => a + n(s.confirmadas), 0);
  const porRevisar = stats.reduce((a, s) => a + n(s.hallazgos_por_revisar), 0);
  const contradichas = stats.reduce((a, s) => a + n(s.contradichas), 0);
  const pctComprobado = afirmaciones > 0 ? Math.round((100 * confirmadas) / afirmaciones) : null;

  const activas = empresas.filter((e) => e.etapa !== "cerrado");
  const enEtapa = (lista: string[]) => activas.filter((e) => lista.includes(e.etapa)).length;
  const conRadio = empresas.filter((e) => e.radiografia);
  const numerosListos = conRadio.reduce((a, e) => a + (e.radiografia?.listos ?? 0), 0);

  // Semanas: las últimas ocho, de lunes a domingo. Una semana sin confirmaciones es un cero contado, no un hueco.
  const porSemana = new Map<string, number>();
  for (let i = SEMANAS - 1; i >= 0; i--) porSemana.set(lunesDe(new Date(ahora - i * 7 * 86_400_000)), 0);
  for (const c of confirmaciones ?? []) {
    const k = lunesDe(new Date(String(c.validado_at)));
    if (porSemana.has(k)) porSemana.set(k, (porSemana.get(k) ?? 0) + 1);
  }
  const serie: PuntoLinea[] = [...porSemana].map(([k, v]) => ({ corto: fechaCorta(k), largo: `Semana del ${fechaCorta(k)}`, valor: v }));
  const estaSemana = serie[serie.length - 1]?.valor ?? 0;

  const itemsDe = new Map<string, ItemBandeja[]>();
  for (const it of items) itemsDe.set(it.company_id, [...(itemsDe.get(it.company_id) ?? []), it]);
  const filas = empresas
    .map((e) => ({ e, propios: itemsDe.get(e.id) ?? [], estado: estadoDe(itemsDe.get(e.id) ?? [], !!e.stats) }))
    .sort((a, b) => a.estado.orden - b.estado.orden);
  const masSabidas = [...empresas].sort((a, b) => n(b.stats?.afirmaciones) - n(a.stats?.afirmaciones)).slice(0, 5);
  const escala = Math.max(...masSabidas.map((e) => n(e.stats?.afirmaciones)), 1);

  const hoy = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" }).format(new Date());
  const nombre = (u.nombre ?? "").trim() || "de nuevo";

  return (
    <div className="tablero">
      <section className="saludo" aria-labelledby="t-hola">
        <div>
          <h1 className="hola" id="t-hola">Hola,<strong>{nombre}</strong></h1>
          <p className="bienvenida">
            {hoy.charAt(0).toUpperCase() + hoy.slice(1)} · {empresas.length} empresa{empresas.length === 1 ? "" : "s"} a tu cargo
          </p>
          {primero ? (
            <Link className="accion-hoy" href={primero.href}>
              <span>
                <b>{primero.empresa}: {primero.titulo.toLowerCase()}</b>
                {primero.detalle && <small>{primero.detalle}</small>}
              </span>
              <span className="flecha"><Icono nombre="diagonal" /></span>
            </Link>
          ) : (
            <p className="voz">{VACIO.bandeja}</p>
          )}
          <div style={{ marginTop: 12 }}>
            <Link href="/empresas/nueva" className="boton boton--secundario">Nueva empresa</Link>
          </div>
        </div>
        <div className="pendientes">
          <div className="fila"><h2>Pendientes de hoy</h2><span className="cifra">{items.length}</span></div>
          {items.length > 0 && (
            <Segmentos
              etiqueta={`${items.filter((i) => i.urgencia === 1).length} urgentes, ${items.filter((i) => i.urgencia === 2).length} importantes, ${items.filter((i) => i.urgencia === 3).length} cuando puedas`}
              partes={[
                { n: items.filter((i) => i.urgencia === 1).length, texto: "urgentes", tipo: "s1" },
                { n: items.filter((i) => i.urgencia === 2).length, texto: "importantes", tipo: "s2" },
                { n: items.filter((i) => i.urgencia === 3).length, texto: "cuando puedas", tipo: "s4" },
              ]}
            />
          )}
        </div>
      </section>

      <section className="tarjeta medidor" aria-labelledby="t-comp">
        <div className="cabeza">
          <div><h2 id="t-comp">Lo comprobado de la cartera</h2><p className="sub">De todo lo que se ha dicho de tus empresas</p></div>
          <Link className="ir" href="/cartera" aria-label="Ir a la cartera"><Icono nombre="diagonal" /></Link>
        </div>
        <Medidor pct={pctComprobado} etiqueta="Afirmaciones confirmadas" />
        <div className="lectura">
          {pctComprobado == null ? <span className="sin-dato">Sin afirmaciones todavía</span> : <><span className="num">{pctComprobado}%</span><p>confirmado</p></>}
        </div>
        <div className="pie">
          <div><b>{confirmadas}</b><small>confirmadas</small></div>
          <div><b>{Math.max(0, afirmaciones - confirmadas)}</b><small>sin confirmar</small></div>
        </div>
      </section>

      <section className="tarjeta cifra-tarjeta" aria-labelledby="t-rev">
        <div className="cabeza">
          <div><h2 id="t-rev">Hallazgos por revisar</h2><p className="sub">Ninguno llega al cliente sin pasar por ti</p></div>
        </div>
        <div className="fila-cifra">
          <span className="grande">{porRevisar}</span>
          <Barritas etiqueta="Hallazgos por revisar, una barra por empresa" barras={empresas.map((e) => ({ valor: e.stats ? n(e.stats.hallazgos_por_revisar) : null }))} />
        </div>
      </section>

      <section className="tarjeta cifra-tarjeta" aria-labelledby="t-con">
        <div className="cabeza">
          <div><h2 id="t-con">Contradicciones abiertas</h2><p className="sub">El dueño las resuelve con tres botones</p></div>
        </div>
        <div className="fila-cifra">
          <span className="grande">{contradichas}</span>
          <Barritas etiqueta="Contradicciones sin resolver, una barra por empresa" barras={empresas.map((e) => ({ valor: e.stats ? n(e.stats.contradichas) : null }))} />
        </div>
      </section>

      <section className="tarjeta cifra-tarjeta ancha" aria-labelledby="t-fase">
        <div className="cabeza">
          <div><h2 id="t-fase">Empresas por etapa</h2><p className="sub">Dónde está cada una del recorrido</p></div>
          <Link className="ir" href="/cartera" aria-label="Ver la cartera"><Icono nombre="diagonal" /></Link>
        </div>
        <div className="fila-cifra">
          <span className="grande">{activas.length}<small>activas</small></span>
          <FranjaFases
            etiqueta="Empresas activas por etapa"
            tramos={[
              { n: enEtapa(["implementacion", "monitoreo"]), texto: "Implementa", tipo: "r1" },
              { n: enEtapa(["contraste", "diagnostico", "espejo"]), texto: "Diagnóstico", tipo: "r2" },
              { n: enEtapa(["admision", "levantamiento"]), texto: "Levantamiento", tipo: "r3" },
            ]}
          />
        </div>
      </section>

      <section className="tarjeta cifra-tarjeta ancha" aria-labelledby="t-nueve">
        <div className="cabeza">
          <div><h2 id="t-nueve">Los nueve números</h2><p className="sub">Sin ellos el diagnóstico es opinión</p></div>
        </div>
        <div className="fila-cifra">
          <span className="grande">{numerosListos}<small>de {conRadio.length * 9}</small></span>
          <Barritas etiqueta="Números listos por empresa, de nueve" barras={empresas.map((e) => ({ valor: e.radiografia ? e.radiografia.listos : null }))} />
        </div>
        <p className="pie-barritas">Una barra por empresa{empresas.some((e) => !e.radiografia) ? " · rayada: sin números todavía" : ""}</p>
      </section>

      <section className="tarjeta linea-tarjeta" aria-labelledby="t-linea">
        <div className="cabeza">
          <div><h2 id="t-linea">Afirmaciones confirmadas</h2><p className="sub">Por semana, toda la cartera, según la fecha de confirmación</p></div>
        </div>
        <div className="resumen">
          <span className="num">{estaSemana}</span>
          <p>esta semana · {serie.reduce((a, p) => a + (p.valor ?? 0), 0)} en las últimas {SEMANAS}</p>
        </div>
        <GraficoLinea puntos={serie} formato="cuenta" sufijo="confirmadas" etiqueta="Afirmaciones confirmadas por semana" />
      </section>

      <section className="tarjeta fuentes-tarjeta" aria-labelledby="t-sabemos">
        <div className="cabeza">
          <div><h2 id="t-sabemos">Cuánto sabemos de cada empresa</h2><p className="sub">Lleno: confirmado. Rayado: dicho, sin confirmar.</p></div>
          <Link className="ir" href="/empresas" aria-label="Ver todas las empresas"><Icono nombre="diagonal" /></Link>
        </div>
        {afirmaciones === 0 ? (
          <p className="sin-dato" style={{ marginTop: 18 }}>Ninguna empresa tiene afirmaciones todavía</p>
        ) : (
          <div className="fuentes">
            {masSabidas.map((e) => {
              const total = n(e.stats?.afirmaciones), conf = n(e.stats?.confirmadas);
              return (
                <div className="fuente" key={e.id}>
                  <span className="icono"><Icono nombre="empresas" /></span>
                  <div className="rotulo"><b>{e.nombre}</b><span>{conf} confirmadas · {total - conf} sin confirmar</span></div>
                  <Pista lleno={conf} resto={total - conf} escala={escala} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="tarjeta tabla-tarjeta" aria-labelledby="t-cartera">
        <div className="cabeza">
          <div><h2 id="t-cartera">Todas las empresas</h2><p className="sub">Primero lo que necesita atención</p></div>
          <Link className="ir" href="/cartera" aria-label="Ir a la cartera"><Icono nombre="diagonal" /></Link>
        </div>
        <div className="envoltura">
          <table className="tabla">
            <thead>
              <tr><th>Empresa</th><th>Etapa</th><th>Números</th><th>Confirmadas</th><th>Estado</th><th>Lo siguiente</th></tr>
            </thead>
            <tbody>
              {filas.map(({ e, propios, estado }) => (
                <tr key={e.id}>
                  <td><Link href={`/empresa/${e.id}`}>{e.nombre}</Link></td>
                  <td>{ETAPA[e.etapa] ?? e.etapa}</td>
                  <td className="t-dato">{e.radiografia ? `${e.radiografia.listos}/9` : <span className="sin-dato">Sin números</span>}</td>
                  <td className="t-dato">{e.stats ? `${n(e.stats.confirmadas)} de ${n(e.stats.afirmaciones)}` : <span className="sin-dato">Sin datos</span>}</td>
                  <td><span className={`estado ${estado.clase}`}>{estado.texto}</span></td>
                  <td>{propios[0] ? <Link href={propios[0].href} style={{ fontWeight: 500 }}>{propios[0].titulo}</Link> : <span style={{ color: "var(--grafito)" }}>Nada pendiente</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="lista-movil">
          {filas.map(({ e, propios, estado }) => (
            <li key={e.id}>
              <Link href={`/empresa/${e.id}`}>{e.nombre}</Link>
              <span className={`estado ${estado.clase}`}>{estado.texto}</span>
              <small>{ETAPA[e.etapa] ?? e.etapa} · {propios[0]?.titulo ?? "Nada pendiente"}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="tarjeta lista-tarjeta" aria-labelledby="t-resto">
        <div className="cabeza">
          <div><h2 id="t-resto">Lo demás de hoy</h2><p className="sub">Después de lo más urgente</p></div>
        </div>
        {resto.length === 0 ? (
          <p className="voz">Nada más por hoy.</p>
        ) : (
          <ul className="lista">
            {resto.slice(0, 6).map((it, i) => (
              <li key={i} className={it.urgencia === 1 ? "urgente" : undefined}>
                <Link href={it.href}>
                  <span className="icono-cuadro"><Icono nombre={ICONO_TIPO[it.tipo] ?? "aviso"} /></span>
                  <span><b>{it.titulo}</b><small>{it.empresa}</small></span>
                  <span className="derecha">{it.urgencia === 1 ? "Urgente" : it.urgencia === 2 ? "Importante" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {resto.length > 6 && <p className="voz">Y {resto.length - 6} más en la tabla de empresas.</p>}
      </section>
    </div>
  );
}
