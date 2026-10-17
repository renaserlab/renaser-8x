import { ImageResponse } from "next/og";
import { Logo8XImagen } from "@/components/base/Logo8X";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ícono iOS (pantalla de inicio): el 8X en luz sobre azul noche. Sin transparencia: iOS lo cuadra y redondea. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1426" }}>
        <Logo8XImagen ancho={Math.round(size.width * 0.58)} />
      </div>
    ),
    size
  );
}
