import type { Metadata, Viewport } from "next";
import { Public_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });

export const metadata: Metadata = {
  title: "8X",
  applicationName: "8X",
  description: "La distancia entre lo que tu empresa dice que es y lo que realmente es.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "8X", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

/** PWA: color de barra, escala 1, sin bloquear el zoom (accesibilidad), safe areas de iPhone/iPad (viewport-fit=cover). */
export const viewport: Viewport = {
  themeColor: "#0f2a3f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${publicSans.variable} ${sourceSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
