import Link from "next/link";
import { contextoPortal } from "@/lib/portal";

export const dynamic = "force-dynamic";

const PASOS: { n: number; titulo: string; href: string; texto: string }[] = [
  { n: 2, titulo: "Subir lo que tengas", href: "/portal/documentos", texto: "Documentos, fotos del cuaderno, notas de voz." },
  { n: 3, titulo: "Conversar", href: "/portal/conversacion", texto: "Preguntas cortas. Hablando o escribiendo." },
  { n: 4, titulo: "Confirmar lo encontrado", href: "/portal/validar", texto: "¿Esto sigue siendo verdad? Tres botones." },
  { n: 5, titulo: "Tus procesos", href: "/portal/procesos", texto: "Los ves dibujados y los corriges." },
  { n: 7, titulo: "Tus resultados", href: "/portal/resultados", texto: "Lo que encontramos, con fuente y fecha." },
  { n: 8, titulo: "Tu implementación", href: "/portal/plan", texto: "45 días, frente por frente." },
];

/** Bienvenida: qué va a pasar, cuánto toma, qué recibe. Arriba, siempre, qué falta ahora. */
export default async function Portal() {
  const c = await contextoPortal();
  return (
    <>
      <p className="t-etiqueta">Qué falta ahora</p>
      <h1 className="t-titulo mt-2 mb-8 medida">{c.queFalta}</h1>

      {c.companyId && (
        <>
          {c.fuentes > 0 && (
            <p className="t-cuerpo mb-8 medida">
              Encontramos <strong>{c.stats?.afirmaciones ?? 0}</strong> definiciones sobre tu empresa en {c.fuentes} fuente(s).
              {Number(c.stats?.contradichas ?? 0) > 0 && <> Detectamos <strong>{c.stats?.contradichas}</strong> puntos donde lo que dice tu documentación no coincide con lo que nos contaste.</>}
            </p>
          )}
          <ol className="flex flex-col gap-3">
            {PASOS.map((p) => {
              const actual = p.n === c.paso;
              const hecho = p.n < c.paso;
              return (
                <li key={p.n}>
                  <Link href={p.href} className="panel p-4 flex items-start gap-4" style={{ borderColor: actual ? "var(--marca)" : "var(--linea)", opacity: hecho ? 0.7 : 1 }}>
                    <span className="t-dato" style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: hecho ? "var(--confirmado)" : actual ? "var(--tinta)" : "var(--suave)", color: hecho || actual ? "var(--papel)" : "var(--grafito)", flex: "none" }}>{hecho ? "✓" : PASOS.indexOf(p) + 1}</span>
                    <span>
                      <span className="t-seccion" style={{ fontSize: 18 }}>{p.titulo}</span>
                      <span className="block t-dato" style={{ color: "var(--grafito)" }}>{p.texto}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="t-dato mt-8 medida" style={{ color: "var(--grafito)" }}>
            Qué va a pasar: nos cuentas cómo funciona tu empresa, confirmamos lo que encontramos y tu consultor te entrega lo que descubrió, con evidencia. Toma poco tiempo cada vez y puedes hacerlo desde el celular.
          </p>
        </>
      )}
    </>
  );
}
