"use client";

// /demo presentation mode: the SLOTS where the other E5 tracks plug in. Contract: src/lib/demo/contract.ts.
//
//   JURY_CHAT_PATH      -> track E: the public chat link of the projected QR (moment 1), in config.ts (server-safe)
//   Scene1CallSlot      -> track C: scene 1 playback inside the "Respira" call screen (CallView, src/components/scenes)
//   PreconsultaChatSlot -> track C: the scene 2 chat (the lines shown by the scene controller)
//   DoctorSummarySlot   -> track C: the doctor summary, built by the real pre-visit machine (scene2Summary)
//   useJuryOverview     -> track E: GET /api/staff/data?view=jurado (hooks.ts; falls back to fixtures.ts on 4xx)
import { Check, CircleDashed, HelpCircle, Pill, ShieldAlert, ShieldCheck, Stethoscope } from "lucide-react";
import type { PreconsultaSummary, SceneLine } from "@/lib/demo/contract";
import type { PreconsultaDetail } from "@/lib/preconsulta/machine";
import { CallView } from "@/components/voice/CallView";
import { scene1CallProps, type SceneController as PlaybackController } from "@/components/scenes";

/** "Datos de ejemplo": shown on every view that is still on fixture data, so no figure passes as real */
export function SampleTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-[0.3em] border border-(--pr-line) px-[0.5em] py-[0.1em] text-[0.8em] font-semibold text-(--pr-muted) ${className}`}>
      Datos de ejemplo
    </span>
  );
}

// ------------------------------------------------------------------------------------------------ scene 1 (track C)

/** Controller the scene moments expose; Space on the projector calls next(). */
export type SceneController = { next: () => void };

/**
 * Scene 1 playback inside the call screen (CallView, the same component of the live calls). Before the call the phone
 * shows Tito's appointment ticket. The AI lines play their pre-generated audio and the wave follows THAT audio.
 * The phone is a picture of a phone on the projector: inert and hidden from screen readers, which get the line said.
 */
export function Scene1CallSlot({ controller: c }: { controller: PlaybackController }) {
  const call = scene1CallProps(c);
  const said = c.line.who === "ia" ? c.line.text : call ? (call.phase === "entrante" ? "Llamada entrante del hospital" : "") : "Cita de Tito: oncología, dentro de 5 semanas";
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div
        className="relative aspect-[9/17] h-full max-h-full max-w-full overflow-hidden rounded-[1.6em] border-[0.45em] border-(--pr-ink) bg-(--pr-bg)"
        aria-hidden
        inert
      >
        {call ? (
          <CallView {...call} />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-center gap-[0.5em] p-[1em] text-center">
            <p className="text-[0.85em] font-semibold text-(--pr-muted)">Hospital Mirasur · Su cita</p>
            <p className="pr-title text-[1.6em]">Oncología</p>
            <p className="text-[1em]">Lunes 20 de noviembre, 9:00</p>
            <p className="mx-auto rounded-[0.3em] bg-(--pr-no-soft) px-[0.6em] py-[0.2em] text-[1.05em] font-bold text-(--pr-no)">Dentro de 5 semanas</p>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ scene 2 (track C)

/** The scene 2 chat: the lines already shown, newest at the bottom (a tap is drawn as the person's answer). */
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
            {l.text.replace(" Responda SÍ o NO.", "")}
          </li>
        ))}
      </ol>
    </div>
  );
}

const SIGN_STATE: Record<string, string> = {
  no: "No",
  si: "Sí",
  por_verificar: "Por verificar",
  no_evaluado: "No evaluado",
};

/**
 * The doctor's summary (proposal v5.1 §4.1–4.2): "referido por el paciente", missing fields as "No informado",
 * verified negations, medicines confirmed one by one, never a diagnosis. Renders the contract's PreconsultaSummary;
 * when it is the machine's PreconsultaDetail it also shows how each alarm sign was answered.
 */
export function DoctorSummarySlot({ summary }: { summary: PreconsultaSummary | PreconsultaDetail }) {
  const d = "signos" in summary ? (summary as PreconsultaDetail) : null;
  const meds = summary.medicamentos.length
    ? summary.medicamentos.map((m) => `${m.nombre}${m.confirmado ? "" : " (sin confirmar)"}`).join(", ")
    : d?.medicamentosEstado === "ninguno"
      ? "Ninguno · negación verificada"
      : null;
  const medsOk = summary.medicamentos.length > 0 && summary.medicamentos.every((m) => m.confirmado);
  const allergy = summary.alergias === "ninguna" ? "Ninguna · negación verificada" : summary.alergias;
  const signs = d?.signos.filter((s) => s.id !== "otro") ?? [];
  const alarm = summary.alarma.positiva
    ? `Sí: ${(summary.alarma.detalle ?? "signo de alarma").toLowerCase()}`
    : summary.alarma.preguntada && signs.length && signs.every((s) => s.estado === "no")
      ? "No · negación verificada"
      : summary.alarma.preguntada
        ? (summary.alarma.detalle ?? "Sin respuesta clara")
        : null;
  const rows: { icon: typeof Stethoscope; label: string; value: string | null; ok?: boolean }[] = [
    { icon: Stethoscope, label: "Motivo", value: summary.motivo ? `«${summary.motivo}»${summary.inicio ? ` · ${summary.inicio}` : ""}` : null },
    { icon: Pill, label: "Medicamentos", value: meds, ok: medsOk },
    { icon: ShieldCheck, label: "Alergias", value: allergy },
    { icon: summary.alarma.positiva ? ShieldAlert : ShieldCheck, label: "Signos de alarma", value: alarm, ok: alarm?.startsWith("No ") },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col rounded-[1.2em] border border-(--pr-line) bg-(--pr-bg) p-[1em]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-[0.8em] border-b border-(--pr-line) pb-[0.5em]">
        <p className="pr-title text-[1.3em]">Resumen para el médico</p>
        <p className="text-[0.8em] font-semibold text-(--pr-accent)">Referido por el paciente</p>
      </div>
      <dl className="mt-[0.6em] flex flex-1 flex-col justify-around gap-[0.4em]">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1.4em_1fr] items-start gap-x-[0.6em]">
            <r.icon className="mt-[0.15em] size-[1.1em] text-(--pr-muted)" aria-hidden />
            <div>
              <dt className="text-[0.8em] font-semibold text-(--pr-muted)">{r.label}</dt>
              <dd key={r.value ?? "x"} className={`pr-swap text-[1.05em] leading-snug ${r.value ? "pr-fade font-semibold" : "text-(--pr-muted)"}`}>
                {r.value ?? "No informado"}
                {r.ok ? <Check className="ml-[0.3em] inline size-[0.9em] text-(--pr-yes)" aria-label="confirmado por el paciente" /> : null}
              </dd>
              {r.label === "Signos de alarma" && summary.alarma.preguntada && signs.length > 0 && (
                <p className="text-[0.8em] text-(--pr-muted)">
                  {signs.map((s) => `${s.label}: ${SIGN_STATE[s.estado] ?? s.estado}`).join(" · ")}
                </p>
              )}
              {r.label === "Signos de alarma" && !summary.alarma.preguntada && (
                <p className="inline-flex items-center gap-[0.3em] text-[0.8em] text-(--pr-muted)">
                  <CircleDashed className="size-[0.9em]" aria-hidden /> Aún no preguntados
                </p>
              )}
              {r.label === "Medicamentos" && summary.medicamentos.some((m) => !m.confirmado) && (
                <p className="inline-flex items-center gap-[0.3em] text-[0.8em] text-(--pr-muted)">
                  <HelpCircle className="size-[0.9em]" aria-hidden /> Se confirma con el paciente uno por uno
                </p>
              )}
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** the AI never diagnoses: shown under the summary, as in the script */
export const SUMMARY_NOTE = "No diagnostica: ante un signo de alarma, deriva a emergencia.";
