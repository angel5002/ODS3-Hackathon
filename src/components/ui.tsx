import type { ButtonHTMLAttributes, ReactNode } from "react";
import { RISK_LABEL, STATUS, type RiskLevel } from "@/lib/labels";
import type { Status } from "@/lib/types";

const TONE: Record<string, string> = {
  neutral: "bg-st-neutral-soft text-st-neutral",
  sent: "bg-st-sent-soft text-st-sent",
  ok: "bg-st-ok-soft text-st-ok",
  free: "bg-st-free-soft text-st-free",
  warn: "bg-st-warn-soft text-st-warn",
  call: "bg-st-call-soft text-st-call",
  human: "bg-st-human-soft text-st-human",
  done: "bg-st-done-soft text-st-done",
};
const DOT: Record<string, string> = {
  neutral: "bg-st-neutral",
  sent: "bg-st-sent",
  ok: "bg-st-ok",
  free: "bg-st-free",
  warn: "bg-st-warn",
  call: "bg-st-call",
  human: "bg-st-human",
  done: "bg-st-done",
};

export function StatusBadge({ status, small }: { status: Status; small?: boolean }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ${TONE[s.tone]} ${
        small ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      }`}
    >
      <span className={`size-1.5 rounded-full ${DOT[s.tone]}`} aria-hidden />
      {s.label}
    </span>
  );
}

const RISK_STYLE: Record<RiskLevel, string> = {
  alto: "bg-risk-alto-soft text-risk-alto",
  medio: "bg-risk-medio-soft text-risk-medio",
  bajo: "bg-risk-bajo-soft text-risk-bajo",
};
const RISK_BAR: Record<RiskLevel, string> = { alto: "bg-risk-alto", medio: "bg-risk-medio", bajo: "bg-risk-bajo" };

/** Risk is never colour alone: level word + percentage + a small proportional bar. */
export function RiskTag({ level, risk, compact }: { level: RiskLevel | null; risk: number | null; compact?: boolean }) {
  if (!level || risk == null) return <span className="text-sm text-faint">Sin estimar</span>;
  return (
    <span className={`inline-flex items-center gap-2 rounded-md px-2 py-0.5 text-sm font-semibold ${RISK_STYLE[level]}`}>
      {RISK_LABEL[level]}
      {!compact && (
        <>
          <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-white/70" aria-hidden>
            <span className={`absolute inset-y-0 left-0 ${RISK_BAR[level]}`} style={{ width: `${Math.round(risk * 100)}%` }} />
          </span>
          <span className="font-normal tabular-nums">{Math.round(risk * 100)} %</span>
        </>
      )}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" };
export function Button({ variant = "secondary", className = "", ...rest }: BtnProps) {
  const v = {
    primary: "bg-brand text-white hover:bg-brand-hover border-brand",
    secondary: "bg-surface text-ink border-line-strong hover:bg-sunken",
    ghost: "bg-transparent text-ink border-transparent hover:bg-black/5",
    danger: "bg-surface text-risk-alto border-risk-alto/40 hover:bg-risk-alto-soft",
  }[variant];
  return (
    <button
      {...rest}
      className={`press inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-semibold disabled:opacity-50 ${v} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface ${className}`}>{children}</section>;
}
