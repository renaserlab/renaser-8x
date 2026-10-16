import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrarError } from "@/lib/errores";
import { ROLES_DUENO } from "@/lib/actas";
import { fechaCorta } from "@/lib/textos";
import { acordadaVigente, vistaCliente, rutaConstancia, type FichaGuardada } from "@/lib/ficha-direccion";
import { DireccionCliente } from "@/components/direccion/DireccionCliente";
import { ConfirmarDireccion } from "@/components/direccion/AccionesDireccion";

export const dynamic = "force-dynamic";

/**
 * HACIA DÓNDE VA TU EMPRESA — la pantalla del dueño. Muestra SOLO la versión acordada con la consultora (el
 * filtro va en la consulta: un borrador nunca se lee aquí) y la muestra traducida en el servidor a sus palabras:
 * lo que dijo, lo que se acordó, lo que la consultora entendió y los números. Al final puede confirmarla: queda
 * guardado qué leyó, en qué versión y cuándo.
 */
export default async function DireccionPortal() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;

  const sb = supabaseAdmin();
  let ficha: FichaGuardada | null = null;
  let fallo = false;
  try {
    ficha = await acordadaVigente(c.companyId, sb);
  } catch (e) {
    // El dueño no ve un error técnico, pero el fallo no se pierde: queda en el registro que revisa la consultora.
    fallo = true;
    void registrarError({ ruta: "/portal/direccion", metodo: "GET", mensaje: e instanceof Error ? e.message : String(e), actorId: c.u.id, companyId: c.companyId });
  }

  const cabecera = (
    <>
      <p className="t-etiqueta">Lo que quieres para tu empresa</p>
      <h1 className="t-titulo mt-2 mb-2">Hacia dónde va tu empresa</h1>
    </>
  );

  if (!ficha)
    return (
      <>
        {cabecera}
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          {fallo
            ? "No pudimos abrir esta página ahora. Ya quedó anotado para tu consultora; vuelve a intentarlo en un rato."
            : "Tu consultora está ordenando lo que nos has contado sobre la empresa que quieres. Cuando lo revisen juntos, aparecerá aquí con tus propias palabras."}
        </p>
      </>
    );

  const vista = vistaCliente(ficha);
  const { data: actas } = await sb
    .from("actas_aceptacion")
    .select("id,aceptado_at")
    .eq("company_id", c.companyId)
    .eq("tipo", "ficha_direccion")
    .eq("referencia_id", ficha.id)
    .in("aceptado_rol", [...ROLES_DUENO])
    .order("aceptado_at", { ascending: false })
    .limit(1);
  const acta = actas?.[0] ?? null;
  const soloMira = c.u.rol === "consultor";

  return (
    <>
      {cabecera}
      <p className="t-cuerpo medida mb-2" style={{ color: "var(--grafito)" }}>
        Esto es lo que conversamos y acordamos contigo. Lo que va entre comillas son tus palabras, tal como las dijiste.
      </p>
      <p className="t-dato mb-8" style={{ color: "var(--grafito)" }}>
        Versión {vista.version}
        {vista.acordada_at ? ` · acordada el ${fechaCorta(vista.acordada_at)}` : ""}
      </p>

      <DireccionCliente vista={vista} />

      <section className="mt-10 no-imprimir" aria-labelledby="confirmar-direccion">
        <h2 id="confirmar-direccion" className="t-seccion mb-3">¿Es así?</h2>
        {acta ? (
          <p className="t-dato" style={{ color: "var(--confirmado)" }}>
            Confirmaste esta versión el {fechaCorta(acta.aceptado_at as string | null)}.{" "}
            <a href={rutaConstancia(String(acta.id))} style={{ textDecoration: "underline" }}>
              Ver mi constancia
            </a>
          </p>
        ) : soloMira ? (
          <p className="t-dato medida" style={{ color: "var(--grafito)" }}>
            Aquí el dueño confirma esta versión. Estás viendo el portal como lo ve él: desde esta vista no se confirma.
          </p>
        ) : (
          <ConfirmarDireccion companyId={c.companyId} fichaId={ficha.id} version={ficha.version} />
        )}
      </section>
    </>
  );
}
