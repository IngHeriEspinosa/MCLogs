import React from "react";
import { Icon, IconName } from "@/components/atoms/Icon";

type Variant = "error" | "success" | "info" | "warning";

const STYLES: Record<Variant, { box: string; icon: IconName; iconColor: string }> = {
  error: { box: "border-danger/25 bg-danger-soft text-ink", icon: "xCircle", iconColor: "text-danger" },
  success: { box: "border-success/25 bg-success-soft text-ink", icon: "checkCircle", iconColor: "text-success" },
  info: { box: "border-info/25 bg-info-soft text-ink", icon: "info", iconColor: "text-info" },
  warning: { box: "border-warning/25 bg-warning-soft text-ink", icon: "alertCircle", iconColor: "text-warning" },
};

type AlertProps = {
  variant?: Variant;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

/** Mensaje de resultado. Los errores se anuncian con role="alert"; el resto, como estado. */
export const Alert: React.FC<AlertProps> = ({ variant = "info", title, children, action, className = "" }) => {
  const style = STYLES[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm ${style.box} ${className}`}
    >
      <Icon name={style.icon} className={`mt-0.5 h-4 w-4 ${style.iconColor}`} />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-ink-2" : ""}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
