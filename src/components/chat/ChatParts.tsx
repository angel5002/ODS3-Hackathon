"use client";

// Presentational pieces shared by the /pedir-cita chat and the simulated phone /t/[token] (E5 app).
// Light voice palette (--vc-* tokens of src/app/globals.css, measured by scripts/dev/contrast-check.mjs).
// Props only: no state, no effects, no server calls.
import type { ReactNode } from "react";
import { CalendarCheck2, CheckCheck, Clock, Info, Volume2 } from "lucide-react";

/** The demo notice strip, visible on every screen. `children` carries the DISCLAIMER text. */
export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-vc-line bg-vc-surface px-4 py-2 text-[12px] leading-snug text-vc-text-2">
      <Info className="mt-px size-4 shrink-0 text-vc-icon" aria-hidden />
      <p className="min-w-0 text-pretty">{children}</p>
    </div>
  );
}

/** "Activar sonido y llamadas": one full-width ink bar under the notice. */
export function SoundBar({ onEnable }: { onEnable: () => void }) {
  return (
    <button
      type="button"
      onClick={onEnable}
      className="flex min-h-11 shrink-0 items-center justify-center gap-2 bg-vc-primary px-4 text-[14px] font-semibold text-vc-on-primary transition-colors duration-150 active:bg-vc-primary-press"
    >
      <Volume2 className="size-4" aria-hidden /> Activar sonido y llamadas
    </button>
  );
}

/** The scrolling message list. */
export function ThreadList({ listRef, children }: { listRef?: React.Ref<HTMLOListElement>; children: ReactNode }) {
  return (
    <ol
      ref={listRef}
      className="app-fade flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-vc-bg-2 px-3 py-4"
      aria-live="polite"
    >
      {children}
    </ol>
  );
}

type BubbleProps = {
  /** written by the person (right, ink) or by the hospital/assistant (left, paper) */
  mine: boolean;
  /** a short label for offers and confirmations, so they are never told apart by colour alone */
  highlight?: string | null;
  time: ReactNode;
  answered?: string | null;
  /** double tick on the person's own messages */
  sent?: boolean;
  children: ReactNode;
  /** under the bubble: reply buttons, deadline */
  after?: ReactNode;
};

export function Bubble({ mine, highlight, time, answered, sent, children, after }: BubbleProps) {
  return (
    <li className={`bubble-in flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="min-w-0 max-w-[86%]">
        <div
          className={`rounded-[20px] px-3.5 py-2.5 text-[15px] leading-snug ${
            mine
              ? "rounded-br-md bg-vc-primary text-vc-on-primary"
              : `rounded-bl-md bg-vc-bg text-vc-text shadow-[0_1px_2px_rgb(16_48_47/0.08)] ${highlight ? "ring-2 ring-vc-agent" : "ring-1 ring-vc-line"}`
          }`}
        >
          {highlight && (
            <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-vc-icon">
              <CalendarCheck2 className="size-4" aria-hidden />
              {highlight}
            </p>
          )}
          <p className="whitespace-pre-line break-words">{children}</p>
          {answered && (
            <p className="mt-2 inline-flex max-w-full items-center rounded-full bg-vc-surface px-2.5 py-0.5 text-[12px] font-semibold text-vc-text">
              Respondió: {answered}
            </p>
          )}
          <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] tabular-nums ${mine ? "text-vc-on-primary-2" : "text-vc-text-3"}`}>
            {time}
            {sent && <CheckCheck className="size-3.5" aria-label="Enviado" />}
          </p>
        </div>
        {after}
      </div>
    </li>
  );
}

/** The assistant is writing: three dots and the words, for screen readers and for anyone who misses the dots. */
export function TypingBubble() {
  return (
    <li className="bubble-in flex justify-start" aria-label="El asistente está escribiendo">
      <span className="inline-flex items-center gap-2 rounded-[20px] rounded-bl-md bg-vc-bg px-3.5 py-2.5 text-[14px] text-vc-text-3 ring-1 ring-vc-line">
        <span className="app-typing" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        escribiendo…
      </span>
    </li>
  );
}

/** Reply buttons stacked under a bubble (simulated phone). */
export function ReplyButtons({ children }: { children: ReactNode }) {
  return <div className="mt-2 grid gap-1.5">{children}</div>;
}

export function ReplyButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className="vc-pill min-h-11 select-none rounded-2xl border border-vc-edge bg-vc-bg px-3 text-[15px] font-semibold text-vc-text active:bg-vc-surface-press disabled:opacity-60"
    >
      {label}
    </button>
  );
}

/** Quick answers above the composer (/pedir-cita chat). */
export function QuickReplies({ options, disabled, onPick }: { options: string[]; disabled?: boolean; onPick: (label: string) => void }) {
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-vc-line bg-vc-bg-2 px-3 py-2">
      {options.map((b) => (
        <button
          key={b}
          type="button"
          disabled={disabled}
          onClick={() => onPick(b)}
          className="vc-pill min-h-10 rounded-full border border-vc-edge bg-vc-bg px-3.5 text-[14px] font-semibold text-vc-text active:bg-vc-surface-press disabled:opacity-50"
        >
          {b}
        </button>
      ))}
    </div>
  );
}

/** "Se cierra a las 10:30 (12 min)": the offer deadline, with a clock so it is not colour alone. */
export function DeadlineChip({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-vc-warn-soft px-2.5 py-1 text-[12px] font-semibold text-vc-warn">
      <Clock className="size-3.5" aria-hidden />
      {children}
    </p>
  );
}
