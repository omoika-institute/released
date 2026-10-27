import type { ButtonHTMLAttributes, ComponentChildren } from "preact";

type ButtonVariant = "accent" | "panel" | "ghost" | "primary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  accent:
    "border-subtle bg-paper text-primary-txt hover:text-review-border hover:border-review-border/25 hover:bg-panel",
  panel:
    "border-subtle bg-paper text-primary-txt hover:text-review-border hover:border-review-border/25 hover:bg-panel",
  ghost:
    "border-subtle bg-black/50 text-primary-txt hover:border-review-border/25 hover:bg-black/25 hover:text-review-border active:bg-black",
  primary:
    "border-subtle bg-paper text-primary-txt hover:text-review-border hover:border-review-border/25 hover:bg-panel",
  danger:
    "border-[#7f1d1d]/60 bg-[#230808] text-[#ffb4a8] hover:border-[#ef4444]/55 hover:bg-[#310b0b] active:bg-[#180404]",
};

export function buttonClass(variant: ButtonVariant = "ghost", className = "") {
  return [
    "group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-none border px-5",
    "font-display text-[11px] font-medium uppercase leading-none tracking-[0.32em]",
    "transition-[transform,border-color,background-color,box-shadow,color] duration-150 ease-out",
    "before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(217,198,121,0.08)_0_1px,transparent_1px_8px)] before:opacity-60",
    "after:pointer-events-none after:absolute after:right-0 after:bottom-0 after:h-px after:w-10 after:bg-current/45",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d9c679] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
    "disabled:cursor-not-allowed disabled:opacity-35",
    "enabled:hover:-translate-y-px enabled:active:translate-y-0",
    BUTTON_VARIANTS[variant],
    className,
  ].join(" ");
}

export function Button({
  children,
  variant = "ghost",
  className = "",
  disabled = false,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={buttonClass(variant, className)}
    >
      <span className="pointer-events-none absolute inset-y-2 left-3 w-px bg-current/25 hover:bg-review-border/25" />
      <span className="pointer-events-none absolute left-0 top-0 h-px w-14 bg-current/30 hover:bg-review-border/30" />
      <span className="relative z-10 ml-3 flex w-full items-center justify-between gap-4">
        {children}
      </span>
    </button>
  );
}
