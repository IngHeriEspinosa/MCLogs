import React, { forwardRef } from "react";
import Link from "next/link";
import { Icon, IconName } from "@/components/atoms/Icon";
import { Spinner } from "@/components/atoms/Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,color,box-shadow,opacity] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-solid text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(var(--ink)/0.12)] hover:bg-brand-solid/90",
  secondary:
    "border border-line bg-surface text-ink shadow-[0_1px_0_rgb(var(--ink)/0.03)] hover:border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink",
  danger: "bg-lvl-error text-white shadow-sm hover:bg-lvl-error/90",
  soft: "bg-brand-soft text-brand-ink hover:bg-brand-soft/70",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs",
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-[0.9375rem]",
};

const ICON_ONLY: Record<ButtonSize, string> = {
  xs: "h-7 w-7",
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

const ICON_SIZE: Record<ButtonSize, string> = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-4 w-4",
  lg: "h-[1.125rem] w-[1.125rem]",
};

export const buttonClass = (variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra = "") =>
  `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconRight, loading, children, className = "", disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className={ICON_SIZE[size]} /> : icon && <Icon name={icon} className={ICON_SIZE[size]} />}
      {children}
      {iconRight && <Icon name={iconRight} className={ICON_SIZE[size]} />}
    </button>
  );
});

type ButtonLinkProps = React.ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
};

/** Enlace con aspecto de boton: navega, asi que semanticamente es un <a>. */
export const ButtonLink: React.FC<ButtonLinkProps> = ({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  children,
  className = "",
  ...rest
}) => (
  <Link className={`${buttonClass(variant, size, className)} hover:no-underline`} {...rest}>
    {icon && <Icon name={icon} className={ICON_SIZE[size]} />}
    {children}
    {iconRight && <Icon name={iconRight} className={ICON_SIZE[size]} />}
  </Link>
);

type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  /** Obligatorio: es el unico nombre accesible que tiene el boton. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = "ghost", size = "md", active, className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`${BASE} ${VARIANTS[variant]} ${ICON_ONLY[size]} ${active ? "bg-surface-3 text-ink" : ""} ${className}`}
      {...rest}
    >
      <Icon name={icon} className={ICON_SIZE[size]} />
    </button>
  );
});
