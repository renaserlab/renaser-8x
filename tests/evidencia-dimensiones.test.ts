/**
 * VER LA TIENDA NO PRUEBA EL MARGEN; DOS PAPELES DEL MISMO AUTOR SON UNA VOZ.
 *
 * Hasta el 13-10-2026 la evidencia tenía una sola perilla: la fuerza de la fuente por su tipo. Una observación
 * del consultor era «fuerte» para cualquier conclusión, dos documentos contaban como dos fuentes aunque los
 * hubiera escrito la misma persona, y una afirmación sin confirmar simplemente no existía para el diagnóstico
 * (186 de 192 afirmaciones de documentos de clientes reales nunca llegaron a él).
 *
 * Dirección pidió separar las dimensiones (sección 10): origen, tipo, autor, período, fidelidad de la extracción,
 * confirmación de lo declarado, comprobación del hecho, independencia, vigencia y confianza. Y que el impacto
 * POTENCIAL (qué tan grave sería si es cierto) viva aparte de la CONFIANZA (qué tan seguro es), para que un
 * riesgo grave pendiente de corroborar se vea como tal en vez de desaparecer rebajado a «medio».
 *
 * Segunda pasada tras la verificación: en una entrevista la voz es la persona entrevistada (el autor de la fuente no
 * la pisa); el período que cubre la fuente pesa como antigüedad; y un hallazgo provisional se rotula «por corroborar»
 * aunque un dato fuerte le haya dejado el impacto en alto.
 *
 * Todo lo de aquí es regla escrita, sin modelo: cada número tiene su porqué en rules/evidencia.ts.
 */
import { describe, it, expect } from "vitest";
import {
  fuerzaFuente,
  fuentesIndependientes,
  vigencia,
  confianzaDeHallazgo,
  calibrarImpacto,
  esProvisional,
  nivelConfianza,
  esRiesgoGravePendiente,
  porCorroborar,
  esAntigua,
  naturalezaDeHallazgo,
  type ClaimEvidencia,
} from "@/lib/rules/evidencia";
import { claimComoEvidencia } from "@/lib/db/queries";

const ev = (id: string, o: Partial<ClaimEvidencia> = {}): ClaimEvidencia => ({ id, source_id: `src-${id}`, participant_id: null, estado: "sin_verificar", source_tipo: "documento", ...o });
const visita = (id: string, o: Partial<ClaimEvidencia> = {}): ClaimEvidencia => ev(id, { source_tipo: "observacion", source_origen: "consultor", ...o });
const HOY = "2026-10-13";

describe("una observación del consultor no es fuerte para cualquier conclusión", () => {
  it("sobre lo observable (operativo, organizativo) sigue siendo fuerte", () => {
    expect(fuerzaFuente(visita("a"), "operativa")).toBe("strong");
    expect(fuerzaFuente(visita("a"), "organizativa")).toBe("strong");
  });
  it("sobre dinero o ventas vale medium: ver la tienda no prueba el margen", () => {
    expect(fuerzaFuente(visita("a"), "financiera")).toBe("medium");
    expect(fuerzaFuente(visita("a"), "comercial")).toBe("medium");
    // La naturaleza también puede viajar dentro del claim.
    expect(fuerzaFuente(visita("a", { naturaleza_conclusion: "financiera" }))).toBe("medium");
  });
  it("sin naturaleza declarada rige la regla anterior, para no cambiar lo ya calculado", () => {
    expect(fuerzaFuente(visita("a"))).toBe("strong");
  });
  it("un dato sigue siendo fuerte para todo, y la observación del cliente sigue siendo débil para todo", () => {
    expect(fuerzaFuente(ev("a", { source_tipo: "dato" }), "financiera")).toBe("strong");
    expect(fuerzaFuente(ev("a", { source_tipo: "observacion", source_origen: "cliente" }), "operativa")).toBe("weak");
  });
  it("la naturaleza se deduce de lo que el hallazgo ya tiene, sin leer su texto", () => {
    expect(naturalezaDeHallazgo({ pilar: "producto", dimension: "margen" })).toBe("financiera");
    expect(naturalezaDeHallazgo({ pilar: "procesos", patron: "cuello_financiero_invisible" })).toBe("financiera");
    expect(naturalezaDeHallazgo({ pilar: "marketing", dimension: "canales" })).toBe("comercial");
    expect(naturalezaDeHallazgo({ pilar: "procesos", patron: "canal_unico" })).toBe("comercial");
    expect(naturalezaDeHallazgo({ pilar: "personas", dimension: "liderazgo" })).toBe("organizativa");
    expect(naturalezaDeHallazgo({ pilar: "procesos", dimension: "retrabajo" })).toBe("operativa");
  });
});

describe("dos documentos no son necesariamente independientes", () => {
  it("dos documentos del mismo autor = UNA fuente, aunque sean archivos distintos", () => {
    expect(fuentesIndependientes([ev("a", { source_autor: "Rosa Quispe" }), ev("b", { source_autor: " rosa quispe" })])).toBe(1);
  });
  it("dos documentos de autores distintos = dos fuentes", () => {
    expect(fuentesIndependientes([ev("a", { source_autor: "Rosa Quispe" }), ev("b", { source_autor: "Contador externo" })])).toBe(2);
  });
  it("sin autor conocido se agrupa como antes: por persona entrevistada o por documento", () => {
    expect(fuentesIndependientes([ev("a"), ev("b")])).toBe(2);
    expect(fuentesIndependientes([ev("a", { participant_id: "p1", source_id: "ent" }), ev("b", { participant_id: "p1", source_id: "ent" })])).toBe(1);
  });
  it("en una entrevista la voz es la persona entrevistada: dos personas distintas con el mismo autor de fuente siguen siendo dos", () => {
    // Si el extractor pusiera al consultor como autor de todas las entrevistas, antes todas colapsaban en una.
    const entrevista = (id: string, persona: string) => ev(id, { source_tipo: "entrevista", participant_id: persona, source_id: `ent-${persona}`, source_autor: "Consultor RENASER" });
    expect(fuentesIndependientes([entrevista("a", "dueno"), entrevista("b", "jefa-tienda")])).toBe(2);
    expect(fuentesIndependientes([entrevista("a", "dueno"), entrevista("b", "dueno")])).toBe(1);
  });
  it("el autor agrupa papeles, fotos, observaciones y fuentes de tipo desconocido; un dato es el registro, no su autor", () => {
    expect(fuentesIndependientes([ev("a", { source_tipo: "foto", source_autor: "Rosa" }), ev("b", { source_tipo: "observacion", source_origen: "cliente", source_autor: "rosa" })])).toBe(1);
    // Ante la duda de qué es la fuente, el autor agrupa: menos fuentes, no más.
    expect(fuentesIndependientes([ev("a", { source_tipo: null, source_autor: "Rosa" }), ev("b", { source_tipo: null, source_autor: "Rosa" })])).toBe(1);
    expect(fuentesIndependientes([ev("a", { source_tipo: "dato", source_autor: "Rosa" }), ev("b", { source_tipo: "dato", source_autor: "Rosa" })])).toBe(2);
  });
  it("límite honesto: un papel firmado por Rosa y una entrevista a Rosa no se pueden unir sin un vínculo que hoy no existe", () => {
    expect(fuentesIndependientes([ev("a", { source_autor: "Rosa Quispe" }), ev("b", { source_tipo: "entrevista", participant_id: "rosa", source_id: "ent" })])).toBe(2);
  });
  it("el autor pesa en la calibración: tres papeles del dueño no sostienen un impacto alto", () => {
    const tres = ["a", "b", "c"].map((id) => ev(id, { source_autor: "El dueño", estado: "confirmado" }));
    const r = calibrarImpacto("alto", tres, true);
    expect(r.fuentes).toBe(1);
    expect(r.impacto).toBe("medio");
    expect(r.requiere_validacion).toBe(true);
  });
});

describe("vigencia: hasta cuándo vale lo afirmado es una dimensión propia", () => {
  it("con fecha de caducidad futura está vigente; pasada, caducó; sin fecha, no se asume nada", () => {
    expect(vigencia(ev("a", { vigente_hasta: "2027-01-01" }), HOY)).toBe("vigente");
    expect(vigencia(ev("a", { vigente_hasta: "2025-12-31" }), HOY)).toBe("caducado");
    expect(vigencia(ev("a"), HOY)).toBe("sin_fecha");
  });
  it("el estado caducado manda aunque la fecha diga otra cosa; el día límite todavía vale", () => {
    expect(vigencia(ev("a", { estado: "caducado", vigente_hasta: "2027-01-01" }), HOY)).toBe("caducado");
    expect(vigencia(ev("a", { vigente_hasta: HOY }), HOY)).toBe("vigente");
  });
  it("una afirmación confirmada cuyo vigente_hasta pasó ya no sostiene el impacto", () => {
    const r = calibrarImpacto("alto", [ev("a", { estado: "confirmado", source_tipo: "dato", vigente_hasta: "2025-01-01" })], true, { hoy: HOY });
    expect(r.impacto).toBe("bajo");
    expect(r.motivo).toBe("Sin evidencia vigente");
  });
});

describe("confianza del hallazgo: sube con confirmación y comprobación, baja con fidelidad baja o caducidad", () => {
  it("un documento solo, sin confirmar: confianza baja y el motivo lo dice con sus palabras", () => {
    const r = confianzaDeHallazgo([ev("a")], HOY);
    expect(r.confianza).toBe(0.2);
    expect(nivelConfianza(r.confianza)).toBe("baja");
    expect(r.provisional).toBe(true);
    expect(r.motivo).toContain("se apoya en 1 afirmación de documento no confirmada");
    expect(r.motivo).toContain("una sola fuente");
  });
  it("tres afirmaciones de documentos sin confirmar: el motivo cuenta las tres", () => {
    const r = confianzaDeHallazgo([ev("a"), ev("b"), ev("c")], HOY);
    expect(r.motivo).toContain("se apoya en 3 afirmaciones de documentos no confirmadas");
    expect(r.provisional).toBe(true);
  });
  it("confirmar lo declarado sube; comprobar el hecho contra un dato sube más", () => {
    const sola = confianzaDeHallazgo([ev("a")], HOY).confianza;
    const confirmada = confianzaDeHallazgo([ev("a", { estado: "confirmado" })], HOY).confianza;
    const comprobada = confianzaDeHallazgo([ev("a", { estado: "confirmado", comprobacion: "comprobado_con_dato" })], HOY).confianza;
    expect(confirmada).toBeGreaterThan(sola);
    expect(comprobada).toBeGreaterThan(confirmada);
    expect(nivelConfianza(confirmada)).toBe("media");
    expect(nivelConfianza(comprobada)).toBe("alta");
  });
  it("comprobar sin confirmar sube la confianza pero NO quita lo provisional: son dimensiones distintas", () => {
    const r = confianzaDeHallazgo([ev("a", { comprobacion: "comprobado_con_dato" })], HOY);
    expect(r.confianza).toBeGreaterThan(0.2);
    expect(r.provisional).toBe(true);
    expect(esProvisional([ev("a", { comprobacion: "comprobado_con_dato" })])).toBe(true);
    expect(esProvisional([ev("a"), ev("b", { estado: "confirmado" })])).toBe(false);
  });
  it("dos fuentes independientes suben; dos papeles del mismo autor no", () => {
    const base = confianzaDeHallazgo([ev("a", { estado: "confirmado" })], HOY).confianza;
    const dos = confianzaDeHallazgo([ev("a", { estado: "confirmado" }), ev("b", { estado: "confirmado" })], HOY).confianza;
    const mismoAutor = confianzaDeHallazgo([ev("a", { estado: "confirmado", source_autor: "X" }), ev("b", { estado: "confirmado", source_autor: "x" })], HOY).confianza;
    expect(dos).toBeGreaterThan(base);
    expect(mismoAutor).toBe(base);
  });
  it("fidelidad de extracción baja resta; una refutación resta más", () => {
    const limpia = confianzaDeHallazgo([ev("a", { estado: "confirmado" })], HOY).confianza;
    const borrosa = confianzaDeHallazgo([ev("a", { estado: "confirmado", source_fidelidad: "baja" })], HOY);
    const refutada = confianzaDeHallazgo([ev("a", { estado: "confirmado", comprobacion: "refutado" })], HOY);
    expect(borrosa.confianza).toBeLessThan(limpia);
    expect(borrosa.motivo).toContain("fidelidad baja");
    expect(refutada.confianza).toBeLessThan(borrosa.confianza);
    expect(refutada.motivo).toContain("refutada");
  });
  it("caducidad resta; si todo caducó, la confianza es 0 y se dice", () => {
    const viva = confianzaDeHallazgo([ev("a", { estado: "confirmado" }), ev("b", { estado: "confirmado" })], HOY).confianza;
    const conCaducada = confianzaDeHallazgo([ev("a", { estado: "confirmado" }), ev("b", { estado: "confirmado", vigente_hasta: "2024-01-01" })], HOY);
    expect(conCaducada.confianza).toBeLessThan(viva);
    expect(conCaducada.motivo).toContain("1 afirmación caducada");
    const todo = confianzaDeHallazgo([ev("a", { estado: "caducado" })], HOY);
    expect(todo).toMatchObject({ confianza: 0, motivo: "toda la evidencia caducó", provisional: true });
    expect(confianzaDeHallazgo([], HOY).motivo).toBe("sin evidencia");
  });
  it("el período que cubre la fuente es otra dimensión: más de un año atrás resta y lo dice; reciente o sin período, no", () => {
    const reciente = confianzaDeHallazgo([ev("a", { estado: "confirmado", source_periodo_desde: "2026-01-01", source_periodo_hasta: "2026-06-30" })], HOY);
    const vieja = confianzaDeHallazgo([ev("a", { estado: "confirmado", source_periodo_desde: "2024-01-01", source_periodo_hasta: "2024-12-31" })], HOY);
    const sinPeriodo = confianzaDeHallazgo([ev("a", { estado: "confirmado" })], HOY);
    expect(vieja.confianza).toBeLessThan(reciente.confianza);
    expect(vieja.motivo).toContain("1 afirmación de un período de hace más de un año");
    expect(reciente.motivo).not.toContain("hace más de un año");
    expect(reciente.confianza).toBe(sinPeriodo.confianza);
    // Sin cierre declarado se mira el inicio; la antigüedad no es caducidad: la afirmación sigue vigente y cuenta.
    expect(esAntigua({ source_periodo_desde: "2025-01-01" }, HOY)).toBe(true);
    expect(esAntigua({ source_periodo_desde: "2025-11-01" }, HOY)).toBe(false);
    expect(esAntigua({}, HOY)).toBe(false);
    expect(vieja.vigentes).toBe(1);
  });
  it("nunca sale del rango 0-1", () => {
    const max = confianzaDeHallazgo(["a", "b", "c"].map((id) => ev(id, { estado: "confirmado", comprobacion: "comprobado_con_dato" })), HOY).confianza;
    expect(max).toBeLessThanOrEqual(1);
    expect(max).toBeGreaterThanOrEqual(0.75);
  });
});

describe("calibrarImpacto separa impacto potencial de confianza", () => {
  it("un claim único sin confirmar con impacto alto: queda medio y por validar, pero el potencial alto y la confianza baja se guardan", () => {
    const r = calibrarImpacto("alto", [ev("a")], true, { hoy: HOY });
    expect(r.impacto).toBe("medio");
    expect(r.requiere_validacion).toBe(true);
    expect(r.impacto_potencial).toBe("alto");
    expect(nivelConfianza(r.confianza)).toBe("baja");
    expect(r.provisional).toBe(true);
    expect(r.confianza_motivo).toContain("no confirmada");
    expect(esRiesgoGravePendiente(r)).toBe(true);
  });
  it("con una confirmada deja de ser provisional aunque el impacto siga rebajado", () => {
    const r = calibrarImpacto("alto", [ev("a", { estado: "confirmado" })], true, { hoy: HOY });
    expect(r.impacto).toBe("medio");
    expect(r.provisional).toBe(false);
    expect(r.impacto_potencial).toBe("alto");
  });
  it("el auditor que no sustenta no borra el potencial, pero deja la confianza en el suelo", () => {
    const r = calibrarImpacto("alto", [ev("a", { estado: "confirmado" }), ev("b", { estado: "confirmado" })], false, { hoy: HOY });
    expect(r.impacto).toBe("bajo");
    expect(r.impacto_potencial).toBe("alto");
    expect(r.confianza).toBeLessThanOrEqual(0.25);
    expect(r.confianza_motivo).toContain("el auditor no lo sustenta");
  });
  it("la naturaleza decide si la visita del consultor sostiene un alto: operativo sí, financiero no", () => {
    const operativo = calibrarImpacto("alto", [visita("a", { estado: "confirmado" })], true, { naturaleza: "operativa" });
    const financiero = calibrarImpacto("alto", [visita("a", { estado: "confirmado" })], true, { naturaleza: "financiera" });
    expect(operativo.impacto).toBe("alto");
    expect(operativo.fuerza_maxima).toBe("strong");
    expect(financiero.impacto).toBe("medio");
    expect(financiero.fuerza_maxima).toBe("medium");
    expect(financiero.requiere_validacion).toBe(true);
  });
  it("un dato único sin verificar sostiene un impacto alto (fuente fuerte), pero es provisional: se rotula por corroborar, nunca crítico", () => {
    const r = calibrarImpacto("alto", [ev("a", { source_tipo: "dato" })], true, { hoy: HOY });
    expect(r.impacto).toBe("alto");
    expect(r.requiere_validacion).toBe(false);
    expect(r.provisional).toBe(true);
    expect(nivelConfianza(r.confianza)).toBe("baja");
    expect(porCorroborar(r)).toBe(true);
    // Lo mismo con dos documentos sin confirmar de autores distintos: dos voces bastan para el impacto, no para la conclusión.
    const dos = calibrarImpacto("alto", [ev("a", { source_autor: "Rosa" }), ev("b", { source_autor: "Contador" })], true, { hoy: HOY });
    expect(dos.impacto).toBe("alto");
    expect(porCorroborar(dos)).toBe(true);
  });
  it("por corroborar = provisional o riesgo grave pendiente; una conclusión confirmada con confianza alta no lo es", () => {
    expect(porCorroborar({ provisional: true, impacto_potencial: "alto", confianza: 0.6 })).toBe(true);
    expect(porCorroborar({ provisional: false, impacto_potencial: "alto", confianza: 0.3 })).toBe(true);
    expect(porCorroborar({ provisional: false, impacto_potencial: "alto", confianza: 0.8 })).toBe(false);
    // Hallazgos anteriores a la migración: sin potencial ni confianza y provisional en false → crítico, como siempre.
    expect(porCorroborar({ provisional: false, impacto_potencial: null, confianza: null })).toBe(false);
  });
  it("un riesgo grave pendiente exige las dos cosas: potencial alto Y confianza baja", () => {
    expect(esRiesgoGravePendiente({ impacto_potencial: "alto", confianza: 0.3 })).toBe(true);
    expect(esRiesgoGravePendiente({ impacto_potencial: "alto", confianza: 0.8 })).toBe(false);
    expect(esRiesgoGravePendiente({ impacto_potencial: "medio", confianza: 0.1 })).toBe(false);
    expect(esRiesgoGravePendiente({ impacto_potencial: "alto", confianza: null })).toBe(false);
  });
});

describe("la fila de la base se traduce a evidencia por un solo camino (claimComoEvidencia)", () => {
  it("las dimensiones de la fuente viajan anidadas en la afirmación: autor, período, fidelidad, tipo, origen y rol", () => {
    const e = claimComoEvidencia({
      id: "k1", source_id: "s1", participant_id: null, estado: "sin_verificar",
      comprobacion: "comprobado_con_dato", confianza: 0.7, vigente_hasta: "2027-01-01",
      sources: { tipo: "documento", origen: "cliente", autor: "Rosa Quispe", periodo_desde: "2026-01-01", periodo_hasta: "2026-06-30", fidelidad_extraccion: "baja" },
      participants: null,
    });
    expect(e).toEqual({
      id: "k1", source_id: "s1", participant_id: null, estado: "sin_verificar",
      source_tipo: "documento", source_origen: "cliente", participant_rol: null,
      source_autor: "Rosa Quispe", source_periodo_desde: "2026-01-01", source_periodo_hasta: "2026-06-30", source_fidelidad: "baja",
      comprobacion: "comprobado_con_dato", confianza: 0.7, vigente_hasta: "2027-01-01",
    });
    // Y las reglas la leen tal cual: fidelidad baja resta y lo dice.
    expect(confianzaDeHallazgo([e], HOY).motivo).toContain("fidelidad baja");
  });
  it("una fila anterior a la migración (sin las columnas nuevas) llega con null en todo lo que no se sabe: nada se inventa", () => {
    const e = claimComoEvidencia({ id: "k2", source_id: "s2", participant_id: "p1", estado: "confirmado", sources: { tipo: "entrevista" }, participants: { rol: "dueno" } });
    expect(e).toMatchObject({ participant_rol: "dueno", source_tipo: "entrevista", source_origen: null, source_autor: null, source_periodo_desde: null, source_fidelidad: null, comprobacion: null, confianza: null, vigente_hasta: null });
    expect(esAntigua(e, HOY)).toBe(false);
    expect(vigencia(e, HOY)).toBe("sin_fecha");
  });
});
