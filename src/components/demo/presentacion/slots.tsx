"use client";

// /demo presentation mode: the SLOTS where the other E5 tracks plug in. Contract: src/lib/demo/contract.ts.
//
//   JURY_CHAT_PATH      -> track E: the public chat link of the projected QR (moment 1), in config.ts (server-safe)
//   Scene1CallSlot      -> track C: scene 1 playback inside the "Respira" call screen (CallView, src/components/scenes)
//   PreconsultaChatSlot -> track C: the scene 2 chat (the lines shown by the scene controller)
//   DoctorSummarySlot   -> track C: the doctor summary, built by the real pre-visit machine (scene2Summary)
//   useJuryOverview     -> track E: GET /api/staff/data?view=jurado (hooks.ts; falls back to fixtures.ts on 4xx)
import { useLayoutEffect, useRef, useState } from "react";
import { BatteryFull, Check, CircleDashed, HelpCircle, Pill, ShieldAlert, ShieldCheck, Signal, Stethoscope, Wifi } from "lucide-react";
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
// The phone is drawn at a real phone's size (320 × 680 CSS px, a small phone's layout) and scaled to the
// height the moment gives it, so the call screen, the ticket and the type keep their phone proportions.
const PHONE_W = 320;
const PHONE_H = 680;

export function Scene1CallSlot({ controller: c }: { controller: PlaybackController }) {
  const call = scene1CallProps(c);
  const cue = c.line.cue?.phone ?? "ticket";
  const booked = cue === "finalizada"; // after "Listo. Su cita quedó reservada…": the new appointment, highlighted
  const said = c.line.who === "ia" ? c.line.text : booked ? "Nueva cita de Tito: oncología, mañana 9:00" : call ? (call.phase === "entrante" ? "Llamada entrante del hospital" : "") : "Cita de Tito: oncología, dentro de 5 semanas";
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.8);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setK(Math.max(0.3, Math.min(el.clientHeight / (PHONE_H + 20), 1.2)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <figure className="flex h-full min-h-0 flex-col items-center justify-center gap-[0.5em] self-stretch">
      <div ref={box} className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div style={{ width: (PHONE_W + 20) * k, height: (PHONE_H + 20) * k }} className="relative shrink-0" aria-hidden inert>
          <div
            style={{ width: PHONE_W + 20, height: PHONE_H + 20, transform: `scale(${k})`, transformOrigin: "top left" }}
            className="absolute left-0 top-0 rounded-[52px] bg-[#151a19] p-[10px] shadow-[0_18px_50px_-24px_rgba(0,0,0,0.45)]"
          >
            <div className="relative h-full w-full overflow-hidden rounded-[42px] bg-(--pr-bg)">
              {/* status bar */}
              <div className="absolute inset-x-0 top-0 z-10 flex h-[38px] items-center justify-between px-[26px] text-[14px] font-semibold text-(--pr-ink)">
                <span className="tabular-nums">9:41</span>
                <span className="absolute left-1/2 top-[10px] h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-[#151a19]" />
                <span className="flex items-center gap-[5px]">
                  <Signal className="size-[15px]" />
                  <Wifi className="size-[15px]" />
                  <BatteryFull className="size-[19px]" />
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 top-[38px]">
                {call && !booked ? <CallView {...call} /> : <Appointment booked={booked} />}
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="shrink-0 text-[0.9em] font-semibold text-(--pr-muted)">Celular de Tito</figcaption>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </figure>
  );
}

function Appointment({ booked }: { booked: boolean }) {
  return (
    <div key={booked ? "new" : "old"} className="pr-fade flex h-full flex-col items-center justify-center gap-[14px] px-[28px] text-center">
      <p className="whitespace-nowrap text-[16px] font-semibold text-(--pr-muted)">Hospital Mirasur · Su cita</p>
      <p className="pr-title text-[40px] leading-none">Oncología</p>
      {booked ? (
        <>
          <p className="rounded-[14px] px-[18px] py-[8px] text-[34px] font-bold leading-tight text-white" style={{ background: "var(--color-accent, #0c6b62)" }}>
            Mañana 9:00
          </p>
          <p className="text-[18px] font-semibold" style={{ color: "var(--color-accent, #0c6b62)" }}>
            Cita reservada
          </p>
        </>
      ) : (
        <>
          <p className="text-[22px] leading-snug">
            Lunes 20 de noviembre
            <br />
            9:00
          </p>
          <p className="rounded-[10px] bg-(--pr-no-soft) px-[14px] py-[6px] text-[20px] font-bold text-(--pr-no)">Dentro de 5 semanas</p>
        </>
      )}
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
