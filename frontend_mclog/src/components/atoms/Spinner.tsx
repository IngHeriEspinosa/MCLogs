import React from "react";

export const Spinner: React.FC<{ className?: string; label?: string }> = ({ className = "h-4 w-4", label }) => (
  <svg
    viewBox="0 0 24 24"
    className={`shrink-0 animate-spin ${className}`}
    role={label ? "status" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
