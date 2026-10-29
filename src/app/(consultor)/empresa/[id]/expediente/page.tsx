import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Icono } from "@/components/base/Icono";
import { Segmentos, Pista } from "@/components/tablero/Piezas";
import { Participantes } from "@/components/consultor/Participantes";
import { Admision } from "@/components/consultor/Admision";
import { SeguimientoConversacion, leerSeguimiento } from "@/components/consultor/SeguimientoConversacion";
import { tokensUsados } from "@/lib/db/queries";
import { cumplimientoLegal } from "@/lib/biblioteca";
import { configDe, PAISES, MONEDAS, ZONAS } from "@/lib/formato";

export const dynamic = "force-dynamic";

/*
EXPEDIENTE (16-10-2026): lo que se levantó de la empresa y su administración, aparte y abajo en la columna de vistas.
Aquí se juntan Fuentes, Afirmaciones, Entrevista, El día y Configuración (que siguen abriendo en su pantalla, en «En esta
vista»), y lo que antes vivía al final del Panorama: el seguimiento de la conversación, las personas entrevistadas, la
admisión, los datos del expediente y el cumplimiento legal.
Lo único arriba: cuántas fuentes y cuánto de lo dicho ya está confirmado. Lo que no se pudo leer se dice con su nombre.
*/

type Stats = { fuentes?: number | null; afirmaciones?: number | null; confirmadas?: number | null; sin_verificar?: number | null; contradichas?: number | null; hallazgos_por_revisar?: number | null };
type Empresa = {
  estado_admision: string | null;
  admision: (Record<string, string> & { evaluacion?: { admisible: boolean; motivo: string; senales: string[] } }) | null;
  ficha: { personas?: string } | null;
  tope_tokens: number | null;
  pais?: string | null;
  moneda?: string | null;
  idioma?: string | null;
  zona_horaria?: string | null;
};

const n = (v: unknown) => Number(v ?? 0) || 0;

export default async function Expediente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = `/empresa/${id}`;
  const sb = supabaseAdmin();

  const [empresaLeida, statsLeidas, fuentesLeidas, documentosLeidos, personasLeidas, sesionesLeidas, seguimiento, usados] = await Promise.all([
    sb.from("companies").select("*").eq("id", id).maybeSingle(),
    sb.from("company_stats").select("*").eq("company_id", id).maybeSingle(),
    sb.from("sources").select("estado").eq("company_id", id),
    sb.from("expediente_documental").select("estado,clave_vara").eq("company_id", id),
    sb.from("participants").select("id,nombre,puesto,rol,token_expira_at,token_revocado_at,token_canjeado_at").eq("company_id", id).order("created_at"),
    sb.from("interview_sessions").select("id,tipo,estado,participant_id").eq("company_id", id),
    leerSeguimiento(id).catch(() => null),
    tokensUsados(id).catch(() => null),
  ]);

  const c = (empresaLeida.data ?? null) as Empresa | null;
  const stats = statsLeidas.error ? null : ((statsLeidas.data ?? null) as Stats | null);
  const afirmaciones = n(stats?.afirmaciones);
  const confirmadas = n(stats?.confirmadas);
  const estados = fuentesLeidas.error ? null : ((fuentesLeidas.data ?? []) as { estado: string | null }[]).map((f) => f.estado ?? "");
  // company_stats es una vista materializada (se refresca cada tanto): las fuentes se cuentan de la lectura de hoy, la
  // misma de la tarjeta «Fuentes» de abajo, para que arriba y abajo digan el mismo número. Sin lectura, la de stats.
  const fuentesTotal = estados ? estados.length : n(stats?.fuentes);
  const leidas = estados?.filter((e) => e === "leido").length ?? 0;
  const conError = estados?.filter((e) => e === "error").length ?? 0;
  const docs = documentosLeidos.error ? null : ((documentosLeidos.data ?? []) as { estado: string | null; clave_vara: string | null }[]);
  const docsVigentes = docs?.filter((d) => d.estado === "vigente").length ?? 0;
  const docsSinVara = docs?.filter((d) => !d.clave_vara && d.estado !== "insumo").length ?? 0;
  const enLectura = (estados?.length ?? 0) - leidas - conError;

  const sesiones = (sesionesLeidas.data ?? []) as { id: string; tipo: string; estado: string; participant_id: string | null }[];
  const participantes = personasLeidas.error
    ? null
    : ((personasLeidas.data ?? []) as { id: string; nombre: string; puesto: string | null; rol: string | null; token_expira_at: string | null; token_revocado_at: string | null; token_canjeado_at: string | null }[]).map((p) => ({
        ...p,
        sesiones: sesiones.filter((s) => s.participant_id === p.id),
      }));

  const cfg = configDe(c);
  const pais = PAISES.find((p) => p.codigo === cfg.pais)?.nombre ?? cfg.pais;
  const moneda = MONEDAS.find((m) => m.codigo === cfg.moneda)?.nombre ?? cfg.moneda;
  const zona = ZONAS.find((z) => z.zona === cfg.zona_horaria)?.nombre ?? cfg.zona_horaria;
  const personas = c?.ficha?.personas ?? null;

  return (
    <div className="tablero">
      {/* LO ÚNICO ARRIBA: cuántas fuentes, y cuánto de lo dicho ya está confirmado. En una línea: la barra va una sola
          vez, en la tarjeta «Afirmaciones» (revisión del 16-10-2026: arriba y abajo repetían «31 de 48» con dos barras). */}
      <section className="tarjeta a-lo-ancho" aria-labelledby="t-expediente">
        <p className="t-etiqueta" style={{ margin: 0 }}>Expediente</p>
        <h1 id="t-expediente" className="t-hero" style={{ margin: "6px 0 0" }}>
          {stats ? `${fuentesTotal} fuente${fuentesTotal === 1 ? "" : "s"} · ${confirmadas} de ${afirmaciones} afirmaciones confirmadas` : "Lo que se levantó de la empresa"}
        </h1>
        {!stats ? (
          <p className="sin-dato" style={{ marginTop: 10 }}>Fuentes y afirmaciones: sin dato</p>
        ) : afirmaciones === 0 ? (
          <p className="sin-dato" style={{ marginTop: 10 }}>Todavía no hay afirmaciones</p>
        ) : (
          <p className="sub" style={{ marginTop: 6 }}>Lo que se levantó de la empresa: sus fuentes, lo que se dijo de ella y quién lo dijo.</p>
        )}
      </section>

      {/* DOCUMENTOS. Son los manuales, procedimientos y contratos que la empresa YA tenía, que es
          otra cosa que las fuentes: una fuente es lo que aportó para que la leamos, un documento es
          lo que rige —o debería regir— su forma de trabajar. Hasta el 22-10-2026 vivían en la base
          sin ninguna pantalla de la consultora que los mostrara. */}
      <section className="tarjeta bloque" aria-labelledby="t-documentos">
        <div className="cabeza">
          <div><h2 id="t-documentos">Documentos</h2><p className="sub">Sus manuales, procedimientos y contratos, con la vara que los mide</p></div>
          <Link className="ir" href={`${base}/documentos`} aria-label="Ir a Documentos" title="Ir a Documentos"><Icono nombre="diagonal" /></Link>
        </div>
        {docs === null ? (
          <p className="sin-dato">Documentos: no se pudieron leer</p>
        ) : docs.length === 0 ? (
          <p className="sin-dato">Documentos: todavía ninguno</p>
        ) : (
          <>
            <p className="principal"><span className="grande">{docs.length}</span> {docs.length === 1 ? "documento" : "documentos"}</p>
            {/* Lo vigente es lo único que el dueño ve en su portal, y lo que no tiene vara no se
                puede medir. Son los dos números que deciden qué hacer a continuación. */}
            <p className="nota">{docsVigentes} {docsVigentes === 1 ? "vigente" : "vigentes"} · {docsSinVara} sin vara</p>
          </>
        )}
      </section>

      {/* FUENTES */}
      <section className="tarjeta bloque" aria-labelledby="t-fuentes">
        <div className="cabeza">
          <div><h2 id="t-fuentes">Fuentes</h2><p className="sub">Documentos, audios y fotos que aportó la empresa</p></div>
          <Link className="ir" href={`${base}/fuentes`} aria-label="Ir a Fuentes" title="Ir a Fuentes"><Icono nombre="diagonal" /></Link>
        </div>
        {estados === null ? (
          <p className="sin-dato">Fuentes: no se pudieron leer</p>
        ) : estados.length === 0 ? (
          <p className="sin-dato">Fuentes: todavía ninguna</p>
        ) : (
          <>
            <p className="principal"><span className="grande">{estados.length}</span> fuente{estados.length === 1 ? "" : "s"}</p>
            <Segmentos
              etiqueta={`${leidas} leídas, ${enLectura} leyendo, ${conError} con error`}
              partes={[
                { n: leidas, texto: leidas === 1 ? "leída" : "leídas", tipo: "s1" },
                { n: enLectura, texto: "leyendo", tipo: "s2" },
                { n: conError, texto: "con error", tipo: "s4" },
              ]}
            />
          </>
        )}
      </section>

      {/* AFIRMACIONES */}
      <section className="tarjeta bloque" aria-labelledby="t-afirmaciones">
        <div className="cabeza">
          <div><h2 id="t-afirmaciones">Afirmaciones</h2><p className="sub">Lo que se dijo de la empresa, y si ya se confirmó</p></div>
          <Link className="ir" href={`${base}/afirmaciones`} aria-label="Ir a Afirmaciones" title="Ir a Afirmaciones"><Icono nombre="diagonal" /></Link>
        </div>
        {!stats ? (
          <p className="sin-dato">Afirmaciones: sin dato</p>
        ) : afirmaciones === 0 ? (
          <p className="sin-dato">Afirmaciones: todavía ninguna</p>
        ) : (
          <>
            {/* Lo que falta, no lo que ya dice el titular de arriba. */}
            {afirmaciones - confirmadas > 0 ? (
              <p className="principal"><span className="grande">{afirmaciones - confirmadas}</span> por confirmar</p>
            ) : (
              <p className="principal">Todas confirmadas</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Pista lleno={confirmadas} resto={Math.max(0, afirmaciones - confirmadas)} escala={afirmaciones} />
              <span className="nota">Lleno: confirmado · rayado: dicho, sin confirmar</span>
            </div>
            <p className="nota">
              {n(stats.sin_verificar)} sin verificar · {n(stats.contradichas)} {n(stats.contradichas) === 1 ? "contradicha" : "contradichas"}
            </p>
            {n(stats.contradichas) > 0 && (
              <Link className="enlace-azul" href={`${base}/afirmaciones?estado=contradicho`}>Resolver las contradicciones</Link>
            )}
          </>
        )}
      </section>

      {/* ENTREVISTA: el seguimiento de la conversación, con «Dónde profundizar». */}
      <section className="tarjeta a-lo-ancho" aria-labelledby="t-entrevista">
        <div className="cabeza">
          <div><h2 id="t-entrevista">Entrevista</h2><p className="sub">Cómo va cada conversación, qué falta cubrir y dónde profundizar</p></div>
          <Link className="ir" href={`${base}/entrevista`} aria-label="Ir a Entrevista" title="Ir a Entrevista"><Icono nombre="diagonal" /></Link>
        </div>
        {seguimiento === null ? (
          <p className="sin-dato" style={{ marginTop: 14 }}>Entrevista: no se pudo leer</p>
        ) : seguimiento.sesiones.length === 0 ? (
          <p className="sin-dato" style={{ marginTop: 14 }}>Entrevista: todavía sin sesiones</p>
        ) : (
          <SeguimientoConversacion companyId={id} datos={seguimiento} />
        )}
      </section>

      {/* EL DÍA */}
      <section className="tarjeta bloque" aria-labelledby="t-dia">
        <div className="cabeza">
          <div><h2 id="t-dia">El día</h2><p className="sub">Anotar lo que pasó hoy en la empresa</p></div>
          <Link className="ir" href={`${base}/dia`} aria-label="Ir a El día" title="Ir a El día"><Icono nombre="diagonal" /></Link>
        </div>
        <p className="sub" style={{ margin: 0 }}>Lo que se vio o se escuchó hoy, con su hora: entra al expediente como cualquier otra fuente.</p>
        <Link className="boton boton--secundario" href={`${base}/dia`} style={{ alignSelf: "flex-start" }}>Anotar lo de hoy</Link>
      </section>

      {/* CONFIGURACIÓN */}
      <section className="tarjeta bloque" aria-labelledby="t-config">
        <div className="cabeza">
          <div><h2 id="t-config">Configuración</h2><p className="sub">Cómo se escriben sus cifras y sus fechas</p></div>
          <Link className="ir" href={`${base}/configuracion`} aria-label="Ir a Configuración" title="Ir a Configuración"><Icono nombre="diagonal" /></Link>
        </div>
        {c === null ? (
          <p className="sin-dato">Configuración: no se pudo leer</p>
        ) : (
          <ul className="lista" style={{ marginTop: 0 }}>
            <li><div className="fila"><span><b>{pais}</b><small>País</small></span></div></li>
            <li><div className="fila"><span><b>{moneda}</b><small>Moneda</small></span></div></li>
            <li><div className="fila"><span><b>{zona}</b><small>Hora de la empresa</small></span></div></li>
          </ul>
        )}
      </section>

      {/* PERSONAS ENTREVISTADAS */}
      <section className="tarjeta a-lo-ancho" aria-label="Personas entrevistadas">
        {participantes === null ? (
          <p className="sin-dato">Personas entrevistadas: no se pudieron leer</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <Participantes companyId={id} participantes={participantes} />
          </div>
        )}
      </section>

      {/* ADMISIÓN */}
      <section className="tarjeta a-lo-ancho" aria-labelledby="t-admision">
        <div className="cabeza">
          <div><h2 id="t-admision">Admisión</h2><p className="sub">Si la empresa entra al método</p></div>
          {c?.estado_admision === "admitida" && <span className="estado ok">Admitida</span>}
        </div>
        {c === null ? (
          <p className="sin-dato" style={{ marginTop: 14 }}>Admisión: no se pudo leer</p>
        ) : c.estado_admision !== "admitida" ? (
          <div style={{ marginTop: 14 }}>
            <Admision companyId={id} estado={c.estado_admision ?? ""} evaluacion={c.admision?.evaluacion} respuestas={c.admision} />
          </div>
        ) : null}
      </section>

      {/* PLEGADOS: los números del expediente y el cumplimiento legal. */}
      <section className="tarjeta a-lo-ancho" aria-label="Datos del expediente y cumplimiento legal">
        <details>
          <summary className="t-etiqueta" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>Datos del expediente</summary>
          {!stats ? (
            <p className="sin-dato">Datos del expediente: sin dato</p>
          ) : (
            <section className="grid gap-6 sm:grid-cols-3 lg:grid-cols-6 mt-2">
              {(
                [
                  ["Fuentes", fuentesTotal],
                  ["Definiciones", afirmaciones],
                  ["Sin verificar", n(stats.sin_verificar)],
                  ["Contradichas", n(stats.contradichas)],
                  ["Por revisar", n(stats.hallazgos_por_revisar)],
                  ["Tokens", usados === null ? null : `${Math.round(usados / 1000)}k / ${Math.round(n(c?.tope_tokens) / 1000)}k`],
                ] as [string, string | number | null][]
              ).map(([e, v]) => (
                <div key={e}>
                  <p className="t-etiqueta mb-1">{e}</p>
                  {v === null ? <p className="sin-dato">no se pudo calcular</p> : <p className="t-seccion">{v}</p>}
                </div>
              ))}
            </section>
          )}
        </details>
        <details style={{ borderTop: "1px solid var(--linea)", marginTop: 4 }}>
          <summary className="t-etiqueta" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
            Cumplimiento legal (Perú) · {personas ?? "?"} trabajadores
          </summary>
          <ul className="lista-editorial mt-2">
            {cumplimientoLegal(Number(personas)).map((o) => (
              <li key={o.obligacion} style={{ padding: "8px 0" }}>
                <span style={{ fontWeight: 550, fontSize: 13.5 }}>{o.obligacion}</span>
                <span className="t-dato" style={{ color: "var(--grafito)", display: "block" }}>{o.detalle}</span>
              </li>
            ))}
          </ul>
          <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>La exigencia exacta depende del sector y régimen: verificar con asesoría laboral.</p>
        </details>
      </section>
    </div>
  );
}
