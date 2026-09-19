import React from "react";

type Variant = "error" | "success" | "info";

const styles: Record<Variant, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

/** Mensaje de resultado de una accion. Los errores se anuncian con role="alert". */
export const Alert: React.FC<{ variant?: Variant; children: React.ReactNode; className?: string }> = ({
  variant = "info",
  children,
  className = "",
}) => (
  <div
    role={variant === "error" ? "alert" : "status"}
    className={`rounded-lg border px-3 py-2 text-sm ${styles[variant]} ${className}`}
  >
    {children}
  </div>
);
