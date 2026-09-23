import type { Metadata } from "next";
import React from "react";

// El token del enlace va en la URL: que ninguna peticion saliente lo lleve en
// el Referer, y que los buscadores no indexen un snapshot publico.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function SnapshotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
