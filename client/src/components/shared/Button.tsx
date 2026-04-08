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
    "border border-[#2d84b5] bg-[#3b91c3] text-white hover:bg-[#327eab] dark:border-[#2d84b5] dark:bg-[#3b91c3] dark:hover:bg-[#327eab]",
  secondary:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900",
  ghost:
    "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
  danger:
    "border border-[#f2877a] bg-[#f2877a] text-white hover:bg-[#ea7264] dark:border-[#f2877a] dark:bg-[#f2877a] dark:hover:bg-[#ea7264]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[11px] font-medium",
  md: "h-9 px-4 text-[12px] font-medium",
  lg: "h-10 px-4 text-[12px] font-semibold",
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
        "inline-flex items-center justify-center gap-2 rounded-md transition duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
