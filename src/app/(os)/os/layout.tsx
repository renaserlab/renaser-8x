import { contextoOS } from "@/lib/os/acceso";
import { gruposOS, CONSULTORIA, PERFIL_OS, AVISOS_OS } from "@/lib/os/menu";
import { avisosSinLeer } from "@/lib/os/datos";
import { iniciales } from "@/lib/os/calculos";
import { NavCliente } from "@/components/cliente/NavCliente";

export const dynamic = "force-dynamic";

/**
 * RENASER OS (19-10-2026): el mismo marco que el portal (barra noche a la izquierda, hoja a la derecha), con el menú
 * que le toca a cada uno. El dueño ve además los destinos de su consultoría; el personal, solo «Mi día». La barra de
 * avance de la ruta y la fila «En esta sección» son de la consultoría y aquí no van.
 */
export default async function LayoutOS({ children }: { children: React.ReactNode }) {
  const c = await contextoOS();
  const sinLeer = await avisosSinLeer(c).catch(() => 0);
  const quien = c.persona
    ? { href: PERFIL_OS, nombre: c.persona.nombre, sub: "Mi perfil", iniciales: iniciales(c.persona.nombre) }
    : undefined;
  return (
    <div className="marco-app">
      <NavCliente
        enlaces={c.consultoria ? CONSULTORIA : []}
        grupos={gruposOS(c)}
        empresa={c.empresa}
        avisos={sinLeer ? { [AVISOS_OS[0]]: sinLeer } : undefined}
        perfil={quien}
      />
      <div className="columna-app">
        {c.vistaConsultor && (
          <div className="aviso-vista no-imprimir">
            <span>Estás viendo el equipo de {c.empresa} como lo ven ellos</span>
            <a href="/pulso">Volver al pulso de empresas</a>
          </div>
        )}
        <main className="contenido-app">
          <div className="hoja">{children}</div>
        </main>
      </div>
    </div>
  );
}
