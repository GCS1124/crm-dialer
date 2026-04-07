import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "border border-surface-600 bg-gradient-to-b from-surface-600 to-surface-700 text-white shadow-soft hover:from-surface-500 hover:to-surface-700 dark:border-surface-500 dark:from-surface-500 dark:to-surface-600 dark:hover:from-surface-400 dark:hover:to-surface-600",
  secondary:
    "border border-slate-200 bg-white/95 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900",
  ghost:
    "bg-slate-100/90 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
  danger:
    "border border-orange-500 bg-gradient-to-b from-orange-500 to-orange-600 text-white shadow-soft hover:from-orange-500 hover:to-orange-700 dark:border-orange-500 dark:from-orange-500 dark:to-orange-600 dark:hover:from-orange-400 dark:hover:to-orange-600",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[11px] font-medium",
  md: "h-10 px-4 text-[12px] font-medium",
  lg: "h-11 px-5 text-[12px] font-semibold",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl transition duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
