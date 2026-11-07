import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  ArrowRightLeft,
  CalendarX2,
  Check,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  Phone,
  PhoneMissed,
  Send,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { RISK_LABEL, STATUS, type RiskLevel } from "@/lib/labels";
import type { Status } from "@/lib/types";

// Sober tags (docs/estilo.md): 2 px corners, a soft tint, the word and an icon. Never colour alone.
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

const STATUS_ICON: Record<Status, LucideIcon> = {
  pendiente: CircleDashed,
  recordatorio_enviado: Send,
  confirmada: Check,
  liberada: CalendarX2,
  sin_respuesta: PhoneMissed,
  en_llamada: Phone,
  derivada_a_persona: UserRound,
  reasignada: ArrowRightLeft,
  reprogramacion_pendiente: Clock3,
  validacion_pendiente: ClipboardCheck,
};

export function StatusBadge({ status, small }: { status: Status; small?: boolean }) {
  const s = STATUS[status];
  const Icon = STATUS_ICON[status] ?? CircleDashed;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs font-semibold ${TONE[s.tone]} ${
        small ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-sm"
      }`}
    >
      <Icon className={small ? "size-3" : "size-3.5"} aria-hidden />
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
    <span className={`inline-flex items-center gap-2 rounded-xs px-2 py-0.5 text-sm font-semibold ${RISK_STYLE[level]}`}>
      {RISK_LABEL[level]}
      {!compact && (
        <>
          <span className="relative h-1.5 w-10 overflow-hidden bg-white" aria-hidden>
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
    primary: "bg-brand text-white hover:bg-brand-hover border-brand hover:border-brand-hover",
    secondary: "bg-surface text-ink border-line-strong hover:bg-sunken",
    ghost: "bg-transparent text-ink border-transparent hover:bg-sunken",
    danger: "bg-surface text-risk-alto border-risk-alto hover:bg-risk-alto-soft",
  }[variant];
  return (
    <button
      {...rest}
      className={`press inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-[15px] font-semibold disabled:opacity-50 ${v} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</section>;
}
