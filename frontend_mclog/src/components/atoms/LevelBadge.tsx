import React from "react";

const styles: Record<string, string> = {
  error: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
  info: "bg-sky-100 text-sky-700",
  debug: "bg-slate-100 text-slate-600",
};

export const LevelBadge: React.FC<{ level: string }> = ({ level }) => (
  <span
    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${styles[level] ?? styles.debug}`}
  >
    {level}
  </span>
);
