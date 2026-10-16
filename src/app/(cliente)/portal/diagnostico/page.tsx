import { contextoPortal } from "@/lib/portal";
import { leerHechosDiagnostico } from "@/lib/diagnostico-datos";
import { armarDiagnostico } from "@/lib/diagnostico-tablero";
import { seccionesAbiertas } from "@/lib/solicitudes";
import { puedeLlenar } from "@/components/negocio/datos";
import { TableroDiagnostico } from "@/components/diagnostico/TableroDiagnostico";
import { CorregirDato, type QuienCorrige } from "@/components/cliente/CorregirDato";
import { SECCIONES_PARA_CORREGIR } from "@/lib/correccion-dato";

export const dynamic = "force-dynamic";

/*
CONTRATO DE DIRECCIÓN — Tu diagnóstico (pedido de Kelin, 16-10-2026)
THESIS: el dueño ve su empresa en una frase («Tu empresa hoy vende…, te quedan… y participas en…») y debajo los mismos
  cuatro bloques que ve su consultora, en sus palabras: tus procesos, tu tiempo, tu dinero y lo que encontramos.
OWN-WORLD: el tablero de Inicio: cielo, tarjetas blancas, Manrope en las cifras, rayado = sin dato.
STORY: «Esto es lo que tengo, esto es lo que encontraron, y si un dato no cuadra lo corrijo en un minuto».
FINISH: nada del trabajo de la consultora (ni dimensiones, ni áreas con puntaje, ni borradores): se filtra al leer
  (leerHechosDiagnostico con para «dueno»). Lo que no se pudo leer se dice; ningún «S/ 0» inventado.
*/

/**
 * TU DIAGNÓSTICO — el segundo destino del portal. El tablero lo arma src/lib/diagnostico-tablero.ts (el mismo de la
 * consultora, con `para: "dueno"`) y lo pinta TableroDiagnostico; aquí solo se pone la acción de cada dato que no
 * cuadra: «Corregir este dato» (CorregirDato), con botones solo si su consultora abrió «Confirmar lo que encontramos»
 * o «Los números que faltan», y solo en la cuenta del dueño (la consultora que mira «como el empresario» ve la tarjeta
 * sin botones).
 */
export default async function TuDiagnostico() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;

  const [hechos, abiertas, quien] = await Promise.all([
    leerHechosDiagnostico(c.companyId, { para: "dueno" }),
    // Si no se pudo leer qué está abierto, null: no se ofrecen botones (no se promete lo que la ruta rechazaría).
    seccionesAbiertas(c.companyId).catch(() => null),
    puedeLlenar(c.u, c.companyId),
  ]);
  const t = armarDiagnostico(hechos, "dueno");
  const corrige: QuienCorrige = quien.comoConsultora ? "consultora" : quien.puede ? "dueno" : "otro";
  // El aviso de arriba solo promete «Corrígelos en un minuto» si los botones de abajo van a salir (CorregirDato).
  const puedeCorregir = corrige === "dueno" && !!abiertas && SECCIONES_PARA_CORREGIR.some((s) => abiertas.includes(s));

  return <TableroDiagnostico t={t} base="/portal" puedeCorregir={puedeCorregir} accionIncongruencia={(i) => <CorregirDato i={i} abiertas={abiertas} quien={corrige} />} />;
}
