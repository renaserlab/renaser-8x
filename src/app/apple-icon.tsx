import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icono iOS (pantalla de inicio). Sin transparencia: iOS lo cuadra y redondea. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f2a3f", color: "#fcfcfb", fontSize: 84, fontWeight: 700, letterSpacing: -3, fontFamily: "sans-serif" }}>
        8X
      </div>
    ),
    size
  );
}
