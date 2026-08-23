import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { empresaHoy } from "@/lib/hoy";

export const dynamic = "force-dynamic";

/**
 * Entrada simple (fase 5 y 32): en 15 segundos se entiende qué es esto, se puede empezar sin manual,
 * y apenas hay señal aparece el primer espejo ("ya encontramos N cosas que vale la pena mirar").
 */
export default async function Portal() {
  const c = await contextoPortal();
  if (!c.companyId)
    return (
      <>
        <h1 className="t-titulo mt-2 mb-4 medida">Vamos a entender cómo funciona realmente tu empresa</h1>
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>{c.queFalta}</p>
      </>
    );

  const hoy = await empresaHoy(c.companyId);
  const cosas = hoy.espejo.length + hoy.noVes.length + hoy.fortalezas.length;

  const PASOS: { titulo: string; href: string; texto: string; hecho: boolean; actual: boolean }[] = [
    { titulo: "Cuéntanos cómo funciona", href: "/portal/conversacion", texto: "Preguntas cortas, hablando o escribiendo. Sin respuestas buenas ni malas.", hecho: (c.sesionesPend ?? 0) === 0, actual: c.paso === 3 },
    { titulo: "Sube lo que tengas", href: "/portal/documentos", texto: "Documentos, fotos del cuaderno, notas de voz. No necesitas nada perfecto.", hecho: (c.fuentes ?? 0) > 0, actual: c.paso === 2 },
    { titulo: "Confirma lo que encontramos", href: "/portal/validar", texto: "Donde una cosa no cuadra con otra, tú decides cuál vale hoy.", hecho: (c.porValidar ?? 0) === 0 && cosas > 0, actual: c.paso === 4 },
    { titulo: "Tus procesos, dibujados", href: "/portal/procesos", texto: "Los ves como un mapa y los corriges si algo no es así.", hecho: false, actual: c.paso === 5 },
  ];

  return (
    <>
      {hoy.nivel === 0 ? (
        <>
          <h1 className="t-titulo mt-2 mb-4 medida">Vamos a entender cómo funciona realmente tu empresa</h1>
          <p className="t-cuerpo medida mb-2" style={{ color: "var(--grafito)" }}>
            En 15–20 minutos tendrás tu primer diagnóstico. No necesitas documentos perfectos: puedes hablar, subir fotos o simplemente contarnos cómo lo haces.
          </p>
          <div className="mt-6 mb-10">
            <Link href="/portal/conversacion" className="boton">Empezar</Link>
          </div>
        </>
      ) : (
        <>
          <p className="t-etiqueta">Qué falta ahora</p>
          <h1 className="t-titulo mt-2 mb-6 medida">{c.queFalta}</h1>
          {cosas > 0 && (
            <Link href="/portal/hoy" className="panel p-5 mb-8 block" style={{ borderColor: "var(--marca)" }}>
              <span className="t-seccion" style={{ fontSize: 18 }}>Ya encontramos {cosas} cosa{cosas === 1 ? "" : "s"} que vale la pena mirar</span>
              <span className="block t-dato mt-1" style={{ color: "var(--grafito)" }}>Mi empresa hoy: lo que entendimos, el espejo y por dónde empezar. Se actualiza solo.</span>
            </Link>
          )}
        </>
      )}

      <ol className="flex flex-col gap-3">
        {PASOS.map((p, i) => (
          <li key={p.href}>
            <Link href={p.href} className="panel p-4 flex items-start gap-4" style={{ borderColor: p.actual ? "var(--marca)" : "var(--linea)", opacity: p.hecho ? 0.65 : 1 }}>
              <span className="t-dato" style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: p.hecho ? "var(--confirmado)" : p.actual ? "var(--tinta)" : "var(--suave)", color: p.hecho || p.actual ? "var(--papel)" : "var(--grafito)", flex: "none" }}>
                {p.hecho ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7.5 5.5 11 12 3.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg> : i + 1}
              </span>
              <span>
                <span className="t-seccion" style={{ fontSize: 18 }}>{p.titulo}</span>
                <span className="block t-dato" style={{ color: "var(--grafito)" }}>{p.texto}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <p className="t-dato mt-8 medida" style={{ color: "var(--grafito)" }}>
        Con cada cosa que cuentas o subes, tu diagnóstico se afina en <Link href="/portal/hoy" style={{ textDecoration: "underline" }}>Mi empresa hoy</Link>. Puedes parar cuando quieras y volver desde el celular.
      </p>
    </>
  );
}
