import type { MetadataRoute } from "next";

/** Manifest PWA (instalable en Android/iOS/escritorio). Los iconos los generan app/icon.tsx y app/apple-icon.tsx. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "8X",
    short_name: "8X",
    description: "La distancia entre lo que tu empresa dice que es y lo que realmente es.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Arranca en noche con el ícono (la portada del ingreso); la franja de arriba, ya adentro, es perla.
    background_color: "#0b1426",
    theme_color: "#f5f3ee",
    lang: "es",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
