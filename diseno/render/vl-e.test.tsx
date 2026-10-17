/**
 * ARNÉS DE DISEÑO · LA ESTRATEGIA (17-10-2026, revisión de producto): la vista Estrategia de la consultora con una
 * estrategia falsa COMPLETA (lista, y con el camino ya elegido viendo lo que leerá el cliente), y «Tu plan» del dueño
 * con el camino aprobado arriba, más su página de preguntas. Pinta las pantallas tal como las arman la app y sus marcos,
 * con la base en memoria de tests/fixtures/base-estrategia.ts, la empresa FICTICIA «Frutas del Valle» y las salidas
 * falsas del modelo de tests/fixtures/estrategia-falsa.ts. Ningún modelo, ninguna base real.
 *
 * Cómo correrlo: npx vitest run --config diseno/render/vitest.config.mts diseno/render/vl-e.test.tsx
 * Deja el HTML en diseno/render/salida/ (ignorada por git); la hoja es salida/app-nuevo.css (la compila css.cjs).
 */
import { it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { prerenderToNodeStream } from "react-dom/static";
import Link from "next/link";
import { Icono } from "@/components/base/Icono";
import type { Fila } from "../../tests/fixtures/base-falsa";
import { crearBaseEstrategia } from "../../tests/fixtures/base-estrategia";
import { entradasFrutas, HOY as HOY_FIXTURE, LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, ROJO_BUENO } from "../../tests/fixtures/estrategia-falsa";
import type { EntradasPaquete } from "@/lib/estrategia/paquete";

const estado = vi.hoisted(() => ({ base: null as unknown, portal: null as unknown, ruta: "/portal" }));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => estado.portal }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  perfilApi: vi.fn(),
  puedeAcceder: vi.fn(async () => true),
  requerirConsultor: async () => ({ id: "00000000-0000-4000-8000-0000000000c1", email: "consultora@ejemplo.pe", nombre: "Consultora de Ejemplo", rol: "consultor" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => estado.ruta,
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode; prefetch?: unknown }) => {
    const atributos: Record<string, unknown> = { ...resto };
    delete atributos.prefetch;
    return (
      <a href={href} {...atributos}>
        {children}
      </a>
    );
  },
}));
// 8X lee la empresa con leerEntradasPaquete (solo antes de generar): aquí le da las entradas ficticias.
const entradas = vi.hoisted(() => ({ de: null as null | (() => EntradasPaquete) }));
vi.mock("@/lib/estrategia/paquete-datos", async (orig) => {
  const real = await orig<typeof import("@/lib/estrategia/paquete-datos")>();
  return { ...real, leerEntradasPaquete: async (id: string) => (entradas.de ? entradas.de() : real.leerEntradasPaquete(id)) };
});

// ─────────────────────────── La empresa ficticia ───────────────────────────
const EMP = "0000000f-0000-4000-8000-00000000000f";
const NOMBRE = "Frutas del Valle (ficticia)";
const DUENA = { id: "00000000-0000-4000-8000-0000000000a1", rol: "cliente", nombre: "Dueña Ejemplo" };
const V1 = "00000000-0000-4000-8000-0000000e5001";
const AHORA = new Date();
const dia = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();
const fecha = (d: number) => dia(d).slice(0, 10);

function tablasBase(): Record<string, Fila[]> {
  return {
    companies: [
      {
        id: EMP, nombre: NOMBRE, sector: "Distribución de fruta", etapa: "diagnostico", estado_admision: "admitida",
        pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", modelo_negocio: ["revende"], tipo_trabajo: "estructurar_y_sistematizar",
        ruta_inicio: fecha(12), hora_cierre: "19:00", modelo_operativo: ["comercio"], ficha: { personas: "9", ciudad: "Lima" },
        admision: null, tope_tokens: 2_000_000, created_at: dia(40),
      },
    ],
    memberships: [{ user_id: DUENA.id, company_id: EMP, nivel: "dueno" }],
    participants: [{ id: "pa1", company_id: EMP, nombre: "Dueña Ejemplo", puesto: "Dueña", rol: "dueno", token_expira_at: null, token_revocado_at: null, token_canjeado_at: dia(30), created_at: dia(30), user_id: DUENA.id }],
    interview_sessions: [],
    interview_responses: [],
    claims: [],
    company_metricas: [],
    processes: [],
    sources: [],
    company_stats: [{ company_id: EMP, afirmaciones: 48, confirmadas: 31, contradichas: 2, sin_verificar: 15, hallazgos_por_revisar: 3, fuentes: 9 }],
    indicadores: [],
    indicador_valores: [],
    actions: [
      { id: "a1", company_id: EMP, accion: "Llamar a los clientes que deben más de un mes", estado: "en_ejecucion", verificado_at: null, vence_at: fecha(-5), indicador_id: null, updated_at: dia(2) },
      { id: "a2", company_id: EMP, accion: "Anotar cada pedido del día en la hoja", estado: "aprobado", verificado_at: null, vence_at: fecha(-9), indicador_id: null, updated_at: dia(2) },
    ],
    deliverables: [],
    revisiones_semanales: [],
    ruta_marcas: [],
    iniciativas: [],
    company_assets: [],
    checkpoints: [],
    token_usage: [{ company_id: EMP, tokens_entrada: 420_000, tokens_salida: 96_000 }],
  };
}

function armarBase(extra: Record<string, Fila[]> = {}) {
  const b = crearBaseEstrategia({ ...tablasBase(), ...extra });
  // Lo que la base falsa no trae y estas pantallas usan: .or/.not (filtros que aquí no filtran).
  const from = (t: string) => {
    const q = b.from(t) as unknown as Record<string, unknown>;
    q.or = () => q;
    q.not = () => q;
    return q;
  };
  estado.base = { ...b, from };
  return b;
}

/** Una versión armada con las salidas falsas, como la deja el motor al terminar (sin ningún modelo). */
async function version(extra: Fila = {}): Promise<Fila> {
  const { congelar } = await import("@/lib/estrategia/generar");
  const { huellaPaquete } = await import("@/lib/estrategia/paquete");
  const { conIds } = await import("@/lib/estrategia/armar");
  const { cerrarEstrategia } = await import("@/lib/estrategia/motor");
  const { paquete, calculos } = congelar(entradasFrutas(), HOY_FIXTURE);
  const dinero = conIds(LENTE_DINERO_BUENA, "A");
  const terreno = conIds(LENTE_TERRENO_BUENA, "B");
  const c = cerrarEstrategia({ paquete, calculos, dinero, terreno, rojo: ROJO_BUENO }, { quitar: false });
  const creada = dia(1);
  return {
    id: V1, company_id: EMP, version: 1, estado: c.estado, etapa: "terminada", origen: "ia",
    paquete, paquete_huella: huellaPaquete(paquete), calculos, lente_dinero: dinero, lente_terreno: terreno, proyecciones_lentes: null,
    equipo_rojo: { primera: ROJO_BUENO, reparacion: null }, salida: c.estrategia, vigente: structuredClone(c.estrategia),
    validacion: { ...c.validacion, de: "final" }, calidad: { items: c.calidad }, errores: [], trabajos: {},
    camino_elegido: null, motivo_eleccion: null, para_dueno: null, basada_en: null, pedida_por: null, aprobada_por: null, aprobada_at: null,
    created_at: creada, updated_at: creada,
    ...extra,
  };
}

/** Las preguntas que 8X propondría al terminar esta versión (pedidosDesdeFaltantes), en el estado pedido. */
async function preguntas(estadoP: "propuesta" | "enviada"): Promise<Fila[]> {
  const v = await version();
  const { pedidosDesdeFaltantes } = await import("@/lib/estrategia/pedidos");
  const p = pedidosDesdeFaltantes(v.vigente as never, v.paquete as never, 1);
  return p.preguntas.map((q, i) => ({
    id: `00000000-0000-4000-8000-00000000a${String(i + 1).padStart(3, "0")}`,
    company_id: EMP, estrategia_id: V1, clave: q.clave, texto: q.texto, por_que: q.por_que, unidad: q.unidad,
    estado: estadoP, espera: q.espera, respuesta: null, respuesta_texto: null, respondida_at: null, created_at: dia(1),
  }));
}

// ─────────────────────────── El HTML ───────────────────────────
const SALIDA = path.resolve(__dirname, "salida");

function pagina(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400..700&family=Manrope:wght@400..800&family=Source+Serif+4:wght@400;600&display=swap">
<link rel="stylesheet" href="app-nuevo.css">
<style>:root{--font-bodoni:"Bodoni Moda";--font-manrope:"Manrope";--font-source-serif:"Source Serif 4";}</style>
</head><body>${cuerpo}</body></html>`;
}

async function aHtml(el: React.ReactElement): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el);
  const trozos: Buffer[] = [];
  for await (const t of prelude) trozos.push(Buffer.from(t as Uint8Array));
  return Buffer.concat(trozos).toString("utf8");
}

async function consultora(sub: string, cuerpo: () => Promise<React.ReactElement> | React.ReactElement) {
  estado.ruta = `/empresa/${EMP}${sub}`;
  const { NavConsultor } = await import("@/components/consultor/NavConsultor");
  const { default: LayoutEmpresa } = await import("@/app/(consultor)/empresa/[id]/layout");
  const contenido = await cuerpo();
  const empresa = await LayoutEmpresa({ children: contenido, params: Promise.resolve({ id: EMP }) });
  return aHtml(
    <div className="marco-app">
      <NavConsultor
        empresas={[{ id: EMP, nombre: NOMBRE }, { id: "e2", nombre: "Estudio Contable de Ejemplo (ficticia)" }]}
        usuario="Consultora de Ejemplo"
        torre={<Link className="boton-redondo solo-celular lg:hidden" href="/torre" aria-label="Torre de control" title="Torre de control"><Icono nombre="torre" /></Link>}
      />
      <div className="columna-app">
        <main className="contenido-app">
          <div className="hoja">{empresa}</div>
        </main>
      </div>
    </div>
  );
}

/** El marco del portal, como lo arma src/app/(cliente)/layout.tsx, con los cinco destinos. */
async function portal(ruta: string, cuerpo: () => Promise<React.ReactElement> | React.ReactElement) {
  estado.ruta = ruta;
  const { NavCliente } = await import("@/components/cliente/NavCliente");
  const { EnEstaSeccion } = await import("@/components/cliente/EnEstaSeccion");
  const { BarraRutaCliente } = await import("@/components/cliente/BarraRutaCliente");
  const { seccionesAbiertas, pantallasOcultas, pantallasSinPedido } = await import("@/lib/solicitudes");
  const { negocioDeEmpresa } = await import("@/lib/ruta-datos");
  const [abiertasAhora, negocio] = await Promise.all([seccionesAbiertas(EMP).catch(() => null), negocioDeEmpresa(EMP).catch(() => null)]);
  const ocultar = [...pantallasOcultas(abiertasAhora, negocio?.guardado ?? null), ...pantallasSinPedido(abiertasAhora)];
  const enlaces: [string, string][] = [["/portal", "Inicio"], ["/portal/diagnostico", "Tu diagnóstico"], ["/portal/numeros", "Tus números"], ["/portal/procesos", "Tus procesos"], ["/portal/plan", "Tu plan"]];
  const barra = await BarraRutaCliente({ companyId: EMP }).catch(() => null);
  const contenido = await cuerpo();
  return aHtml(
    <div className="marco-app">
      <NavCliente enlaces={enlaces} empresa={NOMBRE} avisos={abiertasAhora?.length ? { "/portal": abiertasAhora.length } : undefined} />
      <div className="columna-app">
        {barra}
        <main className="contenido-app">
          <EnEstaSeccion ocultar={ocultar} />
          <div className="hoja">{contenido}</div>
        </main>
      </div>
    </div>
  );
}

type Pagina = (p: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string>> }) => Promise<unknown>;
const con = (P: Pagina, q: Record<string, string> = {}) => async () => (await P({ params: Promise.resolve({ id: EMP }), searchParams: Promise.resolve(q) })) as React.ReactElement;

it("pinta la estrategia: la vista de la consultora y el camino elegido del dueño", async () => {
  mkdirSync(SALIDA, { recursive: true });
  const errores: string[] = [];
  const hacer = async (nombre: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      errores.push(`${nombre}: ${e instanceof Error ? e.stack : String(e)}`);
    }
  };
  entradas.de = () => entradasFrutas();

  // 1. La consultora, con una estrategia lista y las preguntas que 8X propone para el dueño.
  await hacer("vle-estrategia-lista", async () => {
    armarBase({ estrategias: [await version()], estrategia_preguntas: await preguntas("propuesta") });
    const { default: Estrategia } = await import("@/app/(consultor)/empresa/[id]/estrategia/page");
    writeFileSync(path.join(SALIDA, "vle-estrategia-lista.html"), pagina("Estrategia lista (arnés)", await consultora("/estrategia", con(Estrategia as unknown as Pagina))));
  });
  // 2. La consultora eligió el camino A: aparece lo que verá el cliente y «Aprobar».
  await hacer("vle-estrategia-elegida", async () => {
    armarBase({ estrategias: [await version({ camino_elegido: "a", motivo_eleccion: "Ataca primero el dinero que ya es de la empresa" })], estrategia_preguntas: await preguntas("enviada") });
    const { default: Estrategia } = await import("@/app/(consultor)/empresa/[id]/estrategia/page");
    writeFileSync(path.join(SALIDA, "vle-estrategia-elegida.html"), pagina("Estrategia elegida (arnés)", await consultora("/estrategia", con(Estrategia as unknown as Pagina))));
  });
  // 3. Antes de generar (para comparar el arranque).
  await hacer("vle-estrategia-preparacion", async () => {
    armarBase();
    const { default: Estrategia } = await import("@/app/(consultor)/empresa/[id]/estrategia/page");
    writeFileSync(path.join(SALIDA, "vle-estrategia-preparacion.html"), pagina("Estrategia sin generar (arnés)", await consultora("/estrategia", con(Estrategia as unknown as Pagina))));
  });

  // 4. El dueño: «Tu plan» con el camino aprobado arriba, y preguntas enviadas sin responder.
  const aprobada = async () => {
    const v = await version({ camino_elegido: "a" });
    const { vistaParaDueno } = await import("@/lib/estrategia/para-dueno");
    const { refsDeEstrategia } = await import("@/lib/estrategia/armar");
    const para_dueno = vistaParaDueno(v.vigente as never, "a", refsDeEstrategia(v.vigente as never, v.paquete as never, v.calculos as never));
    return { ...v, estado: "aprobada", para_dueno, aprobada_at: dia(3), aprobada_por: "00000000-0000-4000-8000-0000000000c1" };
  };
  const solicitud: Fila = { id: "s-preg", company_id: EMP, seccion: "preguntas_estrategia", nota: "Tu consultora te dejó unas preguntas para afinar tu plan.", estado: "activa", activada_at: dia(1), completada_at: null, retirada_at: null, activada_por: "00000000-0000-4000-8000-0000000000c1" };
  await hacer("vle-portal-plan", async () => {
    armarBase({ estrategias: [await aprobada()], estrategia_preguntas: await preguntas("enviada"), solicitudes_cliente: [solicitud] });
    estado.portal = { u: DUENA, companyId: EMP, empresa: { id: EMP, nombre: NOMBRE, etapa: "intervencion" }, queFalta: "", paso: 8, porValidar: 0, fuentes: 9, sesionesPend: 0, stats: null };
    const { default: Plan } = await import("@/app/(cliente)/portal/plan/page");
    writeFileSync(path.join(SALIDA, "vle-portal-plan.html"), pagina("Tu plan con el camino (arnés)", await portal("/portal/plan", async () => (await Plan()) as React.ReactElement)));
  });
  await hacer("vle-portal-preguntas", async () => {
    armarBase({ estrategias: [await aprobada()], estrategia_preguntas: await preguntas("enviada"), solicitudes_cliente: [solicitud] });
    estado.portal = { u: DUENA, companyId: EMP, empresa: { id: EMP, nombre: NOMBRE, etapa: "intervencion" }, queFalta: "", paso: 8, porValidar: 0, fuentes: 9, sesionesPend: 0, stats: null };
    const { default: Preguntas } = await import("@/app/(cliente)/portal/plan/preguntas/page");
    writeFileSync(path.join(SALIDA, "vle-portal-preguntas.html"), pagina("Preguntas para tu plan (arnés)", await portal("/portal/plan/preguntas", async () => (await Preguntas()) as React.ReactElement)));
  });

  writeFileSync(path.join(SALIDA, "vl-e-errores.txt"), errores.join("\n\n") || "sin errores");
  if (errores.length) console.log(errores.join("\n\n"));
}, 240_000);
