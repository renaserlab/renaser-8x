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
    background_color: "#fcfcfb",
    theme_color: "#0f2a3f",
    lang: "es",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
