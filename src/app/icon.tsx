import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Icono 512×512 (any + maskable): fondo marca, "8X" en el centro con margen seguro del 20 %. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f2a3f", color: "#fcfcfb", fontSize: 232, fontWeight: 700, letterSpacing: -8, fontFamily: "sans-serif" }}>
        8X
      </div>
    ),
    size
  );
}
