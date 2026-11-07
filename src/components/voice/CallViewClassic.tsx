"use client";

// BACKUP (E5 stoic): the previous call screen with the wave (E5 v2 / E5 estilo), kept per the team rule "do not
// delete implementations that work". Not used by the app; CallView.tsx is the "Respira" screen.
// Presentational call screen (E5 v2). It receives ONLY CallViewProps (src/lib/voice/contract.ts) plus the
// optional `theme`: no SDK, no server calls, no database. The controller maps the voice state machine to
// `phase` and wires the actions; a button is drawn only when its callback exists. Rendered as
// `absolute inset-0` inside a relative container: the simulated phone frame, the chat, or a full page.
//
// Layout of the live call: one top line (identification, timer), the wave as the protagonist (38 % of the
// height), the state in two or three words, the last caption only (two lines at most), three controls
// (Silenciar, Colgar, Chat), a discreet "Hablar con una persona" and one safety line. No demo notice here: the
// pages around the call carry it in their footer (docs/estilo.md).
// Colours are the --vc-* tokens of src/app/globals.css (the light palette, "claro"): flat, no glow, no wash.
// The round call buttons are the one exception to the 4 px corners: a phone convention people recognise.
import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  Bot,
  Captions,
  CaptionsOff,
  Check,
  Hourglass,
  MessageSquareText,
  Mic,
  MicOff,
  MonitorSmartphone,
  Phone,
  PhoneOff,
  RotateCcw,
  ShieldCheck,
  Unplug,
  UserRound,
  WifiOff,
} from "lucide-react";
import type { AudioLevels, CallPhase, CallViewProps, Caption } from "@/lib/voice/contract";
import { DEFAULT_VOICE_THEME, type VoiceTheme } from "@/lib/voice/theme";
import { VoiceWave } from "./VoiceWave";

/** The one safety line shown on every call screen. */
export const CALL_SAFETY_LINE = "Nunca pedimos pagos, claves, códigos ni su DNI completo";

/** "Asistente automatizado · Hospital Mirasur" (the establishment comes from the controller) */
export const callIdentification = (establishment: string) => `Asistente automatizado · ${establishment}`;

export type CallViewExtraProps = {
  /** Visual variant (optional, default and only value "claro"). Sets data-voice-theme on the root. */
  theme?: VoiceTheme;
};

/** phases in which the wave is on screen (the canvas stays mounted across them) */
const TALK: CallPhase[] = ["conectando", "activa", "guion", "finalizando"];
/** phases in which "Hablar con una persona" makes sense */
const PERSON_OK: CallPhase[] = ["reconectar", "conectando", "activa", "guion", "ocupado", "sin_conexion"];

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** the state under the wave, in two or three words, and a fuller sentence for screen readers */
function talkState(p: CallViewProps): { word: string; spoken: string; tone: "agente" | "persona" | "rest" } {
  switch (p.phase) {
    case "conectando":
      return { word: "Conectando", spoken: "Conectando la llamada", tone: "agente" };
    case "finalizando":
      return { word: "Terminando", spoken: "Terminando la llamada", tone: "rest" };
    case "guion":
      return p.agentSpeaking
        ? { word: "Hablando", spoken: "El asistente está hablando", tone: "agente" }
        : { word: "Elija una respuesta", spoken: "Responda tocando una opción", tone: "rest" };
    default:
      if (p.thinking) return { word: "Pensando", spoken: "El asistente está pensando", tone: "agente" };
      if (p.agentSpeaking) return { word: "Hablando", spoken: "El asistente está hablando", tone: "agente" };
      if (p.muted) return { word: "Silenciado", spoken: "Micrófono silenciado. El asistente no le escucha.", tone: "rest" };
      return { word: "Te escucho", spoken: "El asistente le escucha", tone: "persona" };
  }
}

const TONE_COLOR = { agente: "var(--vc-agent)", persona: "var(--vc-person)", rest: "var(--vc-rest)" } as const;

export function CallViewClassic(props: CallViewProps & CallViewExtraProps) {
  const { phase, establishment, agentSpeaking, thinking, muted, seconds, busy, levels, actions } = props;
  const theme = props.theme ?? DEFAULT_VOICE_THEME;
  const talk = TALK.includes(phase);
  const live = phase === "activa" || phase === "guion";

  // muted: the wave must not show the microphone, whatever the controller still feeds
  const waveLevels = useMemo<AudioLevels | null>(() => {
    if (!levels) return null;
    if (!muted) return levels;
    return { input: () => null, output: levels.output };
  }, [levels, muted]);

  const speaker: "agente" | "persona" | null =
    phase === "activa" ? (agentSpeaking || thinking ? "agente" : "persona") : phase === "guion" ? (agentSpeaking ? "agente" : null) : null;
  const waveActive = (phase === "activa" && !(muted && !agentSpeaking && !thinking)) || (phase === "guion" && agentSpeaking);

  const showPerson = !!actions.talkToPerson && PERSON_OK.includes(phase) && !(phase === "ocupado" && busy?.kind === "otro_dispositivo");
  // one key per screen: a new key replays the staggered entrance; the talk phases share one so the wave lives on
  const stageKey = talk ? "talk" : phase === "ocupado" ? `ocupado-${busy?.kind ?? "capacidad"}` : phase;

  return (
    <div
      role="dialog"
      aria-label="Llamada del asistente automatizado"
      data-voice-theme={theme}
      className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-vc-bg text-vc-text [container-type:size]"
    >

      <TopLine establishment={establishment} duration={live || phase === "finalizando" ? formatDuration(seconds) : null} />

      <main className="relative flex min-h-0 w-full flex-1 flex-col">
        {talk ? (
          <TalkStage {...props} speaker={speaker} waveActive={waveActive} waveLevels={waveLevels} theme={theme} />
        ) : (
          <div
            key={stageKey}
            className="vc-enter mx-auto flex min-h-0 w-full max-w-[600px] flex-1 flex-col items-center overflow-y-auto px-6 py-2 text-center [justify-content:safe_center]"
          >
            <StaticStage {...props} />
          </div>
        )}
      </main>

      <footer className="relative mx-auto w-full max-w-[600px] shrink-0 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2">
        <div key={stageKey} className="vc-enter">
          <div style={{ "--i": 2 } as CSSProperties}>
            <Controls {...props} />
          </div>
          {showPerson && (
            <div className="mt-2 flex justify-center" style={{ "--i": 3 } as CSSProperties}>
              <button
                type="button"
                onClick={actions.talkToPerson}
                className="vc-pill inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[15px] font-semibold text-vc-text-2 underline decoration-vc-edge decoration-1 underline-offset-4 active:bg-vc-surface"
              >
                <UserRound className="size-4" aria-hidden />
                Hablar con una persona
              </button>
            </div>
          )}
          {phase !== "finalizada" && (
            <p className="-mx-3 mt-1.5 text-balance text-center text-[13px] leading-snug text-vc-text-3 @md:text-[14px]" style={{ "--i": 4 } as CSSProperties}>
              <ShieldCheck className="mr-1 inline size-4 align-[-3px] text-vc-icon" aria-hidden />
              {CALL_SAFETY_LINE}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

/** One line: the identification and the timer, over a 1 px rule. The identification wraps, never cuts. */
function TopLine({ establishment, duration }: { establishment: string; duration: string | null }) {
  return (
    <header className="relative w-full shrink-0 border-b border-vc-line">
      <div className="mx-auto flex w-full max-w-[920px] items-center justify-between gap-3 px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top,0px))] text-[14px] leading-snug">
        <p className="min-w-0 text-vc-text-2">{callIdentification(establishment)}</p>
        <span
          className="min-w-[3.25rem] shrink-0 text-right text-[15px] font-semibold tabular-nums text-vc-text"
          aria-label={duration ? `Duración ${duration}` : undefined}
        >
          {duration}
        </span>
      </div>
    </header>
  );
}

function TalkStage(
  p: CallViewProps & {
    speaker: "agente" | "persona" | null;
    waveActive: boolean;
    waveLevels: AudioLevels | null;
    theme: VoiceTheme;
  },
) {
  const state = talkState(p);
  const guion = p.phase === "guion";
  const last = p.captions.length ? p.captions[p.captions.length - 1] : null;
  const showCaptions = p.phase !== "conectando";

  return (
    <div className={`vc-enter flex min-h-0 flex-1 flex-col items-center ${guion ? "" : "justify-center pb-2"}`}>
      {/* the wave: the protagonist. 38 % of the screen height (cqh of the call root) in the live call, smaller
          when the script options need room */}
      <div
        className="relative min-h-24 w-full max-w-[1100px]"
        style={{ flex: guion ? "0 1 22cqh" : "0 1 38cqh", "--i": 0 } as CSSProperties}
      >
        <VoiceWave
          levels={p.waveLevels}
          active={p.waveActive}
          speaker={p.speaker}
          theme={p.theme}
          connecting={p.phase === "conectando"}
          ending={p.phase === "finalizando"}
        />
      </div>

      {/* never shrinks: when the height is short the wave gives way, the state and the caption do not */}
      <div className="flex w-full max-w-[600px] shrink-0 flex-col items-center px-6" style={{ "--i": 1 } as CSSProperties}>
        <p role="status" aria-live="polite" aria-atomic="true" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none"
            style={{ background: TONE_COLOR[state.tone] }}
          />
          <span key={state.word} aria-hidden className="vc-swap text-[26px] font-bold leading-tight @lg:text-[30px]">
            {state.word}
          </span>
          <span className="sr-only">{state.spoken}</span>
        </p>

        {showCaptions && (
          <CaptionLine last={last} visible={p.captionsVisible} onToggle={p.actions.toggleCaptions} lines={guion ? 3 : 2} live={p.phase === "activa" || guion} />
        )}
      </div>

      {guion && p.scriptOptions.length > 0 && (
        <div
          role="group"
          aria-label="Opciones de respuesta"
          className="mt-auto grid w-full max-w-[600px] gap-2 px-5 pb-3 pt-3"
          style={{ "--i": 2 } as CSSProperties}
        >
          {p.scriptOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={!p.onScriptOption}
              onClick={() => p.onScriptOption?.(o.id)}
              className={`vc-pill min-h-[52px] rounded-md px-4 py-2 text-[17px] font-semibold leading-tight disabled:opacity-50 ${
                o.tone === "primary"
                  ? "bg-vc-primary text-vc-on-primary active:bg-vc-primary-press"
                  : "border border-vc-edge bg-vc-surface text-vc-text active:bg-vc-surface-press"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Last sentence of a caption ("Hola, soy… ¿La cita es para usted?" -> "¿La cita es para usted?"). */
export function lastSentence(text: string) {
  const parts = text.trim().match(/[^.!?…]+[.!?…]*["»)\]]*\s*/g);
  if (!parts) return text.trim();
  for (let i = parts.length - 1; i >= 0; i--) {
    const s = parts[i].trim();
    if (/[\p{L}\p{N}]/u.test(s)) return s;
  }
  return text.trim();
}

/** The last sentence only (the full turn in the fixed script, where the question needs its context), clamped,
 *  with a small button to hide it. The space is reserved so nothing jumps and no line is ever cut in half. */
function CaptionLine({
  last,
  visible,
  onToggle,
  lines,
  live,
}: {
  last: Caption | null;
  visible: boolean;
  onToggle: () => void;
  lines: 2 | 3;
  live: boolean;
}) {
  return (
    <section aria-label="Subtítulos" className="mt-3 flex w-full max-w-[34rem] flex-col items-center">
      <div className={`flex w-full flex-col items-center justify-start ${lines === 3 ? "h-[6.25rem]" : "h-[4.75rem]"}`}>
        {visible &&
          (last ? (
            <div key={last.id} className="vc-swap w-full text-center" aria-live="polite">
              <p className="text-[13px] font-semibold text-vc-text-3">{last.who === "agente" ? "Asistente" : "Usted"}</p>
              <p className={`mt-0.5 text-pretty text-[18px] leading-snug text-vc-text ${lines === 3 ? "line-clamp-3" : "line-clamp-2"}`}>
                {lines === 3 ? last.text : lastSentence(last.text)}
              </p>
            </div>
          ) : (
            live && <p className="pt-4 text-center text-[15px] text-vc-text-3">Aquí verá lo último que se dijo.</p>
          ))}
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!visible}
        className="vc-pill mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[14px] font-semibold text-vc-text-2 active:bg-vc-surface"
      >
        {visible ? <CaptionsOff className="size-4" aria-hidden /> : <Captions className="size-4" aria-hidden />}
        {visible ? "Ocultar subtítulos" : "Mostrar subtítulos"}
      </button>
    </section>
  );
}

function StaticStage(p: CallViewProps) {
  const i = (n: number) => ({ "--i": n }) as CSSProperties;
  switch (p.phase) {
    case "entrante":
      return (
        <>
          <div style={i(0)} className="relative grid size-32 place-items-center @lg:size-36">
            <div aria-hidden className="vc-rings absolute inset-0">
              <span />
              <span />
              <span />
            </div>
            <div className="relative grid size-full place-items-center rounded-full border border-vc-edge bg-vc-surface text-vc-icon">
              <Bot className="size-14" aria-hidden />
            </div>
          </div>
          <p style={i(1)} className="mt-12 text-[15px] text-vc-text-2">
            Llamada entrante
          </p>
          <p style={i(2)} className="mt-1 text-balance text-[28px] font-bold leading-tight">
            {p.purposeLabel}
          </p>
        </>
      );
    case "reconectar":
      return (
        <Message
          icon={<Unplug className="size-10" aria-hidden />}
          title="La llamada sigue abierta"
          detail="Se cortó la voz. Puede volver a conectar o colgar."
        />
      );
    case "finalizada":
      return (
        <Message
          icon={<Check className="size-10" aria-hidden />}
          title="Llamada finalizada"
          detail={p.seconds > 0 ? `Duración ${formatDuration(p.seconds)}` : null}
        />
      );
    case "ocupado":
      if (p.busy?.kind === "otro_dispositivo")
        return (
          <Message
            icon={<MonitorSmartphone className="size-10" aria-hidden />}
            title="Llamada abierta en otro dispositivo"
            detail="Para no tener dos conversaciones, aquí no se abre otra."
          />
        );
      return (
        <>
          <Emblem tone="var(--vc-warn)" style={i(0)}>
            <Hourglass className="size-10" aria-hidden />
          </Emblem>
          <p style={i(1)} role="status" className="vc-after-emblem mt-6 text-balance text-[24px] font-bold leading-tight">
            Todas las líneas están ocupadas
          </p>
          {p.busy?.position != null && p.busy.position > 0 && (
            <p style={i(2)} className="mt-4 flex flex-col items-center">
              <span className="text-[14px] text-vc-text-2">Su lugar en la fila</span>
              <span className="vc-big-number text-6xl font-bold tabular-nums leading-none">{p.busy.position}</span>
            </p>
          )}
          <p style={i(3)} className="vc-optional mt-4 max-w-[30ch] text-pretty text-[16px] leading-snug text-vc-text-2">
            Seguimos intentando. También puede seguir por chat.
          </p>
        </>
      );
    case "sin_conexion":
      return (
        <Message
          icon={<WifiOff className="size-10" aria-hidden />}
          tone="var(--vc-warn)"
          title="No pudimos conectar la voz"
          detail={p.errorMessage || "Revise su conexión a internet e intente de nuevo."}
        />
      );
    default:
      return null;
  }
}

function Message({ icon, title, detail, tone }: { icon: ReactNode; title: string; detail: string | null; tone?: string }) {
  return (
    <>
      <Emblem tone={tone} style={{ "--i": 0 } as CSSProperties}>
        {icon}
      </Emblem>
      <p role="status" style={{ "--i": 1 } as CSSProperties} className="vc-after-emblem mt-6 text-balance text-[24px] font-bold leading-tight">
        {title}
      </p>
      {detail && (
        <p style={{ "--i": 2 } as CSSProperties} className="mt-2 max-w-[32ch] text-pretty text-[16px] leading-snug text-vc-text-2">
          {detail}
        </p>
      )}
    </>
  );
}

function Emblem({ children, tone = "var(--vc-icon)", style }: { children: ReactNode; tone?: string; style?: CSSProperties }) {
  return (
    <div className="vc-emblem grid size-20 shrink-0 place-items-center rounded-2xl border border-vc-line bg-vc-surface" style={{ ...style, color: tone }}>
      {children}
    </div>
  );
}

type RoundTone = "danger" | "accept" | "soft" | "toggle";
const ROUND: Record<RoundTone, string> = {
  danger: "bg-vc-danger text-vc-on-danger active:bg-vc-danger-press",
  accept: "bg-vc-accept text-vc-on-accept active:bg-vc-accept-press",
  soft: "border border-vc-edge bg-vc-surface text-vc-text active:bg-vc-surface-press",
  toggle: "bg-vc-toggle text-vc-on-toggle",
};

function RoundButton({
  label,
  onClick,
  tone,
  children,
  big,
  pressed,
  nudge,
}: {
  label: string;
  onClick: () => void;
  tone: RoundTone;
  children: ReactNode;
  big?: boolean;
  pressed?: boolean;
  nudge?: boolean;
}) {
  return (
    <div className="flex w-[92px] flex-col items-center gap-1.5 @lg:w-[104px]">
      {/* every button sits in a slot as tall as the big one, so buttons share a centre line and labels a top line */}
      <div className="grid h-[76px] place-items-center">
        <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className={`vc-round grid place-items-center rounded-full ${big ? "size-[76px]" : "size-16"} ${ROUND[tone]} ${nudge ? "vc-nudge" : ""}`}
      >
          {children}
        </button>
      </div>
      <span className="text-center text-[14px] font-semibold leading-tight text-vc-text-2" aria-hidden>
        {label}
      </span>
    </div>
  );
}

function PillButton({ label, onClick, tone, icon }: { label: string; onClick: () => void; tone: "primary" | "soft" | "danger"; icon: ReactNode }) {
  const cls =
    tone === "primary"
      ? "bg-vc-primary text-vc-on-primary active:bg-vc-primary-press"
      : tone === "danger"
        ? "bg-vc-danger text-vc-on-danger active:bg-vc-danger-press"
        : "border border-vc-edge bg-vc-surface text-vc-text active:bg-vc-surface-press";
  return (
    <button type="button" onClick={onClick} className={`vc-pill vc-pill-tall flex min-h-14 w-full items-center justify-center gap-2 rounded-md px-4 text-[17px] font-semibold ${cls}`}>
      {icon}
      {label}
    </button>
  );
}

function Controls(p: CallViewProps) {
  const a = p.actions;

  switch (p.phase) {
    case "entrante":
      return (
        <Row wide>
          {a.reject && (
            <RoundButton label="Rechazar" onClick={a.reject} tone="danger" big>
              <PhoneOff className="size-8" aria-hidden />
            </RoundButton>
          )}
          {a.answer && (
            <RoundButton label="Contestar" onClick={a.answer} tone="accept" big nudge>
              <Phone className="size-8" aria-hidden />
            </RoundButton>
          )}
        </Row>
      );
    case "reconectar": {
      const reconnect = a.answer ?? a.retry;
      return (
        <Row wide>
          <RoundButton label="Colgar" onClick={a.hangUp} tone="danger" big>
            <PhoneOff className="size-8" aria-hidden />
          </RoundButton>
          {reconnect && (
            <RoundButton label="Volver a conectar" onClick={reconnect} tone="accept" big>
              <RotateCcw className="size-8" aria-hidden />
            </RoundButton>
          )}
        </Row>
      );
    }
    case "conectando":
    case "activa":
    case "guion":
      return (
        <Row>
          {a.toggleMute && p.phase !== "conectando" && (
            <RoundButton label="Silenciar" onClick={a.toggleMute} tone={p.muted ? "toggle" : "soft"} pressed={p.muted}>
              {p.muted ? <MicOff className="size-7" aria-hidden /> : <Mic className="size-7" aria-hidden />}
            </RoundButton>
          )}
          <RoundButton label="Colgar" onClick={a.hangUp} tone="danger" big>
            <PhoneOff className="size-8" aria-hidden />
          </RoundButton>
          {a.continueByChat && (
            <RoundButton label="Chat" onClick={a.continueByChat} tone="soft">
              <MessageSquareText className="size-7" aria-hidden />
            </RoundButton>
          )}
        </Row>
      );
    case "finalizando":
      return <div className="h-[100px]" />;
    case "finalizada":
      return (
        <Stack>
          {a.continueByChat && (
            <PillButton label="Seguir por chat" onClick={a.continueByChat} tone="primary" icon={<MessageSquareText className="size-5" aria-hidden />} />
          )}
          {a.leave && <PillButton label="Cerrar" onClick={a.leave} tone="soft" icon={null} />}
        </Stack>
      );
    case "ocupado":
      if (p.busy?.kind === "otro_dispositivo") return <Stack>{a.leave && <PillButton label="Cerrar" onClick={a.leave} tone="soft" icon={null} />}</Stack>;
      return (
        <Stack>
          {a.continueByChat && (
            <PillButton label="Seguir por chat" onClick={a.continueByChat} tone="primary" icon={<MessageSquareText className="size-5" aria-hidden />} />
          )}
          <PillButton label="Colgar" onClick={a.hangUp} tone="danger" icon={<PhoneOff className="size-5" aria-hidden />} />
        </Stack>
      );
    case "sin_conexion":
      return (
        <Stack>
          {a.retry && <PillButton label="Reintentar" onClick={a.retry} tone="primary" icon={<RotateCcw className="size-5" aria-hidden />} />}
          {a.continueByChat && (
            <PillButton label="Seguir por chat" onClick={a.continueByChat} tone="soft" icon={<MessageSquareText className="size-5" aria-hidden />} />
          )}
          <PillButton label="Colgar" onClick={a.hangUp} tone="danger" icon={<PhoneOff className="size-5" aria-hidden />} />
        </Stack>
      );
  }
}

function Row({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`flex items-start justify-center ${wide ? "gap-16 @lg:gap-24" : "gap-3 @lg:gap-10"}`}>{children}</div>;
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="vc-stack mx-auto grid w-full max-w-[400px] gap-2.5">{children}</div>;
}
