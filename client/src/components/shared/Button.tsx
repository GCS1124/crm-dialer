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
    "border border-[#1d6ea1] bg-[#1f7db3] text-white shadow-[0_10px_24px_rgba(31,125,179,0.22)] hover:bg-[#186791] dark:border-[#2787bd] dark:bg-[#2787bd] dark:hover:bg-[#2d91c9]",
  secondary:
    "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900",
  ghost:
    "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
  danger:
    "border border-[#ef7b70] bg-[#ef7b70] text-white shadow-[0_10px_24px_rgba(239,123,112,0.18)] hover:bg-[#e66557] dark:border-[#ef7b70] dark:bg-[#ef7b70] dark:hover:bg-[#e66557]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[11px] font-medium",
  md: "h-9 px-4 text-[12px] font-medium",
  lg: "h-10 px-4.5 text-[12px] font-semibold",
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
        "inline-flex items-center justify-center gap-2 rounded-[12px] transition duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
