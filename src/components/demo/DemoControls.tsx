"use client";

// /demo: two modes over the same data. PRESENTAR is the projected screen of the pitch (presentacion/*); OPERAR is the
// control board for the operator and the questions (ControlCenter and the tools below it). The switch is always in view
// and the mode lives in the URL (?modo=presentar&momento=qr), so the projector laptop can bookmark it.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ExternalLink, Smartphone, Wrench } from "lucide-react";
import { post } from "@/lib/post";
import { DISCLAIMER, num, pct, years } from "@/lib/labels";
import { useDemoState, useNow, useStaffTick } from "@/lib/realtime";
import type { DemoState } from "@/lib/types";
import type { DemoOverview } from "@/lib/demo-overview";
import { PRESENTATION_ORDER, type PresentationMoment } from "@/lib/demo/contract";
import { useServerView } from "@/components/panel/useStaffView";
import { LiveSection, type LiveData } from "./LiveSection";
import { VoiceSessionsView, type VoiceOverview } from "./VoiceSessionsCard";
import { ParamsCard } from "./ParamsCard";
import { ControlCenter } from "./ControlCenter";
import { DemoTheme } from "./DemoTheme";
import { DemoButton, DemoCard, demoField } from "./DemoUi";
import { PresentationMode, isMoment } from "./presentacion/PresentationMode";

export type DemoMode = "presentar" | "operar";

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
type Qr = { url: string; svg: string };
export type Run = (action: string, body?: Record<string, unknown>, success?: string) => Promise<boolean>;

function writeUrl(mode: DemoMode, moment: PresentationMoment) {
  const u = new URL(window.location.href);
  if (mode === "presentar") {
    u.searchParams.set("modo", "presentar");
    u.searchParams.set("momento", moment);
  } else {
    u.searchParams.delete("modo");
    u.searchParams.delete("momento");
  }
  window.history.replaceState(window.history.state, "", u);
}

export function DemoControls({
  cards,
  assumptions,
  publicQr,
  chatQr,
  initialMode = "operar",
  initialMoment = null,
}: {
  cards: QrCard[];
  assumptions: Assumptions;
  publicQr?: Qr;
  chatQr?: Qr;
  initialMode?: DemoMode;
  initialMoment?: string | null;
}) {
  const state = useDemoState();
  const now = useNow(1000);
  const [busy, setBusy] = useState("");
  const [mode, setMode] = useState<DemoMode>(initialMode);
  const [moment, setMoment] = useState<PresentationMoment>(isMoment(initialMoment) ? initialMoment : PRESENTATION_ORDER[0]);
  useStaffTick(Boolean(state?.clock_started_at));
  // one read per view for the whole page: both modes and the tools share them
  const overview = useServerView<DemoOverview>("/api/staff/data?view=overview", ["full", "bulk", "req", "slot", "offer", "live", "call"]);
  const live = useServerView<LiveData>("/api/staff/data?view=live", ["full", "live", "call", "chat", "slot", "bulk"]);
  const voice = useServerView<VoiceOverview>("/api/staff/data?view=voice", ["full", "live", "call", "bulk"]);
  // voice sessions and call states change without a database hint (heartbeats): refresh every 5 s while operating
  const { reload: reloadVoice } = voice;
  const { reload: reloadLive } = live;
  useEffect(() => {
    if (mode !== "operar") return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      reloadVoice();
      reloadLive();
    }, 5000);
    return () => clearInterval(id);
  }, [reloadVoice, reloadLive, mode]);

  const switchMode = useCallback(
    (m: DemoMode) => {
      setMode(m);
      writeUrl(m, moment);
      window.scrollTo(0, 0);
    },
    [moment],
  );
  const changeMoment = useCallback((m: PresentationMoment) => {
    setMoment(m);
    writeUrl("presentar", m);
  }, []);

  const { reload: reloadOverview } = overview;
  const run: Run = async (action, body = {}, success) => {
    setBusy(action);
    try {
      const res = await post<{ sent?: number }>("/api/staff", { action, ...body });
      if (success) toast.success(success.replace("{n}", num(res.sent ?? 0)));
      reloadOverview(); // do not wait for the Realtime hint
      if (action === "end_call") reloadLive();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  };

  if (mode === "presentar") {
    return <PresentationMode moment={moment} onMoment={changeMoment} onExit={() => switchMode("operar")} overview={overview.data} chatQr={chatQr ?? null} />;
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
      overview={overview.data}
      liveData={live.data}
      voiceData={voice.data}
      live={<LiveSection data={live.data} />}
      voice={<VoiceSessionsView data={voice.data} />}
      params={<ParamsCard />}
      onPresent={() => switchMode("presentar")}
    />
  );
}

type DemoControlsViewProps = {
  cards: QrCard[];
  assumptions: Assumptions;
  publicQr?: Qr;
  state: DemoState | null;
  now: number;
  busy: string;
  run: Run | ((action: string, body?: Record<string, unknown>, success?: string) => void);
  live: ReactNode;
  voice: ReactNode;
  params: ReactNode;
  /** control center data (optional so /dev/pantallas can render the page without the server) */
  overview?: DemoOverview | null;
  liveData?: LiveData | null;
  voiceData?: VoiceOverview | null;
  /** switches to the projected mode (absent in /dev/pantallas) */
  onPresent?: () => void;
};

/** /demo OPERAR, props only (DemoControls owns the hooks and the server calls). Also rendered by /dev/pantallas.
 *  First screen: the control board. Below it: preparation and every operator tool. Last: the one notice line. */
export function DemoControlsView({
  cards,
  assumptions,
  publicQr,
  state,
  now,
  busy,
  run,
  live,
  voice,
  params,
  overview = null,
  liveData = null,
  voiceData = null,
  onPresent,
}: DemoControlsViewProps) {
  const runP: Run = async (a, b, s) => (await run(a, b, s)) !== false;
  return (
    <div className="cc-root min-w-0">
      <DemoTheme />
      <ControlCenter state={state} now={now} busy={busy} run={runP} overview={overview} live={liveData} voice={voiceData} onPresent={onPresent} />

      <main id="herramientas" className="mx-auto max-w-[1300px] scroll-mt-4 space-y-5 border-t border-(--cc-border) px-4 py-8 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-[24px] font-bold leading-tight">
            <Wrench className="size-6 text-(--cc-accent)" aria-hidden /> Preparación y herramientas
          </h2>
          <p className="mt-1 max-w-[70ch] text-[15px] text-(--cc-text-2)">
            Vincule el chat a Julio, pruebe mensajes y llamadas, abra los teléfonos simulados y ajuste los supuestos.
          </p>
        </div>

        <div>{live}</div>
        <div>{voice}</div>

        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Teléfonos simulados">
          {cards.map((c) => (
            <li key={c.id}>
              <PhoneQrCard c={c} />
            </li>
          ))}
        </ol>

        {publicQr && (
          <p className="text-[14px] text-(--cc-text-2)">
            Enlace público para pedir una cita:{" "}
            <a href={publicQr.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all font-semibold text-(--cc-accent) underline underline-offset-4">
              {publicQr.url}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          {state && <Settings key={state.version} state={state} busy={!!busy} onSave={(s) => run("settings", { settings: s }, "Ajustes guardados")} />}
          <div>{params}</div>
        </div>

        {assumptions && (
          <DemoCard className="p-5">
            <h2 className="text-[19px] font-bold">Supuestos de la simulación</h2>
            <p className="mt-1.5 max-w-[80ch] text-[14px] leading-relaxed text-(--cc-text-2)">
              Los pacientes sin código QR responden solos para que el tablero se mueva como en un día real. Son supuestos, no
              datos: la probabilidad de no responder es {pct(assumptions.no_reply_base)} + {pct(assumptions.no_reply_per_risk)} × riesgo;
              entre quienes responden, la de liberar el cupo es {pct(assumptions.release_base)} + {pct(assumptions.release_per_risk)} × riesgo,
              y {pct(assumptions.talk_to_person)} pide hablar con una persona. Responden entre 3 y {assumptions.max_delay_min} minutos
              después del recordatorio.
            </p>
          </DemoCard>
        )}
      </main>

      {/* the one notice line of the screen (the site footer is hidden on /demo, see DemoTheme) */}
      <footer className="cc-footer border-t border-(--cc-border) bg-(--cc-surface) px-4 py-1.5 sm:px-6 xl:sticky xl:bottom-0 xl:z-10">
        <p className="text-[13px] leading-snug text-(--cc-text-2) 2xl:text-[14px]">
          {DISCLAIMER} Fuente: Plataforma Nacional de Datos Abiertos del Perú (ODC-BY).
        </p>
      </footer>
    </div>
  );
}

function PhoneQrCard({ c }: { c: QrCard }) {
  return (
    <DemoCard className="flex h-full flex-col p-3.5">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-(--cc-accent)">
        <Smartphone className="size-4" aria-hidden /> Teléfono {c.demo_order}
      </p>
      <p className="mt-1 text-[17px] font-bold leading-tight">{c.full_name}</p>
      <p className="mt-0.5 text-[12px] text-(--cc-text-2)">
        {years(c.age)}
        {c.caregiver_name ? ` · responde ${c.caregiver_name} (${c.caregiver_relation})` : ""}
      </p>
      <p className="mt-1.5 text-[14px] leading-snug">{c.demo_label}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-(--cc-text-2)">{c.detail}</p>
      <div className="mt-auto pt-3.5">
        <div
          className="mx-auto w-full max-w-[180px] rounded-md border border-(--cc-border) bg-(--cc-surface) p-1.5 [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: c.svg }}
          role="img"
          aria-label={`Código QR del teléfono de ${c.full_name}`}
        />
      </div>
      <a
        href={c.url}
        target="_blank"
        rel="noreferrer"
        className="mt-2.5 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-(--cc-control) text-[13px] font-semibold text-(--cc-text) hover:bg-(--cc-subtle) active:bg-(--cc-subtle)"
      >
        <Smartphone className="size-4" aria-hidden /> Abrir aquí
      </a>
      <p className="mt-1.5 break-all text-center text-[11px] text-(--cc-text-2)">{c.url}</p>
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
        <span className="w-14 text-[13px] text-(--cc-text-2)">{unit}</span>
      </span>
    </label>
  );
  return (
    <DemoCard className="p-5">
      <h2 className="text-[19px] font-bold">Ajustes (supuestos editables)</h2>
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
            className="size-5 accent-[var(--cc-accent)]"
          />
        </label>
        <p className="text-[12px] text-(--cc-text-2)">Umbrales por defecto: el 10 % de mayor riesgo y el 35 % siguiente en octubre a diciembre de 2023.</p>
        <DemoButton type="submit" disabled={busy}>
          Guardar ajustes
        </DemoButton>
      </form>
    </DemoCard>
  );
}
