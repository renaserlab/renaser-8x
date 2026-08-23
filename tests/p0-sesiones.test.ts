import { describe, it, expect } from "vitest";
import { autorizaSesion, type SesionMin } from "@/lib/sesiones";

const empresaA = "emp-A", empresaB = "emp-B";
const sesionRosa: SesionMin = { id: "ses-rosa", company_id: empresaA, participant_id: "p-rosa", participant_user_id: null }; // empleada por enlace, sin cuenta
const sesionDiego: SesionMin = { id: "ses-diego", company_id: empresaA, participant_id: "p-diego", participant_user_id: "user-diego" }; // líder con cuenta
const sesionDueno: SesionMin = { id: "ses-dueno", company_id: empresaA, participant_id: "p-dueno", participant_user_id: "user-dueno" };
const sesionOtra: SesionMin = { id: "ses-b", company_id: empresaB, participant_id: "p-b", participant_user_id: "user-b" };

const dueno = { rol: "cliente" as const, id: "user-dueno" };
const diego = { rol: "cliente" as const, id: "user-diego" };
const consultor = { rol: "consultor" as const, id: "user-consultor" };
const accesoA = (s: SesionMin) => s.company_id === empresaA;

describe("P0-05 · autorización de sesiones de entrevista", () => {
  it("dueño intenta abrir la sesión de una empleada de su propia empresa → 403", () => {
    const d = autorizaSesion(dueno, sesionRosa, accesoA(sesionRosa));
    expect(d.permitido).toBe(false);
    expect(!d.permitido && d.status).toBe(403);
  });
  it("empleado A (Diego) intenta la sesión de empleado B (Rosa) → 403", () => {
    expect(autorizaSesion(diego, sesionRosa, true).permitido).toBe(false);
  });
  it("empleado con cuenta abre su propia sesión → permitido", () => {
    expect(autorizaSesion(diego, sesionDiego, true).permitido).toBe(true);
  });
  it("dueño abre su propia sesión → permitido", () => {
    expect(autorizaSesion(dueno, sesionDueno, true).permitido).toBe(true);
  });
  it("consultor autorizado → permitido en cualquier sesión de una empresa a la que accede", () => {
    expect(autorizaSesion(consultor, sesionRosa, true).permitido).toBe(true);
    expect(autorizaSesion(consultor, sesionDiego, true).permitido).toBe(true);
  });
  it("usuario de otra empresa → 404 (no revela existencia), aunque adivine el session_id", () => {
    const d = autorizaSesion(dueno, sesionOtra, accesoA(sesionOtra));
    expect(d.permitido).toBe(false);
    expect(!d.permitido && d.status).toBe(404);
  });
  it("session_id inexistente → 404 uniforme", () => {
    expect(!autorizaSesion(dueno, null, false).permitido).toBe(true);
    expect((autorizaSesion(dueno, null, false) as { status: number }).status).toBe(404);
  });
  it("tener acceso a la empresa NO basta: se exige participant.user_id == auth.uid()", () => {
    const d = autorizaSesion(dueno, { ...sesionRosa, participant_user_id: "user-rosa" }, true);
    expect(d.permitido).toBe(false);
  });
  it("una sesión sin user_id (participante por enlace) nunca es operable por un usuario con cuenta que no sea consultor", () => {
    expect(autorizaSesion(dueno, sesionRosa, true).permitido).toBe(false);
    expect(autorizaSesion(diego, sesionRosa, true).permitido).toBe(false);
  });
  it("manipular company_id en la petición no cambia nada: la empresa sale de la sesión, no del cliente", () => {
    // autorizaSesion solo recibe la sesión cargada por id; el company_id que el cliente mande se ignora.
    const d = autorizaSesion(dueno, sesionRosa, true);
    expect(d.permitido).toBe(false);
  });
});
