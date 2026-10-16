import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ETAPA } from "@/lib/textos";
import { configDe } from "@/lib/formato";
import { VISTAS, EXPEDIENTE } from "@/lib/vistas-empresa";
import { TabsEmpresa } from "@/components/consultor/TabsEmpresa";
import { EnEstaVista } from "@/components/consultor/EnEstaVista";
import { MenuAdministrar } from "@/components/consultor/MenuAdministrar";
import { AdministrarEmpresa } from "@/components/consultor/AdministrarEmpresa";
import { ConfiguracionEmpresa } from "@/components/consultor/ConfiguracionEmpresa";
import { Etapa } from "@/components/consultor/Etapa";
import { BarraRuta } from "@/components/navegacion/BarraRuta";
import { avanceDeEmpresa } from "@/lib/ruta-datos";

/**
 * LA EMPRESA, VISTA POR LA CONSULTORA (16-10-2026). Pedido de Kelin: «hace rato estaba simple y fácil: diagnóstico,
 * qué hay en números, indicadores y el avance progresivo… son muchas pestañas que deberían estar en una sola».
 *
 * Cinco vistas y el Expediente aparte (src/lib/vistas-empresa.ts), en lugar de 20 pestañas en tres capas. Ninguna
 * pantalla se borró: cada una vive dentro de una vista y se abre desde la fila «En esta vista». Lo vigila
 * tests/recorrido-conectado.test.ts: una carpeta con page.tsx bajo este directorio que no esté en las `sub` de una
 * vista hace fallar esa prueba.
 *
 * De arriba abajo (revisión del 16-10-2026: «sidebar + una columna fija» era una columna de más): el avance de la ruta
 * en UNA línea, la cabecera (nombre, «Ver como el empresario» y «Administrar»), las vistas en una barra horizontal bajo
 * el nombre —como el portal— con sus pantallas debajo, y la pantalla a todo lo ancho. La barra entera de la ruta, con
 * lo que falta para la compuerta, vive en Avance. La empresa vive sobre el cielo, como la bandeja: .empresa-marco apaga
 * la hoja del layout de la consultora (src/design/vistas.css).
 */

const COLUMNAS = "id,nombre,sector,etapa,estado_admision,ficha,pais,moneda,idioma,zona_horaria";
/** Si la base todavía no tiene las columnas de configuración, la empresa abre igual con las de siempre (y configDe pone Perú). */
const COLUMNAS_SIEMPRE = "id,nombre,sector,etapa,estado_admision,ficha";

type Empresa = {
  id: string;
  nombre: string;
  sector: string | null;
  etapa: string;
  estado_admision: string | null;
  ficha: { ciudad?: string; whatsapp?: string; meta_venta_mensual?: string } | null;
  pais?: string | null;
  moneda?: string | null;
  idioma?: string | null;
  zona_horaria?: string | null;
};

async function leerEmpresa(id: string): Promise<Empresa | null> {
  const sb = supabaseAdmin();
  const r = await sb.from("companies").select(COLUMNAS).eq("id", id).maybeSingle();
  if (!r.error) return (r.data as Empresa | null) ?? null;
  const legado = await sb.from("companies").select(COLUMNAS_SIEMPRE).eq("id", id).maybeSingle();
  return (legado.data as Empresa | null) ?? null;
}

/** El estado de admisión en la cabecera, solo si no está admitida. */
const ADMISION: Record<string, { texto: string; clase: string }> = {
  candidata: { texto: "Admisión por decidir", clase: "espera" },
  rechazada: { texto: "Admisión rechazada", clase: "alto" },
};

export default async function LayoutEmpresa({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  // La empresa y su avance se leen a la vez. La barra informa: si su lectura falla, la empresa abre igual.
  const [c, avance] = await Promise.all([
    leerEmpresa(id),
    avanceDeEmpresa(id).catch((e: unknown) => {
      console.error("[ruta] no se pudo leer el avance de la empresa", id, e);
      return "fallo" as const;
    }),
  ]);
  if (!c) notFound();
  const base = `/empresa/${id}`;
  const ficha = c.ficha ?? null;
  // Sin tipo de trabajo o sin fecha de inicio, la barra lleva a la ficha de trabajo (Diagnóstico); con ruta, a la ruta (Avance).
  const sinRuta = avance !== "fallo" && avance !== null && (!avance.tipo || !avance.inicio);
  const conRuta = avance !== "fallo" && avance !== null && !sinRuta;
  const enlace = sinRuta ? `${base}#ficha` : `${base}/avance#ruta`;
  const admision = c.estado_admision && c.estado_admision !== "admitida" ? (ADMISION[c.estado_admision] ?? { texto: `Admisión: ${c.estado_admision}`, clase: "espera" }) : null;
  const whatsapp = ficha?.whatsapp ? ficha.whatsapp.replace(/\D/g, "").replace(/^9/, "519") : null;
  const linea = [c.sector ?? "Sector sin definir", ficha?.ciudad].filter(Boolean).join(" · ");

  return (
    <div className="empresa-marco">
      {/* Arriba de todo, el avance de la empresa en su ruta, en una línea (pedido de Kelin, 16-10-2026). No es navegación. */}
      <BarraRuta avance={avance === "fallo" ? null : avance} fallo={avance === "fallo"} para="consultora" enlace={enlace} compacta />

      <header className="empresa-cabeza">
        <div className="empresa-cabeza__titulo">
          <Link href={base} className="empresa-cabeza__nombre">{c.nombre}</Link>
          <p className="empresa-cabeza__linea">
            <span>{linea}</span>
            {/* La fase del expediente solo cuando no hay ruta dibujada arriba: dos «etapas» lado a lado se leían como una contradicción. */}
            {!conRuta && <span className="estado neutro">{ETAPA[c.etapa] ?? c.etapa}</span>}
            {admision && <span className={`estado ${admision.clase}`}>{admision.texto}</span>}
          </p>
        </div>
        <div className="empresa-cabeza__acciones no-imprimir">
          <a href={`/api/consultor/ver-portal?empresa=${id}`} className="boton boton--secundario">Ver como el empresario</a>
          <MenuAdministrar>
            <div className="menu-administrar__fila">
              <span>Datos de la empresa<small>Nombre, sector y meta de venta; o eliminarla</small></span>
              <AdministrarEmpresa companyId={id} nombre={c.nombre} sector={c.sector} metaVenta={ficha?.meta_venta_mensual ?? null} />
            </div>
            <div className="menu-administrar__fila">
              {/* País, moneda y hora de la empresa (R16.3): se declara aquí; src/lib/formato.ts lo convierte en texto. */}
              <span>País, moneda y hora<small>Cómo se escriben sus cifras y sus fechas</small></span>
              <ConfiguracionEmpresa companyId={id} actual={configDe(c)} />
            </div>
            <div className="menu-administrar__fila">
              <Etapa companyId={id} etapa={c.etapa} />
            </div>
            {whatsapp && (
              <div className="menu-administrar__fila">
                <span>WhatsApp del dueño<small>Abre la conversación en otra pestaña</small></span>
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="boton boton--secundario">Escribirle</a>
              </div>
            )}
          </MenuAdministrar>
        </div>
      </header>

      {/* Las vistas en una barra bajo el nombre y, debajo, las pantallas de la vista abierta. Luego la pantalla, a todo lo ancho. */}
      <div className="empresa-navegacion no-imprimir">
        <TabsEmpresa base={base} vistas={VISTAS} expediente={EXPEDIENTE} />
        <EnEstaVista base={base} />
      </div>
      <div className="empresa-pantalla">
        <div className="empresa-contenido">{children}</div>
      </div>
    </div>
  );
}
