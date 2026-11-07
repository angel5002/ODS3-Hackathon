"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Clock3, ExternalLink, FastForward, QrCode, RotateCcw, Send, Smartphone } from "lucide-react";
import { post } from "@/lib/post";
import { demoNowMin, fmtMin, num, pct, years } from "@/lib/labels";
import { useDemoState, useNow, useStaffTick } from "@/lib/realtime";
import type { DemoState } from "@/lib/types";
import { LiveSection } from "./LiveSection";
import { VoiceSessionsCard } from "./VoiceSessionsCard";
import { ParamsCard } from "./ParamsCard";
import { DemoButton, DemoCard, demoField, stagger } from "./DemoUi";

export type QrCard = {
  id: string;
  full_name: string;
  age: number;
  demo_label: string;
  demo_order: number;
  caregiver_name: string | null;
  caregiver_relation: string | null;
  url: string;
  svg: string;
  detail: string;
};
type Assumptions = Record<string, number> | null;

export function DemoControls({ cards, assumptions, publicQr }: { cards: QrCard[]; assumptions: Assumptions; publicQr?: { url: string; svg: string } }) {
  const state = useDemoState();
  const now = useNow(1000);
  const [busy, setBusy] = useState("");
  useStaffTick(Boolean(state?.clock_started_at));

  async function run(action: string, body: Record<string, unknown> = {}, success?: string) {
    setBusy(action);
    try {
      const res = await post<{ sent?: number }>("/api/staff", { action, ...body });
      if (success) toast.success(success.replace("{n}", num(res.sent ?? 0)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <DemoControlsView
      cards={cards}
      assumptions={assumptions}
      publicQr={publicQr}
      state={state}
      now={now}
      busy={busy}
      run={run}
      live={<LiveSection />}
      voice={<VoiceSessionsCard />}
      params={<ParamsCard />}
    />
  );
}

type DemoControlsViewProps = {
  cards: QrCard[];
  assumptions: Assumptions;
  publicQr?: { url: string; svg: string };
  state: DemoState | null;
  now: number;
  busy: string;
  run: (action: string, body?: Record<string, unknown>, success?: string) => void;
  live: ReactNode;
  voice: ReactNode;
  params: ReactNode;
};

/** /demo, props only (DemoControls owns the hooks and the server calls). Also rendered by /dev/pantallas. */
export function DemoControlsView({ cards, assumptions, publicQr, state, now, busy, run, live, voice, params }: DemoControlsViewProps) {
  return (
    <div className="bg-vc-bg-2 text-vc-text" style={{ backgroundImage: "radial-gradient(70% 420px at 50% 0%, var(--vc-surface), transparent 75%)" }}>
      <main className="vc-enter mx-auto max-w-[1300px] space-y-5 px-4 py-7 sm:px-6">
        <div style={stagger(0)}>
          <h1 className="font-display text-[32px] font-bold leading-tight tracking-[-0.02em]">Demo y códigos QR</h1>
          <p className="mt-1 text-[15px] text-vc-text-2">Escanee un código con un celular: abre el teléfono simulado de ese paciente.</p>
        </div>

        {publicQr && (
          <section style={stagger(1)} className="flex flex-wrap items-center gap-5 rounded-[22px] bg-vc-primary p-4 text-vc-on-primary sm:p-5">
            <div
              className="w-32 shrink-0 rounded-2xl bg-vc-bg p-2 [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: publicQr.svg }}
              role="img"
              aria-label="Código QR de /pedir-cita"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-vc-on-primary-2">
                <QrCode className="size-4" aria-hidden /> Para el jurado
              </p>
              <p className="mt-1 font-display text-[22px] font-bold leading-tight tracking-[-0.01em]">Pedir una cita desde su celular</p>
              <p className="mt-1 text-[14px] text-vc-on-primary-2">Chat, llamada en el navegador o formulario. Sin instalar nada y sin dar su número.</p>
              <a
                href={publicQr.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 break-all text-[14px] font-semibold text-vc-on-primary underline decoration-vc-on-primary-2 underline-offset-4"
              >
                {publicQr.url}
                <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              </a>
            </div>
          </section>
        )}

        <ol style={stagger(2)} className="vc-enter grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((c, n) => (
            <li key={c.id} style={stagger(n)}>
              <PhoneQrCard c={c} />
            </li>
          ))}
        </ol>

        <div style={stagger(3)} className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <DemoCard className="p-5">
            <h2 className="font-display text-[19px] font-bold tracking-[-0.01em]">Reloj y etapas de la demo</h2>
            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
              <p className="flex items-center gap-2 text-vc-text-2">
                <Clock3 className="size-5 text-vc-icon" aria-hidden />
                <span className="text-[14px]">Hora de la demo:</span>
                <strong className="font-display text-[34px] font-bold leading-none tabular-nums tracking-[-0.02em] text-vc-text">
                  {state ? fmtMin(demoNowMin(state, now)) : "--:--"}
                </strong>
              </p>
              <p className="pb-1 text-[13px] text-vc-text-2">
                {state?.clock_started_at ? `(avanza ${state.speed} veces más rápido que el reloj real)` : "(arranca al enviar los recordatorios)"}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <DemoButton variant="primary" disabled={!!busy} onClick={() => run("reminders", {}, "Recordatorios enviados a {n} citas")}>
                <Send className="size-4" aria-hidden /> 1. Enviar recordatorios
              </DemoButton>
              <DemoButton disabled={!!busy || !state?.clock_started_at} onClick={() => run("advance", { minutes: 30 }, "Reloj adelantado 30 minutos")}>
                <FastForward className="size-4" aria-hidden /> Adelantar 30 min
              </DemoButton>
              <DemoButton
                disabled={!!busy || !state?.clock_started_at}
                onClick={() => run("advance", { minutes: state?.reply_deadline_min ?? 180 }, "Plazo de respuesta cumplido")}
              >
                <FastForward className="size-4" aria-hidden /> 2. Cerrar el plazo de respuesta
              </DemoButton>
            </div>
            <p className="mt-3 max-w-[70ch] text-[13px] leading-snug text-vc-text-2">
              Al cerrar el plazo (3 h), las citas que no respondieron pasan a «Sin respuesta» (la cita se mantiene) y el asistente
              llama a las del 10 % de mayor riesgo y a quienes no usan mensajería (paso de 48 h).
            </p>
            <div className="mt-5 border-t border-vc-line pt-4">
              <DemoButton
                variant="danger"
                disabled={!!busy}
                onClick={() => {
                  if (window.confirm("¿Reiniciar la demo? Se borran mensajes, llamadas, ofertas, asignaciones, solicitudes nuevas y las sesiones de chat en vivo. Todo vuelve a los datos fijos de la sección 1.")) {
                    run("reset", {}, "Demo reiniciada");
                  }
                }}
              >
                <RotateCcw className="size-4" aria-hidden /> Reiniciar demo
              </DemoButton>
            </div>
          </DemoCard>

          {state && <Settings key={state.version} state={state} busy={!!busy} onSave={(s) => run("settings", { settings: s }, "Ajustes guardados")} />}
        </div>

        <div style={stagger(4)}>{live}</div>
        <div style={stagger(5)}>{voice}</div>
        <div style={stagger(6)}>{params}</div>

        {assumptions && (
          <DemoCard style={stagger(7)} className="p-5">
            <h2 className="font-display text-[19px] font-bold tracking-[-0.01em]">Supuestos de la simulación</h2>
            <p className="mt-1.5 max-w-[80ch] text-[14px] leading-relaxed text-vc-text-2">
              Los pacientes sin código QR responden solos para que el tablero se mueva como en un día real. Son supuestos, no
              datos: la probabilidad de no responder es {pct(assumptions.no_reply_base)} + {pct(assumptions.no_reply_per_risk)} × riesgo;
              entre quienes responden, la de liberar el cupo es {pct(assumptions.release_base)} + {pct(assumptions.release_per_risk)} × riesgo,
              y {pct(assumptions.talk_to_person)} pide hablar con una persona. Responden entre 3 y {assumptions.max_delay_min} minutos
              después del recordatorio.
            </p>
          </DemoCard>
        )}
      </main>
    </div>
  );
}

function PhoneQrCard({ c }: { c: QrCard }) {
  return (
    <DemoCard className="flex h-full flex-col p-3.5">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-vc-icon">
        <Smartphone className="size-4" aria-hidden /> Teléfono {c.demo_order}
      </p>
      <p className="mt-1 font-display text-[17px] font-bold leading-tight tracking-[-0.01em]">{c.full_name}</p>
      <p className="mt-0.5 text-[12px] text-vc-text-2">
        {years(c.age)}
        {c.caregiver_name ? ` · responde ${c.caregiver_name} (${c.caregiver_relation})` : ""}
      </p>
      <p className="mt-1.5 text-[14px] leading-snug">{c.demo_label}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-vc-text-2">{c.detail}</p>
      <div className="mt-auto pt-3.5">
        <div
          className="mx-auto w-full max-w-[180px] rounded-2xl border border-vc-line bg-vc-bg p-1.5 [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: c.svg }}
          role="img"
          aria-label={`Código QR del teléfono de ${c.full_name}`}
        />
      </div>
      <a
        href={c.url}
        target="_blank"
        rel="noreferrer"
        className="vc-pill mt-2.5 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-vc-edge text-[13px] font-semibold text-vc-text hover:bg-vc-bg-2 active:bg-vc-surface-press"
      >
        <Smartphone className="size-4" aria-hidden /> Abrir aquí
      </a>
      <p className="mt-1.5 break-all text-center text-[11px] text-vc-text-3">{c.url}</p>
    </DemoCard>
  );
}

export function Settings({ state, busy, onSave }: { state: DemoState; busy: boolean; onSave: (s: Record<string, unknown>) => void }) {
  const [v, setV] = useState({
    threshold_high: Math.round(state.threshold_high * 100),
    threshold_mid: Math.round(state.threshold_mid * 100),
    call_list_pct: Math.round(state.call_list_pct * 100),
    reply_deadline_min: state.reply_deadline_min,
    offer_deadline_min: state.offer_deadline_min,
    speed: state.speed,
    simulate_others: state.simulate_others,
  });
  const field = (k: keyof typeof v, label: string, unit: string, min: number, max: number) => (
    <label className="flex items-center justify-between gap-3 text-[14px]">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input type="number" min={min} max={max} value={v[k] as number} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className={demoField} />
        <span className="w-14 text-[13px] text-vc-text-2">{unit}</span>
      </span>
    </label>
  );
  return (
    <DemoCard className="p-5">
      <h2 className="font-display text-[19px] font-bold tracking-[-0.01em]">Ajustes (supuestos editables)</h2>
      <form
        className="mt-3 space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...v,
            threshold_high: v.threshold_high / 100,
            threshold_mid: v.threshold_mid / 100,
            call_list_pct: v.call_list_pct / 100,
          });
        }}
      >
        {field("threshold_high", "Riesgo alto desde", "%", 5, 99)}
        {field("threshold_mid", "Riesgo medio desde", "%", 1, 98)}
        {field("call_list_pct", "Tamaño de la lista de llamadas", "% citas", 1, 50)}
        {field("reply_deadline_min", "Plazo para responder el recordatorio", "min", 10, 600)}
        {field("offer_deadline_min", "Plazo para aceptar un cupo ofrecido", "min", 5, 240)}
        {field("speed", "Velocidad del reloj de la demo", "× real", 1, 600)}
        <label className="flex items-center justify-between gap-3 text-[14px]">
          <span>Simular respuestas de los pacientes sin QR</span>
          <input
            type="checkbox"
            checked={v.simulate_others}
            onChange={(e) => setV({ ...v, simulate_others: e.target.checked })}
            className="size-5 accent-[var(--vc-icon)]"
          />
        </label>
        <p className="text-[12px] text-vc-text-2">Umbrales por defecto: el 10 % de mayor riesgo y el 35 % siguiente en octubre a diciembre de 2023.</p>
        <DemoButton type="submit" disabled={busy}>
          Guardar ajustes
        </DemoButton>
      </form>
    </DemoCard>
  );
}
