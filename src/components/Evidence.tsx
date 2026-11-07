"use client";

// "Qué respalda esta propuesta": a quiet link under the main options of /pedir-cita and the jury cards that opens a
// short sheet with 6 figures, one line each, each with its source (proposal v5.1 / script v7, src/lib/demo/evidence.ts).
// It never competes with asking for the appointment: small text link, native <dialog>, closes with Esc or the button.
import { useRef } from "react";
import { X } from "lucide-react";
import { EVIDENCE, EVIDENCE_CLOSING } from "@/lib/demo/evidence";

export function EvidenceLink({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={`min-h-11 text-[15px] font-medium text-vc-text-2 underline decoration-vc-line underline-offset-4 hover:text-vc-text ${className}`}
      >
        Qué respalda esta propuesta
      </button>
      <dialog
        ref={ref}
        aria-labelledby="evidence-title"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[min(92vw,560px)] rounded-2xl border border-vc-line bg-vc-card p-0 text-vc-text backdrop:bg-black/40"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start gap-3 px-5 pb-2 pt-5">
            <h2 id="evidence-title" className="flex-1 font-display text-[26px] leading-tight">
              Qué respalda esta propuesta
            </h2>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Cerrar"
              className="grid size-11 shrink-0 place-items-center rounded-full text-vc-text-2 hover:bg-vc-bg-2"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <ul className="overflow-y-auto px-5">
            {EVIDENCE.map((e) => (
              <li key={e.figure} className="border-t border-vc-line py-3 first:border-t-0">
                <p className="text-pretty text-[16px] leading-snug">
                  <strong className="font-display text-[20px] font-normal">{e.figure}</strong> {e.text}
                </p>
                <a href={e.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[14px] text-vc-text-2 underline underline-offset-2">
                  {e.source.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="border-t border-vc-line px-5 py-4 text-pretty text-[16px] font-semibold leading-snug">{EVIDENCE_CLOSING}</p>
        </div>
      </dialog>
    </>
  );
}
