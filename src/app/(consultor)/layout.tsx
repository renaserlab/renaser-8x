import Link from "next/link";
import { requerirConsultor } from "@/lib/auth";

export default async function LayoutConsultor({ children }: { children: React.ReactNode }) {
  const u = await requerirConsultor();
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="no-imprimir flex items-center justify-between px-6 h-14" style={{ borderBottom: "1px solid var(--linea)" }}>
        <div className="flex items-center gap-8">
          <Link href="/bandeja" className="t-etiqueta" style={{ color: "var(--tinta)" }}>8X</Link>
          <Link href="/bandeja" className="t-dato">Bandeja</Link>
          <Link href="/empresas" className="t-dato">Empresas</Link>
          <Link href="/casos" className="t-dato">Casos</Link>
        </div>
        <form action="/api/auth/salir" method="post" className="flex items-center gap-4">
          <span className="t-dato" style={{ color: "var(--grafito)" }}>{u.nombre ?? u.email}</span>
          <button className="boton boton--secundario" style={{ minHeight: 36 }}>Salir</button>
        </form>
      </nav>
      <main className="flex-1 px-6 py-8 w-full" style={{ maxWidth: 1280, margin: "0 auto" }}>{children}</main>
    </div>
  );
}
