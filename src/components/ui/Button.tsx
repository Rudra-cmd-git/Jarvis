import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[#02121a] hover:brightness-110 border border-transparent font-semibold shadow-[0_0_24px_-8px_var(--accent-glow)]",
  secondary: "bg-white/[0.05] text-ink hover:bg-white/[0.09] border border-line",
  ghost: "bg-transparent text-muted hover:text-ink hover:bg-white/[0.05] border border-transparent",
  danger: "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30",
  outline: "bg-transparent text-ink border border-line-bright hover:border-[var(--accent-line)] hover:text-[var(--accent)]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-sm rounded-xl gap-2.5",
  icon: "h-9 w-9 rounded-lg justify-center",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center transition-all duration-150 focus-ring disabled:opacity-40 disabled:pointer-events-none select-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
