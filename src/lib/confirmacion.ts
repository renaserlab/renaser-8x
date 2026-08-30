/**
 * CONFIRMAR ESCRIBIENDO EL NOMBRE, sin volverlo imposible.
 *
 * El 30-08-2026 Kelin no podía eliminar sus empresas de prueba: la confirmación exigía el nombre
 * EXACTO y varias se llamaban "PRUEBA A · Estudio Jurídico Lex", con un punto medio que no está en
 * el teclado español. El botón no se habilitaba nunca. La intención —que no se borre por accidente—
 * es correcta; exigir caracteres que no se pueden teclear, no.
 *
 * Se sigue exigiendo saber y escribir el nombre. Lo que se perdona es lo que no aporta seguridad:
 * mayúsculas, tildes, signos y espacios de más.
 */
export function normalizarParaConfirmar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function confirmacionValida(escrito: string, esperado: string): boolean {
  const e = normalizarParaConfirmar(esperado);
  // Un nombre que al normalizar queda vacío no puede confirmarse a ciegas con una cadena vacía.
  return e.length > 0 && normalizarParaConfirmar(escrito) === e;
}
