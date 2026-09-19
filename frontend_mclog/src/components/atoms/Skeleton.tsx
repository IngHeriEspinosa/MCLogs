import React from "react";

// Atom: Skeleton placeholder block
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={["animate-pulse rounded-md bg-slate-200/80", className].filter(Boolean).join(" ")} />
);
