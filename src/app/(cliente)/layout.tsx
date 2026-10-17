import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requerirCliente, resolverEmpresaActiva } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NavCliente } from "@/components/cliente/NavCliente";
import { EnEstaSeccion } from "@/components/cliente/EnEstaSeccion";
import { BarraRutaCliente } from "@/components/cliente/BarraRutaCliente";
import { Logo8X } from "@/components/base/Logo8X";
import { seccionesAbiertas, pantallasOcultas, pantallasSinPedido } from "@/lib/solicitudes";
import { negocioDeEmpresa } from "@/lib/ruta-datos";
import { ElegirEmpresa } from "./portal/elegir-empresa/ElegirEmpresa";

export default async function LayoutCliente({ children }: { children: React.ReactNode }) {
  const u = await requerirCliente();
  let companyId: string | null;
  let vistaConsultor = false;
  // «Cambiar de empresa» solo se ofrece a quien tiene más de una. La consultora que mira «como el empresario» no elige aquí.
  let variasEmpresas = false;
  if (u.rol === "consultor") {
    companyId = (await cookies()).get("ver_como")?.value || null;
    if (!companyId) redirect("/bandeja");
    vistaConsultor = true;
  } else {
    const r = await resolverEmpresaActiva(u.id);
    companyId = r.companyId;
    variasEmpresas = r.empresas.length > 1;
    if (r.estado === "ambigua") {
      // VARIAS EMPRESAS Y NINGUNA ELEGIDA: se pregunta aquí mismo, antes de pintar cualquier página.
      // No se redirige a /portal/elegir-empresa porque esa página vive dentro de este mismo layout y
      // la redirección se perseguiría a sí misma. La página existe igual: sirve para cambiar después.
      const { data: lista } = await supabaseAdmin().from("companies").select("id,nombre").in("id", r.empresas).order("nombre");
      return (
        <div className="min-h-screen flex flex-col">
          <header className="cabecera-app sin-pildora no-imprimir">
            <span className="marca-app">
              <Logo8X variante="tinta" alto={24} />
            </span>
            <div className="acciones-app">
              <form action="/api/auth/salir" method="post">
                <button className="boton boton--secundario">Salir</button>
              </form>
            </div>
          </header>
          <main className="flex-1 px-4 py-6 w-full" style={{ maxWidth: 1100, margin: "0 auto" }}>
            <h1 className="t-titulo mt-2 mb-2 medida">¿Con cuál de tus empresas quieres trabajar?</h1>
            <p className="t-cuerpo mb-6 medida" style={{ color: "var(--grafito)" }}>Tienes más de una empresa en 8X. Elige una; podrás cambiar cuando quieras.</p>
            <ElegirEmpresa empresas={lista ?? []} activa={null} />
          </main>
        </div>
      );
    }
  }
  // La empresa, qué pedidos de la consultora siguen abiertos y qué tiene guardado, a la vez. Lo abierto da el contador
  // junto a «Inicio» y, con lo guardado, qué pantallas de «Tus números» le tocan hoy al dueño: las que su consultora
  // abrió o en las que ya guardó algo (pantallasOcultas). Lo guardado sale de la caché de la ruta (negocioDeEmpresa),
  // no de otra lectura. Si algo no se pudo leer, no hay contador (nunca un cero inventado) y no se esconde nada.
  const [empresa, abiertasAhora, negocio] = companyId
    ? await Promise.all([
        supabaseAdmin().from("companies").select("nombre").eq("id", companyId).single().then((r) => r.data),
        seccionesAbiertas(companyId).catch(() => null),
        negocioDeEmpresa(companyId).catch(() => null),
      ])
    : [null, null, null];
  const abiertas = abiertasAhora ? abiertasAhora.length : null;
  // Y «Preguntas para tu plan» solo con preguntas enviadas: sin su pedido abierto sería una página vacía (pantallasSinPedido).
  const ocultar = [...pantallasOcultas(abiertasAhora, negocio?.guardado ?? null), ...pantallasSinPedido(abiertasAhora)];
  // CINCO DESTINOS (pedido de Kelin, 16-10-2026: «hace rato estaba simple y fácil: diagnóstico, qué hay en números,
  // indicadores y el avance… son muchas pestañas»). Lo que hay hoy (Inicio), lo que encontramos (Tu diagnóstico),
  // cuánto (Tus números), cómo se hace (Tus procesos) y qué haremos (Tu plan, con los indicadores dentro). Conversar no
  // es un destino: es la ACCIÓN principal (el botón de Inicio). Las demás pantallas viven DENTRO de uno de los cinco y
  // se alcanzan desde la fila «En esta sección» (EnEstaSeccion, montada una sola vez aquí abajo): cuando nace una
  // pantalla la barra no crece; se anota en el mapa GRUPO de NavCliente y en esa fila. Ninguna pantalla se borró:
  // «Mi empresa» y «Tus documentos» siguen abriendo en su dirección de siempre, dentro de un destino.
  const enlaces = [
    ["/portal", "Inicio"],
    ["/portal/diagnostico", "Tu diagnóstico"],
    ["/portal/numeros", "Tus números"],
    ["/portal/procesos", "Tus procesos"],
    ["/portal/plan", "Tu plan"],
  ];
  return (
    <div className="marco-app">
      {companyId && <NavCliente enlaces={enlaces as [string, string][]} empresa={empresa?.nombre} avisos={abiertas ? { "/portal": abiertas } : undefined} />}
      <div className="columna-app">
        {!companyId && (
          <header className="cabecera-app sin-pildora no-imprimir">
            <span className="marca-app">
              <Logo8X variante="tinta" alto={24} />
              <small className="marca-app__empresa">Tu empresa</small>
            </span>
            <div className="acciones-app">
              <form action="/api/auth/salir" method="post">
                <button className="boton boton--secundario">Salir</button>
              </form>
            </div>
          </header>
        )}
        {vistaConsultor && (
          <div className="aviso-vista no-imprimir">
            <span>Estás viendo el portal como lo ve el empresario</span>
            <a href="/api/consultor/ver-portal?salir=1">Volver a mi bandeja</a>
          </div>
        )}
        {/* Arriba, el avance de la empresa en su ruta (no es navegación). Sin tipo de trabajo elegido no se pinta. */}
        {companyId && <BarraRutaCliente companyId={companyId} />}
        <main className="contenido-app">
          {companyId && <EnEstaSeccion variasEmpresas={variasEmpresas} ocultar={ocultar} />}
          <div className="hoja">{children}</div>
        </main>
      </div>
    </div>
  );
}
