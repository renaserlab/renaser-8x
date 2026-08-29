import type { NextConfig } from "next";

/**
 * CABECERAS DE SEGURIDAD — hallazgo alto de la auditoría del 29-08-2026: el aplicativo salía sin
 * ninguna, así que se podía embeber en una página ajena (clickjacking) y no había defensa en capas
 * contra scripts inyectados. ISO 27001 A.8.9 (configuración segura).
 *
 * La CSP permite 'unsafe-inline' en estilos porque el diseño usa `style=` en los componentes, y
 * 'unsafe-inline'/'unsafe-eval' en scripts porque Next los necesita para hidratar. Lo que SÍ cierra
 * es el origen: nadie puede cargar scripts, marcos ni conexiones desde dominios que no sean los
 * nuestros y Supabase.
 */
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://otqfqafstrohugvgbkmd.supabase.co";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  `media-src 'self' blob: ${supabase}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} wss://${supabase.replace("https://", "")}`,
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      // Nada de lo que hay bajo /api debe quedar en caché de navegador o proxy.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
    ];
  },
};

export default nextConfig;
