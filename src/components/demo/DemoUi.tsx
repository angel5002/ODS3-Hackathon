// /demo on the light voice palette (E5 app): card, button and field styles with the --vc-* tokens.
// Presentational only. The rest of the staff panel keeps src/components/ui.tsx.
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

export function DemoCard({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section style={style} className={`rounded-[22px] border border-vc-line bg-vc-bg shadow-[0_1px_2px_rgb(16_48_47/0.06)] ${className}`}>
      {children}
    </section>
  );
}

type DemoButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; size?: "md" | "sm" };

export function DemoButton({ variant = "secondary", size = "md", className = "", ...rest }: DemoButtonProps) {
  const v = {
    primary: "border-vc-primary bg-vc-primary text-vc-on-primary active:bg-vc-primary-press",
    secondary: "border-vc-edge bg-vc-bg text-vc-text hover:bg-vc-bg-2 active:bg-vc-surface-press",
    danger: "border-vc-danger bg-vc-bg text-vc-danger-press hover:bg-vc-danger-soft active:bg-vc-danger-soft",
  }[variant];
  const s = size === "sm" ? "min-h-9 gap-1.5 rounded-full px-3 text-[13px]" : "min-h-11 gap-2 rounded-2xl px-4 text-[14px]";
  return <button {...rest} className={`vc-pill inline-flex items-center justify-center border font-semibold disabled:opacity-50 ${s} ${v} ${className}`} />;
}

/** number inputs of the editable assumptions */
export const demoField =
  "w-20 rounded-xl border border-vc-edge bg-vc-bg px-2.5 py-1.5 text-right tabular-nums text-vc-text transition-[border-color] duration-150 focus:border-vc-focus";

export const stagger = (n: number) => ({ "--i": n }) as CSSProperties;
