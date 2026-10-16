/**
 * «28.000» NO ES VEINTIOCHO.
 *
 * El 13-10-2026 un verificador probó la pantalla Tus números con lo que escribiría cualquier dueño:
 * venta «40 mil», gastos fijos «12 mil» y costo de lo vendido «28.000». El sistema guardó 28. El punto de
 * equilibrio salió en S/ 12,008 «y estás S/ 27,992 por encima», sin un solo aviso: una cifra exacta y
 * falsa, justo lo que la regla del costo variable quería evitar. «S/. 28000» se guardaba como 0,28
 * porque el punto de «S/.» se leía como decimal.
 *
 * Había tres copias de la lectura y dos lecturas sueltas. Ahora hay una (src/lib/numero-escrito.ts) y
 * estas pruebas fijan qué entiende, qué rechaza y que lo vacío nunca es cero.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { numeroEscrito } from "@/lib/numero-escrito";
import { aNumero as aNumeroDeTusNumeros, derivados, type Metrica } from "@/lib/metricas";

describe("lo que escribe un dueño, leído como lo que quiso decir", () => {
  it.each([
    ["28.000", 28000],
    ["28,000", 28000],
    ["S/. 28000", 28000],
    ["S/ 8500", 8500],
    ["s/.28,000", 28000],
    ["8,500", 8500],
    ["1.500", 1500],
    ["1.234.567", 1234567],
    ["1,234,567", 1234567],
    ["1,234,567.50", 1234567.5],
    ["1.234.567,50", 1234567.5],
    ["40 mil", 40000],
    ["12 mil soles", 12000],
    ["1,5 mil", 1500],
    ["1.5 mil", 1500],
    ["8k", 8000],
    ["1.5 millones", 1500000],
    ["US$ 2,000", 2000],
    ["80000", 80000],
    ["0", 0],
  ])("«%s» → %d", (texto, esperado) => {
    expect(numeroEscrito(texto)).toBe(esperado);
  });

  it.each([
    ["12.5", 12.5],
    ["8,5", 8.5],
    ["28.00", 28],
    ["0.125", 0.125],
    ["0,125", 0.125],
    ["12.5%", 12.5],
    ["1234.567", 1234.567],
  ])("decimales: «%s» → %d", (texto, esperado) => {
    expect(numeroEscrito(texto)).toBe(esperado);
  });
});

describe("lo vacío es «sin dato», y lo que no se entiende se dice", () => {
  it("vacío o solo espacios → null, nunca cero", () => {
    expect(numeroEscrito("")).toBeNull();
    expect(numeroEscrito("   ")).toBeNull();
    expect(numeroEscrito(null)).toBeNull();
    expect(numeroEscrito(undefined)).toBeNull();
  });

  it.each(["no sé", "abc", "veinte", "12 a 15", "1.23.4", "1,2,3", "12.", "S/", "--5", "12..5"])("«%s» → invalido", (texto) => {
    expect(numeroEscrito(texto)).toBe("invalido");
  });

  it("un negativo solo vale cuando quien llama lo pide", () => {
    expect(numeroEscrito("-500")).toBe("invalido");
    expect(numeroEscrito("-500", { negativo: true })).toBe(-500);
    expect(numeroEscrito("−1.200", { negativo: true })).toBe(-1200);
  });
});

describe("el caso que lo destapó: Tus números ya no fabrica un equilibrio falso", () => {
  it("la lectura de Tus números entiende «28.000», «S/. 28000», «40 mil» y «12 mil»", () => {
    expect(aNumeroDeTusNumeros("28.000")).toBe(28000);
    expect(aNumeroDeTusNumeros("S/. 28000")).toBe(28000);
    expect(aNumeroDeTusNumeros("40 mil")).toBe(40000);
    expect(aNumeroDeTusNumeros("12 mil")).toBe(12000);
  });

  it("venta 40 mil, fijos 12 mil, costo variable 28.000 → equilibrio 40.000, no 12.008", () => {
    const fila = (clave: string, texto: string): Metrica => ({ clave, periodo: "2026-09", valor: aNumeroDeTusNumeros(texto), estado: "contado" }) as Metrica;
    const d = derivados([fila("venta_mes", "40 mil"), fila("gasto_fijo_mes", "12 mil"), fila("costo_variable_mes", "28.000")]);
    // Razón de contribución = (40.000 − 28.000) / 40.000 = 0,30 → 12.000 / 0,30 = 40.000.
    expect(d.equilibrio).toBe(40000);
    expect(d.equilibrio).not.toBe(12008);
  });
});

describe("una sola regla: nadie más lee números por su cuenta", () => {
  const SRC = path.resolve(__dirname, "../src");
  const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

  it.each(["lib/metricas.ts", "components/kpis/RegistrarValor.tsx", "components/cliente/Indicadores.tsx", "components/Eventos.tsx"])("%s delega en numeroEscrito", (rel) => {
    expect(leer(rel)).toMatch(/numeroEscrito\(/);
  });

  it("ya no queda ninguna lectura con parseFloat sobre lo que tecleó una persona en esos cuatro archivos", () => {
    for (const rel of ["lib/metricas.ts", "components/kpis/RegistrarValor.tsx", "components/cliente/Indicadores.tsx", "components/Eventos.tsx"]) {
      expect(leer(rel), rel).not.toMatch(/parseFloat\(/);
    }
  });
});
