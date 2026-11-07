// /demo: card, button and field styles on the local /demo tokens (demo.module.css, --cc-*): flat white surfaces,
// 1 px borders, small radii, Public Sans. Presentational only. The rest of the staff panel keeps src/components/ui.tsx.
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

export function DemoCard({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section style={style} className={`min-w-0 rounded-2xl border border-(--cc-border) bg-(--cc-surface) ${className}`}>
      {children}
    </section>
  );
}

type DemoButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; size?: "md" | "sm" };

export function DemoButton({ variant = "secondary", size = "md", className = "", ...rest }: DemoButtonProps) {
  const v = {
    primary: "border-(--cc-primary) bg-(--cc-primary) text-(--cc-on-primary) active:bg-(--cc-primary-press)",
    secondary: "border-(--cc-control) bg-(--cc-surface) text-(--cc-text) hover:bg-(--cc-subtle)",
    danger: "border-(--cc-danger) bg-(--cc-surface) text-(--cc-danger) hover:bg-(--cc-danger-subtle)",
  }[variant];
  const s = size === "sm" ? "min-h-9 gap-1.5 px-3 text-[13px]" : "min-h-11 gap-2 px-4 text-[14px]";
  return <button {...rest} className={`cc-press inline-flex items-center justify-center rounded-md border font-semibold disabled:opacity-50 ${s} ${v} ${className}`} />;
}

/** number inputs of the editable assumptions */
export const demoField =
  "w-20 rounded-md border border-(--cc-control) bg-(--cc-surface) px-2.5 py-1.5 text-right tabular-nums text-(--cc-text) focus:border-(--cc-focus)";

/** selects of the operator tools */
export const demoSelect = "min-h-9 rounded-md border border-(--cc-control) bg-(--cc-surface) px-2 py-1 text-[13px] text-(--cc-text)";

export const stagger = (n: number) => ({ "--i": n }) as CSSProperties;
