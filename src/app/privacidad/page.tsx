import Link from "next/link";

export const metadata = { title: "Privacidad y tratamiento de datos · 8X" };

/**
 * POLÍTICA DE PRIVACIDAD — Ley 29733 de Protección de Datos Personales (Perú) y su reglamento.
 * Hallazgo medio de la auditoría del 29-08-2026: el aplicativo guarda datos personales de
 * trabajadores de empresas terceras (nombre, puesto, antigüedad, lo que dicen en entrevistas)
 * y no había ni política, ni consentimiento, ni plazo de conservación declarado.
 */
export const VERSION_PRIVACIDAD = "1.0";

const S = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section style={{ marginBottom: 26 }}>
    <h2 className="t-seccion mb-2">{t}</h2>
    <div className="t-cuerpo flex flex-col gap-2" style={{ color: "var(--tinta)" }}>{children}</div>
  </section>
);

export default function Privacidad() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 80px" }}>
      <p className="t-etiqueta" style={{ letterSpacing: "0.14em" }}>POLÍTICA DE PRIVACIDAD</p>
      <h1 className="t-titulo mt-2">Cómo tratamos los datos</h1>
      <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
        Versión {VERSION_PRIVACIDAD} · Vigente desde el 29 de agosto de 2026 · Ley N.° 29733 y su reglamento (D.S. 003-2013-JUS)
      </p>

      <div style={{ borderTop: "1px solid var(--linea)", margin: "24px 0 28px" }} />

      <S t="Quién es responsable">
        <p>
          <strong>RENASER</strong> es la responsable del banco de datos personales que alimenta 8X. Para cualquier
          asunto sobre tus datos, escribe a <strong>kelinmerma@gmail.com</strong>.
        </p>
      </S>

      <S t="Qué datos guardamos">
        <p><strong>De quien contrata:</strong> nombre, correo, teléfono y los datos de su empresa.</p>
        <p>
          <strong>De las personas entrevistadas:</strong> nombre, puesto, antigüedad y lo que responden en las
          entrevistas, en texto o en audio.
        </p>
        <p><strong>De la empresa:</strong> cifras de ventas, márgenes, procesos, incidencias y documentos que suba.</p>
        <p>
          <strong>Nunca pedimos</strong> datos sensibles: salud, origen étnico, convicciones religiosas o políticas,
          vida sexual, ni datos biométricos.
        </p>
      </S>

      <S t="Para qué los usamos">
        <p>
          Solo para diagnosticar y sistematizar la empresa que contrató el servicio: producir su informe, sus
          documentos y su plan. <strong>No vendemos datos, no los cedemos a terceros con fines comerciales y no
          entrenamos modelos de inteligencia artificial con ellos.</strong>
        </p>
      </S>

      <S t="Quién los procesa por nosotros">
        <p>
          Usamos tres proveedores, todos bajo contrato y fuera del Perú, lo que constituye flujo transfronterizo
          informado: <strong>Supabase</strong> (base de datos y archivos), <strong>Vercel</strong> (servidores del
          aplicativo) y <strong>Google</strong> (los modelos de inteligencia artificial que redactan los borradores).
          Google no conserva el contenido para entrenar sus modelos bajo el uso que le damos.
        </p>
      </S>

      <S t="Cuánto tiempo los conservamos">
        <p>
          Mientras dure el servicio y <strong>hasta 5 años después</strong> de terminado, que es el plazo en que un
          informe puede seguir siendo exigible o útil como antecedente. Cumplido el plazo, se eliminan. Si pides la
          baja antes, se eliminan dentro de los 10 días hábiles.
        </p>
      </S>

      <S t="Tus derechos (ARCO)">
        <p>
          Puedes pedir en cualquier momento <strong>acceder</strong> a tus datos, <strong>rectificarlos</strong>,{" "}
          <strong>cancelarlos</strong> u <strong>oponerte</strong> a su tratamiento. Dentro del aplicativo, el dueño
          corrige los datos de su empresa desde <em>Mi empresa → Corregir mis datos</em> y ve el historial completo de
          quién tocó qué en <em>Mi empresa → Historial</em>. Para acceder, exportar o eliminar todo, escribe al correo
          de arriba: respondemos en un máximo de 20 días hábiles.
        </p>
        <p>
          Si consideras que no atendimos bien tu solicitud, puedes reclamar ante la{" "}
          <strong>Autoridad Nacional de Protección de Datos Personales</strong> del Ministerio de Justicia.
        </p>
      </S>

      <S t="Cómo los protegemos">
        <p>
          Cada empresa solo puede ver lo suyo, y eso se controla en dos capas independientes: la aplicación y la propia
          base de datos. Los enlaces de entrevista caducan y tienen tope de usos; no guardamos su clave, solo una huella
          irreversible. Todo el tráfico va cifrado. Cada acceso y cada cambio queda registrado con autor y fecha.
        </p>
      </S>

      <S t="Consentimiento de quien es entrevistado">
        <p>
          Antes de la primera pregunta, a cada persona entrevistada se le dice qué se guarda, para qué y quién lo verá,
          y debe aceptarlo. <strong>Su respuesta no se usa para sancionarla</strong>: sirve para entender cómo funciona
          la empresa. Puede retirar su consentimiento avisando a la empresa o al correo de arriba.
        </p>
      </S>

      <div style={{ borderTop: "1px solid var(--linea)", paddingTop: 20 }}>
        <Link href="/" className="boton boton--secundario">Volver</Link>
      </div>
    </main>
  );
}
