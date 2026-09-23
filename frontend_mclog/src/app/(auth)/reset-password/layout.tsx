import type { Metadata } from "next";
import React from "react";

// El token del enlace llega en la URL: que ninguna peticion saliente lo lleve en el Referer.
export const metadata: Metadata = { referrer: "no-referrer" };

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
