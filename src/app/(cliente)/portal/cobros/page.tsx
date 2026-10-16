import { contextoPortal } from "@/lib/portal";
import { configDeEmpresa } from "@/lib/producto";
import { leerFichaNegocio, listarOperacionesMoneda } from "@/lib/negocio-datos";
import { fugaCambiaria } from "@/lib/rentabilidad";
import { SECCION } from "@/lib/secciones";
import { CobrosYMercaderia, type FugaLeida } from "@/components/negocio/CobrosYMercaderia";
import { ListoParaConsultora } from "@/components/negocio/ListoParaConsultora";
import { pedidosDelDueno, seccionDe, puedeLlenar, leer, TEXTO_NO_SE_PUDO, TEXTO_SIN_PREPARAR, TEXTO_CERRADA_VACIA } from "@/components/negocio/datos";

export const dynamic = "force-dynamic";

const BLOQUES = ["moneda", "credito", "inventario"] as const;

/**
 * COBROS Y MERCADERÍA (16-10-2026). Tres preguntas de sí o no —¿te pagan en otra moneda?, ¿vendes al crédito?,
 * ¿guardas mercadería?— y cada «sí» abre su bloque. Para quien exporta: venta por venta, cuánto esperaba y cuánto
 * le llegó, y lo que se quedó en el camino (calculado en el servidor con fugaCambiaria, src/lib/rentabilidad.ts).
 * Cada bloque se escribe con su parte abierta por la consultora, o con «Lo que vendes» abierta y su «sí» dicho: los
 * módulos se encienden con una pregunta (la ruta exige lo mismo: exigirModulo en api/companies/[id]/negocio/_comun.ts).
 */
export default async function CobrosYMercaderiaPagina() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const companyId = c.companyId;
  const u = (c as { u?: { id: string; rol: string } }).u;

  const [pedidos, quien, ficha, operaciones, config] = await Promise.all([
    pedidosDelDueno(companyId),
    puedeLlenar(u, companyId),
    leer("la ficha del negocio", () => leerFichaNegocio(companyId)),
    leer("las ventas en otra moneda", () => listarOperacionesMoneda(companyId)),
    configDeEmpresa(companyId),
  ]);
  const lista = pedidos.ok ? pedidos.valor : null;
  const secciones = Object.fromEntries(BLOQUES.map((b) => [b, seccionDe(lista, b)])) as Record<(typeof BLOQUES)[number], ReturnType<typeof seccionDe>>;
  const productos = seccionDe(lista, "productos");

  const encabezado = (
    <>
      <p className="t-etiqueta">Tu empresa</p>
      <h1 className="t-titulo mt-2 mb-2">Cobros y mercadería</h1>
    </>
  );
  if (!ficha.ok) {
    return (
      <>
        {encabezado}
        <p className="t-cuerpo medida">{ficha.falta ? TEXTO_SIN_PREPARAR : TEXTO_NO_SE_PUDO}</p>
      </>
    );
  }

  const f = ficha.valor;
  const ops = operaciones.ok ? operaciones.valor : [];
  // Los módulos se encienden con una pregunta: con «Lo que vendes» abierta, el dueño contesta los tres sí/no, y un «sí»
  // le deja llenar ese bloque (la ruta exige lo mismo: exigirModulo). Con la sección del módulo abierta, también.
  const conProductos = !!productos.activa;
  const bloqueAbierto = (b: (typeof BLOQUES)[number]) => !!secciones[b].activa || (conProductos && f.modulos[b] === true);
  const puede = {
    moneda: bloqueAbierto("moneda") && quien.puede,
    credito: bloqueAbierto("credito") && quien.puede,
    inventario: bloqueAbierto("inventario") && quien.puede,
    modulos: quien.puede && (conProductos || BLOQUES.some((b) => !!secciones[b].activa)),
  };
  const algoAbierto = conProductos || BLOQUES.some((b) => !!secciones[b].activa);
  const algoGuardado = Object.values(f.modulos).some((v) => v != null) || [f.moneda, f.credito, f.inventario].some((b) => Object.keys(b).length > 0) || ops.length > 0;

  if (!algoAbierto && !algoGuardado) {
    return (
      <>
        {encabezado}
        <p className="t-cuerpo medida mb-4" style={{ color: "var(--grafito)" }}>
          Tres preguntas sobre cómo cobras: si te pagan en otra moneda, si vendes al crédito o fías, y si guardas mercadería o materiales.
        </p>
        <p className="t-cuerpo medida">{TEXTO_CERRADA_VACIA}</p>
      </>
    );
  }

  const fugas: Record<string, FugaLeida> = Object.fromEntries(
    ops.map((o) => {
      const x = fugaCambiaria(o);
      return [o.id, { esperado: x.esperado, total: x.total, motivos: x.motivos }];
    })
  );
  const notas = BLOQUES.map((b) => secciones[b].activa).filter((s): s is NonNullable<typeof s> => !!s?.nota);

  return (
    <>
      {encabezado}
      <div className="medida mb-7 flex flex-col gap-2">
        <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
          {algoAbierto ? "Responde sí o no; si es sí, se abren unas pocas preguntas más. Lo que no sepas, «No lo sé»: también sirve." : "Lo que respondiste sobre cómo cobras."}
        </p>
        {notas.map((s) => (
          <p key={s.id} className="t-cuerpo">Tu consultora te dice, sobre {SECCION[s.seccion].paraDueno.toLowerCase()}: «{s.nota}»</p>
        ))}
        {!operaciones.ok && <p className="t-dato" style={{ color: "var(--grafito)" }}>No pudimos leer tus ventas en otra moneda ahora: vuelve a cargar la página en un momento.</p>}
        {algoAbierto && !quien.puede && <p className="t-dato" style={{ color: "var(--grafito)" }}>Esto lo llena el dueño de la empresa o quien él designe. Tú puedes verlo.</p>}
      </div>
      <CobrosYMercaderia
        companyId={companyId}
        modo="dueno"
        modulos={f.modulos}
        moneda={f.moneda}
        credito={f.credito}
        inventario={f.inventario}
        operaciones={ops}
        fugas={fugas}
        puede={puede}
        config={config}
        usuarioId={u?.id ?? null}
      />
      {BLOQUES.map((b) => (
        <ListoParaConsultora
          key={b}
          companyId={companyId}
          solicitudId={secciones[b].activa?.id ?? null}
          completadaAt={secciones[b].completada?.completada_at ?? null}
          puede={quien.puede}
          comoConsultora={quien.comoConsultora}
          zona={config.zona_horaria}
          que={SECCION[b].paraDueno}
        />
      ))}
    </>
  );
}
