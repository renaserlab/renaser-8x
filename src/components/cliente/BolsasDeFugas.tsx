import { BOLSA, BOLSAS, cifraDeFuga, montoDeBolsa, porMes, type Fugas } from "@/lib/perdida";

/** «a, b y c»: lo que falta, dicho como se habla. */
const juntar = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** ¿Hay algo que mostrar en alguna bolsa? Sin nada medido, la sección no se pinta (los números que faltan se piden arriba). */
export const hayAlgoEnLasBolsas = (f: Fugas) => BOLSAS.some((b) => f[b].fugas.length > 0 || f[b].revisado.length > 0);

/**
 * LAS TRES BOLSAS DE FUGAS (src/lib/perdida.ts), una debajo de otra y NUNCA sumadas: lo que se te está yendo (la única
 * en grande y con color de alarma), tu tiempo y lo que podrías vender. Cada cifra con de dónde sale; sin dato, rayado
 * y dicho, nunca «S/ 0». La usan «Mi empresa hoy» y el informe.
 */
export function BolsasDeFugas({ fugas, Encabezado = "h2" }: { fugas: Fugas; Encabezado?: "h2" | "h3" | "h4" }) {
  return (
    <div className="flex flex-col gap-8">
      {BOLSAS.map((b) => {
        const bolsa = fugas[b];
        const monto = montoDeBolsa(bolsa);
        return (
          <div key={b}>
            <Encabezado className="t-etiqueta mb-1">{BOLSA[b].titulo}</Encabezado>
            <p className="t-dato mb-2" style={{ color: "var(--grafito)" }}>{BOLSA[b].que_es}</p>
            {monto ? (
              b === "caja" ? (
                <p className="num-grande" style={{ color: "var(--contradicho)" }}>
                  ~{monto} <span className="t-cuerpo" style={{ color: "var(--grafito)", fontFamily: "var(--font-ui)" }}>{porMes(b)}</span>
                </p>
              ) : (
                <p className="t-cuerpo"><strong>{monto}</strong> {porMes(b)}</p>
              )
            ) : (
              bolsa.revisado.length === 0 && <p className="sin-dato">{BOLSA[b].sin_dato}</p>
            )}
            {bolsa.revisado.map((r) => (
              <p key={r} className="t-cuerpo">{conMayuscula(r)}.</p>
            ))}
            {bolsa.fugas.length > 0 && (
              <ul className="lista-editorial mt-3">
                {bolsa.fugas.map((f) => (
                  <li key={f.concepto}>
                    <span className="t-cuerpo" style={{ fontWeight: 550 }}>{f.concepto} · {cifraDeFuga(f)}</span>
                    <span className="block t-dato" style={{ color: "var(--grafito)" }}>De dónde sale: {f.base}.</span>
                  </li>
                ))}
              </ul>
            )}
            {bolsa.faltan.length > 0 && (
              <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Para medirla falta: {juntar(bolsa.faltan)}.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
