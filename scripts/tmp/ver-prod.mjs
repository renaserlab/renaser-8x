const base = "https://8x-renaser-s-projects.vercel.app";
const h = await (await fetch(base + "/entrar")).text();
const chunks = [...h.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
console.log("chunks en /entrar:", chunks.length);
let hallado = false;
for (const c of chunks) {
  const js = await (await fetch(base + c)).text();
  if (js.includes("Mostrar contrase") || js.includes("Ocultar contrase")) {
    console.log("ENCONTRADO CampoClave en", c.slice(0, 70));
    hallado = true;
    break;
  }
}
console.log("build nuevo en prod:", hallado ? "SI" : "NO — investigar");
