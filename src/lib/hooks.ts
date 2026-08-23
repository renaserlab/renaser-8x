"use client";
import { useSyncExternalStore } from "react";

const nada = () => () => {};

/** true solo en el navegador, tras hidratar. Sin setState en efectos. */
export function useEsCliente() {
  return useSyncExternalStore(nada, () => true, () => false);
}
