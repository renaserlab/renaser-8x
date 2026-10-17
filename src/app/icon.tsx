import { ImageResponse } from "next/og";
import { Logo8XImagen } from "@/components/base/Logo8X";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/**
 * Ícono 512×512 (any + maskable): el 8X en luz sobre azul noche, como el ícono del moodboard. El dibujo ocupa el 58 %
 * del ancho: queda dentro de la zona segura del ícono enmascarable.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1426" }}>
        <Logo8XImagen ancho={Math.round(size.width * 0.58)} />
      </div>
    ),
    size
  );
}
