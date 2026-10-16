/**
 * EL DRENAJE DE VERCEL MANTIENE EL RESUMEN POR EMPRESA (16-10-2026).
 *
 * company_stats es una vista materializada: solo cambia cuando alguien la refresca. Hasta hoy la refrescaba
 * únicamente el worker de la PC (`npm run worker`). Con la PC apagada quedó congelada desde agosto: tenía
 * empresas borradas y ninguna de las cinco reales, y la bandeja decía «sin actividad» a empresas con cien
 * afirmaciones. Ahora la refresca también la ruta que el cron de Vercel llama cada 5 minutos.
 *
 * Y una trampa de supabase-js: la llamada no corre hasta que alguien la espera. `void supabaseAdmin().rpc(...)`
 * no hace nada. Así estuvo meses `limpiar_rate_limits` sin ejecutarse.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "src");
const ruta = readFileSync(path.join(SRC, "app/api/worker/drain/route.ts"), "utf8");

function archivos(d: string, acc: string[] = []): string[] {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) archivos(p, acc);
    else if (/\.(ts|tsx)$/.test(e)) acc.push(p);
  }
  return acc;
}

describe("el drenaje de Vercel mantiene el resumen por empresa", () => {
  it("refresca company_stats y espera la llamada", () => {
    expect(ruta).toMatch(/await Promise\.allSettled\(\[[^\]]*rpc\("refresh_company_stats"\)/);
  });

  it("también limpia las ventanas vencidas del límite de peticiones, esperándolo", () => {
    expect(ruta).toMatch(/await Promise\.allSettled\(\[[^\]]*rpc\("limpiar_rate_limits"\)/);
  });

  it("en ninguna parte del código una llamada a Supabase queda lanzada con void sin ejecutarse", () => {
    // Con `.then(...)` al final sí se ejecuta (then es lo que dispara la llamada); sin él, no.
    const culpables = archivos(SRC).flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /\bvoid\s+(supabaseAdmin\(\)|sb|supabase)\s*\.\s*(rpc|from)\(/.test(l) && !/\.then\(/.test(l))
        .map(({ i }) => `${path.relative(SRC, f)}:${i + 1}`)
    );
    expect(culpables).toEqual([]);
  });
});
