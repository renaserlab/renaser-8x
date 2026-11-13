/** Lo que el arnés necesita antes de pintar: la hoja de estilos al día. Ver compilar-css.cjs. */
import { createRequire } from "module";

const req = createRequire(import.meta.url);

export async function setup() {
  await req("./compilar-css.cjs").compilar();
}
