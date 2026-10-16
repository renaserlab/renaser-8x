import { supabaseAdmin } from "@/lib/supabase/admin";
import { Marca } from "@/components/base/MarcaEstado";
import {
  cifrasSoloAlLado,
  declaranteDeRol,
  emparejarDeclaradoExtraido,
  formatoCifra,
  ladosDisponibles,
  motivoSinPares,
  rotuloDeDeclarado,
  TOPE_METRICAS,
  type CifraSoloAlLado,
  type Declarante,
  type MetricaGuardada,
  type ParDeclaradoExtraido,
} from "@/lib/rules/contradiccion-numerica";
import { etiquetaEstado } from "@/lib/metricas";
import { nombreDePeriodo } from "@/lib/temporadas";

type Tipo = ParDeclaradoExtraido["veredicto"]["tipo"];

const TITULO: Record<Tipo, string> = {
  CONTRADICCION: "No cuadran",
  COINCIDE: "Cuadran",
  NO_COMPARABLE: "No se comparan",
};

const MARCA: Record<Tipo, string> = {
  CONTRADICCION: "contradicho",
  COINCIDE: "sin_verificar",
  NO_COMPARABLE: "sin_verificar",
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Una frase que cuenta lo que hay, sin esconder lo que no se pudo comparar. */
function resumen(pares: ParDeclaradoExtraido[]): string {
  const de = (t: Tipo) => pares.filter((p) => p.veredicto.tipo === t).length;
  // Todos comparados y ninguno contradice: se dice así, que no es lo mismo que no haber comparado nada.
  if (de("COINCIDE") === pares.length) return `Se ${pares.length === 1 ? "comparó 1 par del mismo periodo y cuadra" : `compararon ${pares.length} pares del mismo periodo y cuadran`} dentro de la tolerancia.`;
  const partes: string[] = [];
  if (de("CONTRADICCION")) partes.push(`${plural(de("CONTRADICCION"), "no cuadra", "no cuadran")} con lo que muestran los documentos`);
  if (de("COINCIDE")) partes.push(plural(de("COINCIDE"), "cuadra", "cuadran"));
  if (de("NO_COMPARABLE")) partes.push(`${plural(de("NO_COMPARABLE"), "no se pudo comparar", "no se pudieron comparar")} porque las cifras son de periodos distintos`);
  return `De ${plural(pares.length, "número declarado que también aparece", "números declarados que también aparecen")} en un documento: ${partes.join("; ")}.`;
}

/** A cuántas respuestas de entrevista se les pregunta quién las dio. Las demás quedan «Declarado» a secas. */
const TOPE_RESPUESTAS = 100;

type Anidado<T> = T | T[] | null | undefined;
const uno = <T,>(v: Anidado<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
type RespuestaConRol = { id: string; interview_sessions?: Anidado<{ participants?: Anidado<{ rol: string | null }> }> };

/**
 * Quién dio cada respuesta de entrevista de la que salió un número declarado. Un «contado» no siempre
 * es del dueño: también lo dice una persona del equipo, y el portal y el espejo de indicadores lo
 * escriben sin respuesta. Si no consta o no se puede leer, no se le atribuye a nadie.
 */
async function declarantesDe(sb: ReturnType<typeof supabaseAdmin>, pares: ParDeclaradoExtraido[]): Promise<Map<string, Declarante | null>> {
  const mapa = new Map<string, Declarante | null>();
  const ids = [...new Set(pares.map((p) => p.declarado.response_id).filter((r): r is string => !!r))].slice(0, TOPE_RESPUESTAS);
  if (!ids.length) return mapa;
  const { data } = await sb.from("interview_responses").select("id, interview_sessions(participants(rol))").in("id", ids);
  for (const r of (data ?? []) as unknown as RespuestaConRol[]) mapa.set(r.id, declaranteDeRol(uno(uno(r.interview_sessions)?.participants)?.rol));
  return mapa;
}

/** El nombre de cada documento, con su tipo: «ventas-e-inventario.xlsx (dato)». Lo que no se pueda leer queda sin nombre. */
async function nombresDeFuentes(sb: ReturnType<typeof supabaseAdmin>, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((s): s is string => !!s))];
  if (!unicos.length) return new Map();
  const { data } = await sb.from("sources").select("id,nombre,tipo").in("id", unicos);
  return new Map(((data ?? []) as { id: string; nombre: string; tipo: string | null }[]).map((f) => [f.id, f.tipo ? `${f.nombre} (${f.tipo})` : f.nombre]));
}

/**
 * LAS CIFRAS QUE NO SE VEN EN OTRA PANTALLA. Una cifra pendiente de conciliar puede existir solo guardada al
 * lado de un número que después se quedó sin cifra propia (alguien respondió «no lo sé» tras el Excel, o se
 * descartó la lectura del documento). Los números de la empresa muestran ese número «sin dato», y la revisión
 * del documento ya no lista la cifra. Si aquí no se nombra, no se ve en ninguna parte.
 */
function SoloAlLado({ cifras, nombreFuente }: { cifras: CifraSoloAlLado[]; nombreFuente: Map<string, string> }) {
  if (!cifras.length) return null;
  return (
    <div className="mt-4">
      <div className="t-etiqueta">{cifras.length === 1 ? "Una cifra pendiente que no se ve en otra pantalla" : `${cifras.length} cifras pendientes que no se ven en otra pantalla`}</div>
      <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
        {cifras.length === 1 ? "Quedó guardada" : "Quedaron guardadas"} al lado de un número que hoy figura sin cifra. {cifras.length === 1 ? "Sigue pendiente" : "Siguen pendientes"} de conciliar con el dueño.
      </p>
      <ul className="flex flex-col gap-1 mt-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {cifras.map((c, i) => {
          const deDonde = c.lado === "extraido" ? `extraída de ${(c.source_id && nombreFuente.get(c.source_id)) || "un documento"}` : "declarada";
          return (
            <li key={`${c.clave}|${c.periodo}|${i}`} className="t-dato">
              {c.nombre} · {nombreDePeriodo(c.periodo)}: {c.texto}, {deDonde}. Hoy ese número figura «{etiquetaEstado(c.figura)}»
              {c.lado === "extraido" ? ", y esta cifra ya no aparece en la revisión de ese documento." : ", y esta cifra ya no aparece entre los números de la empresa."}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * LOS NÚMEROS, AL LADO: lo declarado frente a lo que un documento mostró, para la misma cosa y el
 * mismo periodo. Regla determinista (rules/contradiccion-numerica.ts), sin modelo: se calcula aquí
 * mismo a partir de company_metricas, así que se ve aunque el trabajo `contrastar` no haya corrido.
 *
 * Ninguna de las dos cifras aparece como «verificada»: comparar no verifica, y lo ya verificado o
 * conciliado no entra en esta lista. La cifra declarada dice quién la dijo solo cuando consta. Cada
 * contradicción trae la pregunta que el consultor le hace al dueño.
 *
 * SIN PARES NO SE CALLA (cierre Z1, 13-10-2026). Antes, sin pares, este bloque no ocupaba lugar, y el
 * consultor leía el silencio como «todo cuadra». Ahora dice que no se comparó nada y qué falta: la
 * cifra declarada, la del documento, o las dos del mismo número. «Se compararon N y cuadran» solo se
 * lee cuando de verdad hubo pares del mismo periodo.
 *
 * LAS DOS CIFRAS DEL MISMO PERIODO viven en una sola fila: la del número y, al lado, la que desplazó al
 * guardarse (`cifra_desplazada`). En una base sin esa columna (migración sin aplicar) solo llegan pares
 * de periodos distintos: la pantalla lo dice y NO aconseja pedir la cifra del mismo periodo, porque en
 * esa base registrarla reemplazaría a la del documento y el par desaparecería.
 *
 * LO GUARDADO AL LADO SE DICE (cierre Z1, segunda vuelta):
 *  - si la cifra del documento de un par es la guardada al lado (el número se volvió a declarar después), la
 *    tarjeta avisa de que ya no figura en la revisión de su documento: el documento podría darse por revisado
 *    sin haberla decidido, y el sistema todavía no tiene dónde conciliarla (pendiente en revisión y consolidar);
 *  - si una cifra pendiente solo existe guardada al lado de un número que hoy figura «sin dato» o descartado,
 *    se nombra aparte (`SoloAlLado`), haya pares o no. Antes no salía en ninguna pantalla.
 */
export async function Contradicciones({ companyId }: { companyId: string }) {
  const sb = supabaseAdmin();
  // `*` y no una lista: así la falta de una columna nueva (origen, cifra_desplazada) no impide leer lo que sí hay.
  const { data, error } = await sb.from("company_metricas").select("*").eq("company_id", companyId).order("updated_at", { ascending: false }).limit(TOPE_METRICAS);

  if (error) {
    return (
      <section className="panel p-5 mb-8" style={{ borderColor: "var(--contradicho)" }}>
        <h2 className="t-seccion">Números declarados frente a documentos</h2>
        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
          No se pudieron leer los números de la empresa: {error.message}. Sin leerlos no se pone nada al lado; esto no significa que cuadren.
        </p>
      </section>
    );
  }

  const filas = (data ?? []) as MetricaGuardada[];
  const sinNombre = emparejarDeclaradoExtraido(filas);
  // ¿Puede la base tener a la vez la cifra declarada y la extraída del mismo periodo? Solo si existe la columna.
  // Mientras no pueda, se dice una vez, arriba: pedir «la del mismo periodo» no las pondría al lado.
  const guardaLasDos = filas.some((f) => "cifra_desplazada" in f);
  const sueltas = cifrasSoloAlLado(filas);
  if (!sinNombre.length) {
    const nombreFuente = await nombresDeFuentes(sb, sueltas.map((c) => c.source_id));
    // Sin pares no se comparó nada. Se dice, con lo que falta, para que el silencio no se lea como «todo cuadra».
    return (
      <section className="panel p-5 mb-8">
        <h2 className="t-seccion">Números declarados frente a documentos</h2>
        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
          {motivoSinPares(ladosDisponibles(filas))} No se comparó nada: esto no significa que cuadren. Lo ya verificado o conciliado no entra en esta comparación.
          {filas.length > 0 && !guardaLasDos
            ? " Además, por ahora el sistema guarda una sola cifra por número y periodo: si se registra la declarada para el mismo periodo del documento, reemplaza a la del documento en lugar de quedar a su lado. Falta aplicar a la base la actualización que permite guardar las dos (supabase/migracion-cifra-desplazada.sql)."
            : ""}
          {filas.length >= TOPE_METRICAS ? ` Se leyeron los ${TOPE_METRICAS} números más recientes; puede haber más.` : ""}
        </p>
        <SoloAlLado cifras={sueltas} nombreFuente={nombreFuente} />
      </section>
    );
  }
  const declarantes = await declarantesDe(sb, sinNombre);
  const pares = declarantes.size ? emparejarDeclaradoExtraido(filas, { declarantes }) : sinNombre;
  const avisarLimite = !guardaLasDos && pares.some((p) => p.veredicto.tipo === "NO_COMPARABLE");

  const nombreFuente = await nombresDeFuentes(sb, [...pares.map((p) => p.extraido.source_id), ...sueltas.map((c) => c.source_id)]);

  return (
    <section className="panel p-5 mb-8 aparece">
      <h2 className="t-seccion">Números declarados frente a documentos</h2>
      <p className="t-dato mt-1 mb-4" style={{ color: "var(--grafito)" }}>
        {resumen(pares)} Comparar no verifica: las dos cifras siguen pendientes de conciliar con el dueño.
        {avisarLimite
          ? " Las que no se compararon todavía no se pueden comparar aquí: por ahora el sistema guarda una sola cifra por número y periodo, y si se registra la declarada para el mismo periodo del documento, reemplaza a la del documento en lugar de quedar a su lado. Falta aplicar a la base la actualización que permite guardar las dos (supabase/migracion-cifra-desplazada.sql)."
          : ""}
        {filas.length >= TOPE_METRICAS ? ` Se leyeron los ${TOPE_METRICAS} números más recientes; puede haber más sin comparar.` : ""}
      </p>

      <ul className="flex flex-col gap-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {pares.map((p, i) => {
          const v = p.veredicto;
          const cifra = (n: number) => formatoCifra(n, p.unidad);
          const d = p.declaracion;
          const claseDeclarada = d.clase === "rango" ? "rango" : d.clase === "aproximada" ? "cifra aproximada" : "cifra exacta";
          const dicho = d.clase !== "rango" && d.texto && d.texto !== String(d.valor) ? ` · «${d.texto}»` : "";
          const fuenteDoc = (p.extraido.source_id && nombreFuente.get(p.extraido.source_id)) || "documento";
          const contradice = v.tipo === "CONTRADICCION";
          return (
            <li key={`${p.clave}|${p.periodo}|${p.periodo_extraido}|${i}`} className="panel p-4" style={{ background: "var(--suave)", borderColor: contradice ? "var(--contradicho)" : "var(--linea)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="t-dato" style={{ fontWeight: 600 }}>{p.nombre}</h3>
                <span className="marca-estado t-dato" style={{ color: contradice ? "var(--contradicho)" : "var(--grafito)", whiteSpace: "normal" }}>
                  <Marca estado={MARCA[v.tipo]} /> {TITULO[v.tipo]}
                  {v.diferencia_pct != null ? ` · ${Math.round(v.diferencia_pct)} % de diferencia (se tolera ${v.tolerancia_pct} %)` : ""}
                </span>
              </div>

              <div className="grid gap-4 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div>
                  <div className="t-etiqueta">{rotuloDeDeclarado(p.declarante)} · {nombreDePeriodo(p.periodo)}</div>
                  <div className="t-dato mt-1" style={{ fontSize: "1.25rem" }}>
                    {d.clase === "rango" ? `entre ${cifra(d.desde)} y ${cifra(d.hasta)}` : cifra(d.valor)}
                  </div>
                  <div className="t-dato" style={{ color: "var(--grafito)" }}>
                    {claseDeclarada}
                    {dicho} · {etiquetaEstado(p.declarado.estado)} · pendiente de conciliar
                  </div>
                </div>
                <div>
                  <div className="t-etiqueta">Extraído de un documento · {nombreDePeriodo(p.periodo_extraido)}</div>
                  <div className="t-dato mt-1" style={{ fontSize: "1.25rem" }}>{cifra(v.extraido.valor)}</div>
                  <div className="t-dato" style={{ color: "var(--grafito)" }}>
                    {fuenteDoc} · {etiquetaEstado("extraido")}
                  </div>
                </div>
              </div>

              {p.extraido_al_lado && (
                <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
                  La cifra del documento quedó guardada al lado de la declarada cuando el número se volvió a declarar, y ya no figura en la revisión de {fuenteDoc === "documento" ? "su documento" : fuenteDoc}: ese documento puede darse por revisado sin que nadie la haya decidido. El sistema todavía no tiene una pantalla donde conciliarla; hasta entonces se resuelve con el dueño a partir de esta tarjeta.
                </p>
              )}

              {v.tipo === "NO_COMPARABLE" && (
                <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
                  {v.motivo}
                </p>
              )}
              {p.pregunta && (
                <div className="mt-3">
                  <div className="t-etiqueta">Pregunta para el dueño</div>
                  <p className="t-cuerpo mt-1">{p.pregunta}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <SoloAlLado cifras={sueltas} nombreFuente={nombreFuente} />
    </section>
  );
}
