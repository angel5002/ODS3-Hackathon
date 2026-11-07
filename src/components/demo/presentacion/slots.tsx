"use client";

// /demo presentation mode: the SLOTS where the other E5 tracks plug in. Each slot renders a light placeholder with the
// pitch script's own lines until the real component exists. To plug one in, replace the body of the slot (keep its
// props) or re-export the real component under the same name. Contract: src/lib/demo/contract.ts.
//
//   JURY_CHAT_PATH      -> track E: the public chat link of the projected QR (moment 1), in config.ts (server-safe)
//   Scene1CallSlot      -> track C: scene 1 playback inside the "Respira" call screen (src/components/scenes/*)
//   PreconsultaChatSlot -> track C: the pre-visit chat (src/components/scenes/* or src/components/preconsulta/*)
//   DoctorSummarySlot   -> track C: the doctor summary (src/components/preconsulta/*), takes a PreconsultaSummary
//   useJuryOverview     -> track E: GET /api/staff/data?view=jurado (hooks.ts; falls back to fixtures.ts on 4xx)
import { Check, Pill, ShieldCheck, Stethoscope } from "lucide-react";
import type { PreconsultaSummary, SceneLine } from "@/lib/demo/contract";
import { SCENE1 } from "./fixtures";

/** "Datos de ejemplo": shown on every view that is still on fixture data, so no figure passes as real */
export function SampleTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-[0.3em] border border-(--pr-line) px-[0.5em] py-[0.1em] text-[0.8em] font-semibold text-(--pr-muted) ${className}`}>
      Datos de ejemplo
    </span>
  );
}

// ------------------------------------------------------------------------------------------------ scene 1 (track C)

/** Controller the scene components expose; Space on the projector calls next(). */
export type SceneController = { next: () => void };

/**
 * PLACEHOLDER for track C's scene 1 playback. Receives the scene clock of the moment: `elapsed` ms and how many cues
 * passed (cues: 9 s red band, 11 s first AI line, 15 s staff approval, 17 s second AI line, 18 s green band).
 * Track C's component can ignore the clock and drive its own audio; if it needs Space, it calls next() of the moment.
 */
export function Scene1CallSlot({ passed }: { elapsed: number; passed: number }) {
  const ia = SCENE1.lines.filter((l) => l.who === "ia");
  const line = passed >= 4 ? ia[1] : passed >= 2 ? ia[0] : null;
  const ringing = passed >= 1 && passed < 2;
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-[0.8em] rounded-[1.2em] border border-(--pr-line) bg-(--pr-soft) p-[1em] text-center">
      <p className="text-[0.9em] font-semibold text-(--pr-muted)">Asistente automático del hospital</p>
      <p className="pr-title text-[1.6em]">Tito</p>
      <div className={`pr-wave flex h-[2.4em] items-center gap-[0.3em] ${line || ringing ? "text-(--pr-accent)" : "text-(--pr-line)"}`} aria-hidden>
        <i style={{ height: "40%" }} />
        <i style={{ height: "80%" }} />
        <i style={{ height: "100%" }} />
        <i style={{ height: "70%" }} />
        <i style={{ height: "45%" }} />
      </div>
      <p key={line?.id ?? (ringing ? "ring" : "idle")} className="pr-fade min-h-[3.6em] text-[1em] leading-snug">
        {line ? line.text : ringing ? "Llamada entrante" : "En espera de la llamada"}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ scene 2 (track C)

/** PLACEHOLDER for track C's pre-visit chat: the lines already said, newest at the bottom. */
export function PreconsultaChatSlot({ lines }: { lines: SceneLine[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-[1.2em] border border-(--pr-line) bg-(--pr-bg) p-[0.8em]">
      <p className="border-b border-(--pr-line) pb-[0.4em] text-[0.9em] font-semibold text-(--pr-muted)">Preconsulta · Clínica</p>
      {/* the newest message sits at the bottom; older ones scroll up and fade out under the top edge */}
      <ol
        className="flex min-h-0 flex-1 flex-col justify-end gap-[0.45em] overflow-hidden pt-[0.5em] [mask-image:linear-gradient(to_bottom,transparent,black_3em)]"
        aria-live="polite"
      >
        {lines.map((l) => (
          <li
            key={l.id}
            className={`pr-in max-w-[88%] shrink-0 rounded-[0.8em] px-[0.7em] py-[0.4em] text-[0.85em] leading-snug ${
              l.who === "ia" ? "self-start bg-(--pr-soft)" : "self-end bg-(--pr-accent) text-white"
            }`}
          >
            {l.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * PLACEHOLDER for track C's doctor summary (proposal v5.1 §4.1–4.2): "referido por el paciente", missing fields as
 * "No informado", verified negations, medicines confirmed one by one, never a diagnosis. Pure: renders the summary.
 */
export function DoctorSummarySlot({ summary }: { summary: PreconsultaSummary }) {
  const meds = summary.medicamentos.length ? summary.medicamentos.map((m) => m.nombre).join(", ") : null;
  const alarm = summary.alarma.preguntada ? (summary.alarma.positiva ? (summary.alarma.detalle ?? "Sí") : (summary.alarma.detalle ?? "No")) : null;
  const rows: { icon: typeof Stethoscope; label: string; value: string | null; ok?: boolean }[] = [
    { icon: Stethoscope, label: "Motivo", value: summary.motivo ? `${summary.motivo}${summary.inicio ? ` · ${summary.inicio.toLowerCase()}` : ""}` : null },
    { icon: Pill, label: "Medicamentos", value: meds, ok: summary.medicamentos.every((m) => m.confirmado) && !!meds },
    { icon: ShieldCheck, label: "Alergias", value: summary.alergias ? summary.alergias[0].toUpperCase() + summary.alergias.slice(1) : null },
    { icon: ShieldCheck, label: "Signos de alarma", value: alarm },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col rounded-[1.2em] border border-(--pr-line) bg-(--pr-bg) p-[1em]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-[0.8em] border-b border-(--pr-line) pb-[0.5em]">
        <p className="pr-title text-[1.3em]">Resumen para el médico</p>
        <p className="text-[0.8em] font-semibold text-(--pr-muted)">Referido por el paciente</p>
      </div>
      <dl className="mt-[0.6em] flex flex-1 flex-col justify-around gap-[0.4em]">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1.4em_1fr] items-start gap-x-[0.6em]">
            <r.icon className="mt-[0.15em] size-[1.1em] text-(--pr-muted)" aria-hidden />
            <div>
              <dt className="text-[0.8em] font-semibold text-(--pr-muted)">{r.label}</dt>
              <dd key={r.value ?? "x"} className={`pr-swap text-[1.05em] leading-snug ${r.value ? "pr-fade font-semibold" : "text-(--pr-muted)"}`}>
                {r.value ?? "No informado"}
                {r.ok ? <Check className="ml-[0.3em] inline size-[0.9em] text-(--pr-yes)" aria-label="confirmado" /> : null}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** the AI never diagnoses: shown under the summary, as in the script */
export const SUMMARY_NOTE = "No diagnostica: ante un signo de alarma, deriva a emergencia.";

