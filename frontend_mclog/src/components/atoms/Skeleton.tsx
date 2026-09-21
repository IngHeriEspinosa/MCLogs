import React from "react";

/** Bloque de carga con brillo que recorre el hueco del contenido. */
export const Skeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div aria-hidden className={`skeleton ${className}`} />
);
