import { REQUEST_STATE, type RequestState } from "@/lib/labels";

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

export function RequestBadge({ state }: { state: RequestState }) {
  const s = REQUEST_STATE[state] ?? { label: state, tone: "neutral" };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[s.tone]}`}>{s.label}</span>;
}

export function Pill({ tone = "neutral", children }: { tone?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[tone]}`}>{children}</span>;
}
