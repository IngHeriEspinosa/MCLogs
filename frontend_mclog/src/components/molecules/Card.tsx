// Molecule: Card (contenedor con encabezado opcional)
import React from "react";

type CardProps = {
  title?: string;
  children: React.ReactNode;
};

export const Card: React.FC<CardProps> = ({ title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
    {title && <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">{title}</div>}
    <div className="p-4">{children}</div>
  </div>
);
