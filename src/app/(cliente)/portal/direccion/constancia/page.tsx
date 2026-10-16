import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrarError } from "@/lib/errores";
import { ROLES_DUENO, rutaActa } from "@/lib/actas";
import { fecha, hora } from "@/lib/formato";
import { formatoDeEmpresa, leerVistaCliente } from "@/lib/ficha-direccion";
import { DireccionCliente } from "@/components/direccion/DireccionCliente";

export const dynamic = "force-dynamic";

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ActaLeida = { id: string; version: number; contenido: unknown; aceptado_nombre: string | null; aceptado_at: string | null };

/**
 * TU CONSTANCIA — lo que el dueño confirmó sobre hacia dónde va su empresa, EN PALABRAS. El acta guarda la ficha
 * tal como se le mostró (`vistaCliente`); aquí se vuelve a pintar igual, con la versión, el día y la hora en que
 * confirmó. Hasta el 13-10-2026 «Ver mi constancia» abría el documento del acta, que para la ficha solo sabía
 * enseñar ese contenido como datos en crudo. Ese documento (con su huella y la nota jurídica) sigue existiendo y
 * se enlaza al final, para imprimirlo.
 *
 * Solo se leen actas de la ficha de dirección, de SU empresa y confirmadas por el dueño: el filtro va en la
 * consulta. Con `?acta=` se abre esa; sin él, la más reciente.
 */
export default async function ConstanciaDireccion({ searchParams }: { searchParams: Promise<{ acta?: string }> }) {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const { acta: pedida } = await searchParams;
  const pedidaValida = typeof pedida === "string" && ES_UUID.test(pedida);

  const sb = supabaseAdmin();
  let acta: ActaLeida | null = null;
  let empresa: Record<string, unknown> | null = null;
  let fallo = false;
  try {
    const delDueno = sb
      .from("actas_aceptacion")
      .select("id,version,contenido,aceptado_nombre,aceptado_at")
      .eq("company_id", c.companyId)
      .eq("tipo", "ficha_direccion")
      .in("aceptado_rol", [...ROLES_DUENO]);
    const [actas, config] = await Promise.all([
      (pedidaValida ? delDueno.eq("id", pedida) : delDueno).order("aceptado_at", { ascending: false }).limit(1),
      sb.from("companies").select("pais,moneda,idioma,zona_horaria").eq("id", c.companyId).maybeSingle(),
    ]);
    if (actas.error) throw new Error(actas.error.message);
    acta = ((actas.data ?? []) as ActaLeida[])[0] ?? null;
    empresa = (config.data as Record<string, unknown> | null) ?? null;
  } catch (e) {
    // El dueño no ve un error técnico, pero el fallo no se pierde: queda en el registro que revisa la consultora.
    fallo = true;
    void registrarError({ ruta: "/portal/direccion/constancia", metodo: "GET", mensaje: e instanceof Error ? e.message : String(e), actorId: c.u.id, companyId: c.companyId });
  }

  const cabecera = (
    <>
      <p className="t-etiqueta">Lo que confirmaste</p>
      <h1 className="t-titulo mt-2 mb-2">Tu constancia</h1>
    </>
  );
  const volver = (
    <Link href="/portal/direccion" style={{ textDecoration: "underline" }}>
      Volver a «Hacia dónde va tu empresa»
    </Link>
  );

  if (!acta)
    return (
      <>
        {cabecera}
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          {fallo
            ? "No pudimos abrir tu constancia ahora. Ya quedó anotado para tu consultora; vuelve a intentarlo en un rato."
            : pedidaValida
              ? "No encontramos esa constancia en tu empresa."
              : "Todavía no has confirmado ninguna versión. Cuando confirmes hacia dónde va tu empresa, aquí quedará lo que leíste."}
        </p>
        <p className="t-dato mt-4">{volver}</p>
      </>
    );

  // El día y la hora, en la zona horaria que la empresa declaró: una confirmación de noche no cambia de día.
  const formato = formatoDeEmpresa(empresa);
  const cuando = acta.aceptado_at ? `el ${fecha(acta.aceptado_at, formato, "larga")} a las ${hora(acta.aceptado_at, formato)}` : "sin fecha registrada";
  const vista = leerVistaCliente(acta.contenido);

  return (
    <>
      {cabecera}
      <p className="t-cuerpo medida mb-2" style={{ color: "var(--grafito)" }}>
        Esto es lo que tenías delante cuando confirmaste, tal como se te mostró. Lo que va entre comillas son tus palabras.
      </p>
      <p className="t-dato mb-8" style={{ color: "var(--grafito)" }}>
        Versión {acta.version} · confirmada {cuando}
        {acta.aceptado_nombre ? ` por ${acta.aceptado_nombre}` : ""}
      </p>

      {vista ? (
        <DireccionCliente vista={vista} />
      ) : (
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          No pudimos mostrar aquí lo que confirmaste. No se perdió: está guardado en el documento completo, que puedes abrir con el enlace de abajo.
        </p>
      )}

      <section className="mt-10 no-imprimir" aria-labelledby="sobre-constancia">
        <h2 id="sobre-constancia" className="t-seccion mb-3">Qué es esta constancia</h2>
        <p className="t-dato medida" style={{ color: "var(--grafito)" }}>
          No es un contrato: es el registro de hacia dónde acordamos llevar tu empresa. Si hoy algo ya no es así, díselo a tu consultora. Se acuerda una versión nueva y esta queda guardada.
        </p>
        <p className="t-dato mt-3">
          <a href={rutaActa(acta.id)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
            Abrir el documento completo para imprimir
          </a>
        </p>
        <p className="t-dato mt-3">{volver}</p>
      </section>
    </>
  );
}
