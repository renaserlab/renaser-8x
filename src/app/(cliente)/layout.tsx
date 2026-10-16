import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requerirCliente, resolverEmpresaActiva } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NavCliente } from "@/components/cliente/NavCliente";
import { EnEstaSeccion } from "@/components/cliente/EnEstaSeccion";
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
          <header className="no-imprimir px-4 flex items-center justify-end" style={{ paddingTop: "max(env(safe-area-inset-top), 10px)", paddingBottom: 8 }}>
            <form action="/api/auth/salir" method="post">
              <button className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--grafito)", padding: "4px 0", font: "inherit" }}>Salir</button>
            </form>
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
  const empresa = companyId ? (await supabaseAdmin().from("companies").select("nombre").eq("id", companyId).single()).data : null;
  // CINCO DESTINOS, NO OCHO (pedido de Kelin: "que no salga lo mismo en todos lados").
  // Conversar sale de la barra: es la ACCIÓN principal (el botón de Inicio), no un lugar.
  // Procesos entra como destino propio. Las demás pantallas viven DENTRO de uno de los cinco y se
  // alcanzan desde la fila «En esta sección» (EnEstaSeccion, montada una sola vez aquí abajo): cuando
  // nace una pantalla la barra no crece; se anota en el mapa GRUPO de NavCliente y en esa fila.
  const enlaces = [
    ["/portal", "Inicio"],
    ["/portal/hoy", "Mi empresa"],
    ["/portal/procesos", "Procesos"],
    ["/portal/activos", "Tus documentos"],
    ["/portal/plan", "Plan"],
  ];
  return (
    <div className="min-h-screen flex flex-col">
      {companyId && <NavCliente enlaces={enlaces as [string, string][]} empresa={empresa?.nombre} />}
      {!companyId && (
        <header className="cabecera-app sin-pildora no-imprimir">
          <span className="marca-app">8X <small>Tu empresa</small></span>
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
      {/* En celular la píldora flota abajo: .contenido-app deja aire debajo (con la zona segura del iPhone). */}
      <main className="contenido-app flex-1">
        {companyId && <EnEstaSeccion variasEmpresas={variasEmpresas} />}
        <div className="hoja">{children}</div>
      </main>
    </div>
  );
}
