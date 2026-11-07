"use client";

// Presentational call screen "Respira" (E5 stoic, docs/estilo.md). It receives ONLY CallViewProps
// (src/lib/voice/contract.ts) plus the optional `theme`: no SDK, no server calls, no database. The controller maps
// the voice state machine to `phase` and wires the actions; a button is drawn only when its callback exists.
// Rendered as `absolute inset-0` inside a relative container: the simulated phone, the chat, or a full page.
//
// One skeleton for every phase, so connecting, talking and hanging up flow into each other:
//   1. one line: "Hospital Mirasur · asistente automatizado" and the time;
//   2. the wave (Respira canvas): several horizontal lines, Siri-like, centred, that follow the real audio —
//      almost flat and breathing while it listens, wide when the assistant speaks (teal), graphite when the
//      person speaks — and the state in small text under it ("Conectando", "Escuchando", "Hablando"…);
//   3. the LAST sentence said (the end, whole: src/lib/voice/captions.ts), or the title and one line of a
//      message phase (busy, no connection, finished…);
//   4. three controls: Silenciar (or "Mantener para hablar" with `pushToTalk`), Colgar, Chat.
// Everything else appears on tap: tapping the wave shows "Hablar con una persona" and the captions switch.
// No demo notice, no safety paragraph (the assistant says it aloud). `scene` hides the controls (projector).
// The round call buttons are the phone convention people recognise; everything else is pill-shaped.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Captions, CaptionsOff, Hand, MessageSquareText, Mic, MicOff, Phone, PhoneOff, RotateCcw, UserRound } from "lucide-react";
import type { AudioLevels, CallPhase, CallViewProps, PushToTalk } from "@/lib/voice/contract";
import { lastSentence as lastSentenceOf, tailCaption, tailSentences, useRevealedCaption } from "@/lib/voice/captions";
import { DEFAULT_VOICE_THEME, type VoiceTheme } from "@/lib/voice/theme";
import { Respira, type RespiraMode } from "./Respira";

/** The safety line (said aloud by the assistant; shown on the voice start screen, not inside a call). */
export const CALL_SAFETY_LINE = "Nunca pedimos pagos, claves, códigos ni su DNI completo";

/** "Hospital Mirasur · asistente automatizado" (the establishment comes from the controller) */
export const callIdentification = (establishment: string) => `${establishment} · asistente automatizado`;

/** Last sentence of a caption. Kept here for older imports; the helper lives in src/lib/voice/captions.ts. */
export const lastSentence = lastSentenceOf;

export type CallViewExtraProps = {
  /** Visual variant (optional, default and only value "claro"). Sets data-voice-theme on the root. */
  theme?: VoiceTheme;
};

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** phases with a live conversation (the disc opens the options, the caption shows the last sentence) */
const TALK: CallPhase[] = ["conectando", "activa", "guion", "finalizando"];

type Look = {
  mode: RespiraMode;
  /** the state in one or two words, small, under the wave */
  word: string;
  /** what a screen reader hears */
  spoken: string;
  /** message phases: one title and one supporting line under the circles */
  title?: string;
  line?: string | null;
};

function look(p: CallViewProps): Look {
  switch (p.phase) {
    case "entrante":
      return { mode: "ring", word: "Llamada entrante", spoken: `Llamada entrante: ${p.purposeLabel}`, title: p.purposeLabel };
    case "reconectar":
      return { mode: "rest", word: "En pausa", spoken: "La llamada sigue abierta", title: "La llamada sigue abierta", line: "Se cortó la voz." };
    case "conectando":
      return { mode: "connect", word: "Conectando", spoken: "Conectando la llamada" };
    case "finalizando":
      return { mode: "end", word: "Terminando", spoken: "Terminando la llamada" };
    case "finalizada":
      return {
        mode: "rest",
        word: "Finalizada",
        spoken: "Llamada finalizada",
        line: p.seconds > 0 ? `Duración ${formatDuration(p.seconds)}` : null,
      };
    case "ocupado":
      if (p.busy?.kind === "otro_dispositivo")
        return { mode: "rest", word: "En otro equipo", spoken: "La llamada está abierta en otro dispositivo", title: "La llamada está abierta en otro dispositivo" };
      return {
        mode: "connect",
        word: "En espera",
        spoken: p.busy?.position ? `Líneas ocupadas. Su lugar en la fila: ${p.busy.position}` : "Líneas ocupadas",
        title: "Líneas ocupadas",
        line: p.busy?.position != null && p.busy.position > 0 ? `Su lugar en la fila: ${p.busy.position}. Seguimos intentando.` : "Seguimos intentando.",
      };
    case "sin_conexion":
      return {
        mode: "rest",
        word: "Sin voz",
        spoken: "No pudimos conectar la voz",
        title: "No pudimos conectar la voz",
        line: p.errorMessage || "Revise su conexión e intente de nuevo.",
      };
    case "guion":
      return p.agentSpeaking
        ? { mode: "speak", word: "Hablando", spoken: "El asistente está hablando" }
        : { mode: "rest", word: "Responda", spoken: "Responda tocando una opción" };
    default:
      if (p.thinking) return { mode: "think", word: "Pensando", spoken: "El asistente está pensando" };
      if (p.agentSpeaking) return { mode: "speak", word: "Hablando", spoken: "El asistente está hablando" };
      if (p.pushToTalk && !p.pushToTalk.talking)
        return { mode: "muted", word: "Su turno", spoken: "Mantenga presionado el botón para hablar" };
      if (p.muted) return { mode: "muted", word: "Silenciado", spoken: "Micrófono silenciado. El asistente no le escucha." };
      return { mode: "listen", word: "Escuchando", spoken: "El asistente le escucha" };
  }
}

export function CallView(props: CallViewProps & CallViewExtraProps) {
  const { phase, establishment, muted, seconds, levels, actions, captions, captionsVisible, scene = false } = props;
  const theme = props.theme ?? DEFAULT_VOICE_THEME;
  const talk = TALK.includes(phase);
  const live = phase === "activa" || phase === "guion" || phase === "finalizando";
  const l = look(props);
  const [menu, setMenu] = useState(false);

  // muted: the wave must not follow the microphone, whatever the controller still feeds
  const waveLevels = useMemo<AudioLevels | null>(() => {
    if (!levels) return null;
    if (!muted) return levels;
    return { input: () => null, output: levels.output };
  }, [levels, muted]);

  // the options close by themselves after a while, and whenever the call leaves the talk phases
  useEffect(() => {
    if (!menu) return;
    const id = setTimeout(() => setMenu(false), 8000);
    return () => clearTimeout(id);
  }, [menu]);
  const menuOpen = menu && talk && !scene;

  const last = captions.length ? captions[captions.length - 1] : null;
  const guion = phase === "guion";
  // the agent's words appear at the pace of its voice (voice track helper), then the end of what was said,
  // whole: the last sentence (the fixed script keeps the sentences that give the question its context)
  const revealed = useRevealedCaption(last, props.agentSpeaking);
  const caption =
    last && revealed && captionsVisible && talk && phase !== "conectando" ? (guion ? tailSentences(revealed, 150) : tailCaption(revealed, 110)) : null;
  const options = guion && props.scriptOptions.length > 0 && !scene;
  const canMenu = talk && !scene;

  return (
    <div
      role="dialog"
      aria-label="Llamada del asistente automatizado"
      data-voice-theme={theme}
      className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-vc-bg text-vc-text [container-type:size]"
    >
      {/* 1. one line: who calls, and the time */}
      <header className="w-full shrink-0">
        <div className="mx-auto flex w-full max-w-[920px] items-baseline justify-between gap-3 px-5 pb-2 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
          <p className="min-w-0 text-[13px] leading-snug text-vc-text-2 @[400px]:text-[14px] @[900px]:text-[16px]">{callIdentification(establishment)}</p>
          <span
            className="min-w-[2.75rem] shrink-0 text-right text-[14px] font-semibold tabular-nums text-vc-text @[900px]:text-[16px]"
            aria-label={live ? `Duración ${formatDuration(seconds)}` : undefined}
          >
            {live ? formatDuration(seconds) : null}
          </span>
        </div>
      </header>

      {/* 2. the wave, centred, and the state in small text under it */}
      <main className="relative min-h-0 w-full flex-1">
        <div className="absolute inset-0">
          <Respira mode={l.mode} levels={waveLevels} />
        </div>
        {canMenu && (
          <button
            type="button"
            aria-label="Más opciones de la llamada"
            aria-expanded={menuOpen}
            onClick={() => setMenu((m) => !m)}
            className="absolute inset-x-0 top-[22%] bottom-[22%]"
          />
        )}
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="pointer-events-none absolute inset-x-0 bottom-[14%] text-center text-[15px] font-medium text-vc-text-2 @[900px]:text-[18px]"
        >
          <span key={l.word} aria-hidden className="vc-swap inline-block">
            {l.word}
          </span>
          <span className="sr-only">{l.spoken}</span>
        </p>
      </main>

      {/* 3. the last sentence, a message, or the options of the disc */}
      <section
        aria-label={menuOpen ? "Opciones" : "Subtítulos"}
        className="mx-auto flex w-full max-w-[640px] shrink-0 flex-col items-center px-6 pt-2 text-center"
      >
        <div className={`flex w-full flex-col items-center justify-start ${talk ? (guion ? "min-h-[4.6rem]" : "min-h-[5.2rem]") : ""}`}>
          {menuOpen ? (
            <div key="menu" className="vc-swap flex flex-wrap justify-center gap-2 pt-1">
              {actions.talkToPerson && (
                <SoftPill
                  onClick={() => {
                    setMenu(false);
                    actions.talkToPerson?.();
                  }}
                  icon={<UserRound className="size-[18px]" aria-hidden />}
                >
                  Hablar con una persona
                </SoftPill>
              )}
              <SoftPill
                onClick={() => {
                  setMenu(false);
                  actions.toggleCaptions();
                }}
                pressed={!captionsVisible}
                icon={captionsVisible ? <CaptionsOff className="size-[18px]" aria-hidden /> : <Captions className="size-[18px]" aria-hidden />}
              >
                {captionsVisible ? "Ocultar subtítulos" : "Mostrar subtítulos"}
              </SoftPill>
            </div>
          ) : l.title || l.line ? (
            <div key={`msg-${phase}`} className="vc-swap pb-1">
              {l.title && <p className="text-balance font-display text-[26px] leading-tight @[900px]:text-[34px]">{l.title}</p>}
              {l.line && <p className="mx-auto mt-1.5 max-w-[34ch] text-pretty text-[16px] leading-snug text-vc-text-2 @[900px]:text-[18px]">{l.line}</p>}
            </div>
          ) : caption && last ? (
            <p key={last.id} className="vc-swap text-pretty text-[18px] leading-snug text-vc-text @[900px]:text-[24px]" aria-live="polite">
              <span className="sr-only">{last.who === "agente" ? "Asistente: " : "Usted: "}</span>
              <span className={last.who === "persona" ? "text-vc-text-2" : ""}>{caption}</span>
            </p>
          ) : null}
        </div>
      </section>

      {options && (
        <div role="group" aria-label="Opciones de respuesta" className="mx-auto grid w-full max-w-[440px] shrink-0 gap-2 px-5 pt-1">
          {props.scriptOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={!props.onScriptOption}
              onClick={() => props.onScriptOption?.(o.id)}
              className={`vc-pill press min-h-12 rounded-full px-5 text-[17px] font-semibold leading-tight disabled:opacity-50 ${
                o.tone === "primary"
                  ? "bg-vc-primary text-vc-on-primary active:bg-vc-primary-press"
                  : "bg-vc-surface text-vc-text active:bg-vc-surface-press"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {/* 4. the controls (hidden on the projector) */}
      {!scene ? (
        <footer className="mx-auto w-full max-w-[640px] shrink-0 px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4">
          <div key={talk ? "talk" : phase} className="vc-enter">
            <Controls {...props} />
          </div>
        </footer>
      ) : (
        <div className="h-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shrink-0" />
      )}
    </div>
  );
}

function SoftPill({ children, onClick, icon, pressed }: { children: ReactNode; onClick: () => void; icon: ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="vc-pill press inline-flex min-h-11 items-center gap-2 rounded-full bg-vc-surface px-4 text-[15px] font-semibold text-vc-text active:bg-vc-surface-press"
    >
      {icon}
      {children}
    </button>
  );
}

type RoundTone = "danger" | "accept" | "soft" | "on";
const ROUND: Record<RoundTone, string> = {
  danger: "bg-vc-danger text-vc-on-danger active:bg-vc-danger-press",
  accept: "bg-vc-accept text-vc-on-accept active:bg-vc-accept-press",
  soft: "bg-vc-surface text-vc-icon active:bg-vc-surface-press",
  on: "bg-vc-toggle text-vc-on-toggle",
};

function RoundButton({
  label,
  tone,
  children,
  big,
  pressed,
  onClick,
  hold,
}: {
  label: string;
  tone: RoundTone;
  children: ReactNode;
  big?: boolean;
  pressed?: boolean;
  onClick?: () => void;
  /** push-to-talk: pressed while held (pointer or Space/Enter) */
  hold?: (down: boolean) => void;
}) {
  const held = useRef(false);
  const set = (down: boolean) => {
    if (!hold || held.current === down) return;
    held.current = down;
    hold(down);
  };
  // releasing outside the window still ends the hold
  useEffect(() => {
    if (!hold) return;
    const up = () => {
      if (!held.current) return;
      held.current = false;
      hold(false);
    };
    window.addEventListener("blur", up);
    return () => window.removeEventListener("blur", up);
  }, [hold]);

  return (
    <div className="flex w-[96px] flex-col items-center gap-2 @[900px]:w-[120px]">
      <div className="grid h-[76px] place-items-center @[900px]:h-[96px]">
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          onPointerDown={hold ? (e) => (e.currentTarget.setPointerCapture(e.pointerId), set(true)) : undefined}
          onPointerUp={hold ? () => set(false) : undefined}
          onPointerCancel={hold ? () => set(false) : undefined}
          onLostPointerCapture={hold ? () => set(false) : undefined}
          onKeyDown={hold ? (e) => (e.key === " " || e.key === "Enter") && !e.repeat && (e.preventDefault(), set(true)) : undefined}
          onKeyUp={hold ? (e) => (e.key === " " || e.key === "Enter") && set(false) : undefined}
          onContextMenu={hold ? (e) => e.preventDefault() : undefined}
          className={`vc-round press grid touch-none place-items-center rounded-full ${big ? "size-[76px] @[900px]:size-24" : "size-16 @[900px]:size-20"} ${ROUND[tone]}`}
        >
          {children}
        </button>
      </div>
      <span className="text-center text-[14px] font-medium leading-tight text-vc-text-2 @[900px]:text-[16px]" aria-hidden>
        {label}
      </span>
    </div>
  );
}

/** "Mantener para hablar" (noisy-room mode, CallViewProps.pushToTalk): round, ink while held. Calls start() on
 *  press and end() on release; the local state only gives instant feedback (set on press/release, never per frame). */
function HoldToTalk({ ptt }: { ptt: PushToTalk }) {
  const [held, setHeld] = useState(false);
  const down = held || ptt.talking;
  return (
    <RoundButton
      label="Mantener para hablar"
      tone={down ? "on" : "soft"}
      pressed={down}
      hold={(d) => {
        setHeld(d);
        if (d) ptt.start();
        else ptt.end();
      }}
    >
      {down ? <Mic className="size-7" aria-hidden /> : <Hand className="size-7" aria-hidden />}
    </RoundButton>
  );
}

function PillButton({ label, onClick, tone, icon }: { label: string; onClick: () => void; tone: "primary" | "soft" | "danger"; icon: ReactNode }) {
  const cls =
    tone === "primary"
      ? "bg-vc-primary text-vc-on-primary active:bg-vc-primary-press"
      : tone === "danger"
        ? "bg-vc-danger text-vc-on-danger active:bg-vc-danger-press"
        : "bg-vc-surface text-vc-text active:bg-vc-surface-press";
  return (
    <button type="button" onClick={onClick} className={`vc-pill press flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full px-5 text-[17px] font-semibold ${cls}`}>
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
            <RoundButton label="Contestar" onClick={a.answer} tone="accept" big>
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
          {p.phase !== "conectando" &&
            (p.pushToTalk ? (
              <HoldToTalk ptt={p.pushToTalk} />
            ) : (
              a.toggleMute && (
                <RoundButton label="Silenciar" onClick={a.toggleMute} tone={p.muted ? "on" : "soft"} pressed={p.muted}>
                  {p.muted ? <MicOff className="size-7" aria-hidden /> : <Mic className="size-7" aria-hidden />}
                </RoundButton>
              )
            ))}
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
      return <div className="h-[106px]" />;
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
  return <div className={`flex items-start justify-center ${wide ? "gap-16 @[900px]:gap-28" : "gap-2 @[400px]:gap-5 @[900px]:gap-12"}`}>{children}</div>;
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="mx-auto grid w-full max-w-[380px] gap-2.5">{children}</div>;
}
