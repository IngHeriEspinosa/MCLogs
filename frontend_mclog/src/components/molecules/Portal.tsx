"use client";
import React, { RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Lleva un panel flotante al final del documento.
 *
 * Si el ancla vive dentro de un <dialog> modal, el panel se monta dentro de
 * ese dialogo: un modal esta en la "top layer" del navegador y taparia
 * cualquier cosa montada en <body>, tenga el z-index que tenga.
 *
 * El contenedor se resuelve durante el render y no en un efecto: los paneles
 * solo se montan tras una interaccion (nunca en el servidor), y montarlos en
 * el mismo commit que los abre permite medirlos y posicionarlos antes de pintar.
 */
export const Portal: React.FC<{ anchorRef?: RefObject<HTMLElement>; children: React.ReactNode }> = ({ anchorRef, children }) => {
  if (typeof document === "undefined") return null;
  const container = anchorRef?.current?.closest("dialog") ?? document.body;
  return createPortal(children, container);
};
