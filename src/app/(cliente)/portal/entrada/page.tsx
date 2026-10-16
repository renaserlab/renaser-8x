import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hayTranscriptor } from "@/lib/ai";
import { entradaDeUsuario, type EntradaDeUsuario } from "@/lib/entrada";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { EntradaBreve } from "@/components/cliente/EntradaBreve";

export const dynamic = "force-dynamic";

/**
 * LA ENTRADA BREVE (R7.1): la puerta del portal para una empresa nueva. Doce preguntas fijas, una a la vez,
 * que el dueño responde hablando, escribiendo, con un «no lo sé», con un «más o menos» o con un documento; lo
 * que ya sabíamos se confirma en vez de preguntarse; y al final revisa y confirma «lo que entendimos».
 *
 * La página solo lee: el estado se arma en el servidor (src/lib/entrada.ts) para que la primera pregunta
 * llegue pintada. El consultor en modo «ver como el empresario» mira y no puede responder.
 */
export default async function Entrada() {
  const c = await contextoPortal();
  if (!c.companyId) return <Vacio texto="Primero cuéntanos cómo se llama tu negocio. Es un minuto." accion="Crear mi empresa" href="/portal" />;

  let vista: EntradaDeUsuario;
  try {
    vista = await entradaDeUsuario(c.companyId, c.u, supabaseAdmin());
  } catch (e) {
    // Si la base todavía no tiene lo que la entrada necesita, se dice aquí y queda en el registro del
    // servidor con su causa. Una pantalla en blanco o un error crudo no le sirven al dueño.
    console.error(`[portal/entrada] ${e instanceof Error ? e.message : String(e)}`);
    return (
      <>
        <Encabezado titulo="Cuéntanos tu negocio" />
        <Vacio texto="Estas preguntas todavía no están disponibles para tu empresa. Avísale a tu consultor; mientras tanto puedes subir lo que tengas." accion="Subir documentos" href="/portal/activos" />
      </>
    );
  }

  const total = vista.estado.progreso.total;
  return (
    <>
      <Encabezado
        titulo="Cuéntanos tu negocio"
        sub={`${total} preguntas, una a la vez. Responde hablando o escribiendo; si algo no lo sabes, dilo. Todo se guarda: puedes parar y seguir después.`}
      />
      <EntradaBreve
        companyId={c.companyId}
        inicial={vista.estado}
        puedeResponder={vista.puedeResponder}
        motivoSoloLectura={vista.motivoSoloLectura}
        transcriptor={hayTranscriptor()}
      />
    </>
  );
}
