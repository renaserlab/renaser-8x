import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Manrope, Source_Serif_4 } from "next/font/google";
import "./globals.css";

/**
 * Las tres voces de 8X (sistema «noche y perla», 17-10-2026):
 * — Bodoni Moda: títulos de pantalla, el nombre de la empresa y las cifras protagonistas. Didone de alto contraste con
 *   eje óptico (opsz), el mismo gesto grueso-fino de la cinta del 8X. Se pide solo por clase desde src/design.
 * — Manrope: toda la interfaz (cuerpo, botones, navegación, campos, tablas, cifras en filas).
 * — Source Serif 4: los documentos y la impresión.
 */
const bodoni = Bodoni_Moda({ subsets: ["latin"], variable: "--font-bodoni", display: "swap", axes: ["opsz"] });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });

export const metadata: Metadata = {
  title: "8X",
  applicationName: "8X",
  description: "La distancia entre lo que tu empresa dice que es y lo que realmente es.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "8X", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

/** PWA: color de barra (perla, el lienzo de trabajo), escala 1, sin bloquear el zoom (accesibilidad), safe areas de iPhone/iPad. */
export const viewport: Viewport = {
  themeColor: "#f5f3ee",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${bodoni.variable} ${manrope.variable} ${sourceSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
