import React from "react";
import { Icon, IconName } from "@/components/atoms/Icon";

export type TagTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "accent";

const TONES: Record<TagTone, string> = {
  neutral: "bg-surface-3 text-ink-2 ring-line-strong/60",
  brand: "bg-brand-soft text-brand-ink ring-brand/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
  accent: "bg-accent-400 text-accent-800 ring-accent-500/30",
};

type TagProps = {
  tone?: TagTone;
  icon?: IconName;
  mono?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
};

export const Tag: React.FC<TagProps> = ({ tone = "neutral", icon, mono, className = "", title, children }) => (
  <span
    title={title}
    className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium leading-4 ring-1 ring-inset ${
      mono ? "font-mono" : ""
    } ${TONES[tone]} ${className}`}
  >
    {icon && <Icon name={icon} className="h-3 w-3" />}
    {children}
  </span>
);

/** Entorno de despliegue. Produccion destaca; el resto va en neutro. */
export const EnvTag: React.FC<{ environment: string; label?: string }> = ({ environment, label }) => (
  <Tag tone={environment === "production" ? "brand" : "neutral"} mono>
    {environment === "production" && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />}
    {label ?? environment}
  </Tag>
);
