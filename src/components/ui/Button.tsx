import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The only button in the app. Amber is reserved for the primary action, so
 * there is exactly one of them on screen at a time.
 */

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

/** „lg" exists for one button: the final action on the summary. */
const SIZE: Record<Size, string> = {
  md: "px-5 py-3",
  lg: "px-6 py-5 text-subtitle",
};

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent text-bg font-medium hover:opacity-90 disabled:bg-surface-2 disabled:text-text-muted disabled:opacity-100",
  secondary:
    "border border-border bg-surface text-text hover:bg-surface-2 disabled:text-text-muted",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Fills the width of its container — used for the big final action. */
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "focus-ring inline-flex items-center justify-center gap-2 rounded-card",
        "transition-colors duration-hover disabled:cursor-not-allowed",
        SIZE[size],
        VARIANT[variant],
        block ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
