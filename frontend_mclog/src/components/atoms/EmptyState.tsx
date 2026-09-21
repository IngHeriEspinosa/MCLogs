import React from "react";
import { Icon, IconName } from "@/components/atoms/Icon";

type EmptyStateProps = {
  icon?: IconName;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = "search", title, description, action, className = "" }) => (
  <div className={`flex flex-col items-center justify-center gap-3 px-6 py-14 text-center ${className}`}>
    <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface-2 text-ink-3 shadow-card">
      <Icon name={icon} className="h-5 w-5" />
      <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent-400 ring-2 ring-surface" />
    </div>
    <div className="max-w-sm">
      <p className="font-heading text-[0.9375rem] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 text-sm leading-relaxed text-ink-3">{description}</p>}
    </div>
    {action}
  </div>
);

export const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <kbd
    className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[0.6875rem] font-medium text-ink-3 ${className}`}
  >
    {children}
  </kbd>
);
