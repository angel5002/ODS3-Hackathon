"use client";

// Presentational call screen (E5, hito 3). It receives ONLY CallViewProps (src/lib/voice/contract.ts): no
// SDK, no server calls, no database. The controller maps the voice state machine to `phase` and wires the
// actions; a button is drawn only when its callback exists. Rendered as `absolute inset-0` inside a relative
// container: the simulated phone frame, the chat, or a full-height page on desktop.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Bot,
  Captions,
  CaptionsOff,
  Hourglass,
  MessageSquareText,
  Mic,
  MicOff,
  MonitorSmartphone,
  Phone,
  PhoneOff,
  RotateCcw,
  ShieldCheck,
  UserRound,
  WifiOff,
} from "lucide-react";
import { AGENT_IDENTIFICATION, SAFETY_LINES, type AudioLevels, type CallPhase, type CallViewProps, type Caption } from "@/lib/voice/contract";
import { VoiceWave, WAVE_COLOR } from "./VoiceWave";

const RED = "bg-[#d92d20] text-white";
const GREEN = "bg-[#17b26a] text-white";
const SOFT = "bg-white/12 text-white active:bg-white/20";

/** phases in which the conversation (wave, captions) is on screen */
const TALK: CallPhase[] = ["conectando", "activa", "guion", "finalizando", "finalizada"];
/** phases in which "Hablar con una persona" makes sense */
const PERSON_OK: CallPhase[] = ["reconectar", "conectando", "activa", "guion", "ocupado", "sin_conexion"];

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function statusCopy(p: CallViewProps): { title: string; detail: string | null } {
  switch (p.phase) {
    case "entrante":
      return { title: "Llamada entrante", detail: p.purposeLabel };
    case "reconectar":
      return { title: "La llamada sigue abierta", detail: "Se interrumpió la conexión de voz. Puede volver a conectar o colgar." };
    case "conectando":
      return { title: "Conectando…", detail: "Un momento, por favor." };
    case "activa":
      if (p.thinking) return { title: "Pensando…", detail: null };
      if (p.agentSpeaking) return { title: "El asistente está hablando", detail: null };
      if (p.muted) return { title: "Micrófono silenciado", detail: "El asistente no le escucha. Toque Activar micrófono para hablar." };
      return { title: "Te escucho", detail: "Hable con normalidad." };
    case "guion":
      return p.agentSpeaking
        ? { title: "El asistente está hablando", detail: null }
        : { title: "Responda tocando una opción", detail: null };
    case "finalizando":
      return { title: "Terminando la llamada…", detail: null };
    case "finalizada":
      return { title: "Llamada finalizada", detail: p.seconds > 0 ? `Duración: ${formatDuration(p.seconds)}` : null };
    case "ocupado":
      if (p.busy?.kind === "otro_dispositivo")
        return {
          title: "Esta llamada ya se está atendiendo en otro dispositivo",
          detail: "Para evitar dos conversaciones a la vez, aquí no se abre otra. Puede cerrar esta pantalla.",
        };
      return { title: "Todas las líneas están ocupadas", detail: "Seguimos intentando conectarle. También puede seguir por chat." };
    case "sin_conexion":
      return { title: "No pudimos conectar la voz", detail: p.errorMessage || "Revise su conexión a internet e intente de nuevo." };
  }
}

export function CallView(props: CallViewProps) {
  const { phase, purposeLabel, establishment, agentSpeaking, thinking, muted, seconds, captions, captionsVisible, busy, levels, actions } = props;
  const talk = TALK.includes(phase);
  const live = phase === "activa" || phase === "guion";
  const { title, detail } = statusCopy(props);

  // muted: the wave must not show the microphone, whatever the controller still feeds
  const waveLevels = useMemo<AudioLevels | null>(() => {
    if (!levels) return null;
    if (!muted) return levels;
    return { input: () => null, output: levels.output };
  }, [levels, muted]);

  const speaker: "agente" | "persona" | null =
    phase === "activa" ? (agentSpeaking || thinking ? "agente" : "persona") : phase === "guion" ? (agentSpeaking ? "agente" : null) : null;
  const waveActive =
    phase === "conectando" || (phase === "activa" && !(muted && !agentSpeaking && !thinking)) || (phase === "guion" && agentSpeaking);
  const glow = live && waveActive && speaker ? speaker : null;

  const showPerson = !!actions.talkToPerson && PERSON_OK.includes(phase) && !(phase === "ocupado" && busy?.kind === "otro_dispositivo");

  return (
    <div
      role="dialog"
      aria-label="Llamada del asistente automatizado"
      className="@container absolute inset-0 z-20 flex flex-col overflow-hidden bg-[#10302f] text-white [&_:focus-visible]:outline-[#7ee0c9]"
    >
      {/* speaker glow: two fixed layers, only their opacity changes */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-x-0 top-[18%] h-[55%] bg-[radial-gradient(ellipse_at_center,rgba(126,224,201,0.20),transparent_65%)] transition-opacity duration-700 ease-out motion-reduce:transition-none"
          style={{ opacity: glow === "agente" ? 1 : talk ? 0.35 : 0 }}
        />
        <div
          className="absolute inset-x-0 top-[18%] h-[55%] bg-[radial-gradient(ellipse_at_center,rgba(246,193,119,0.17),transparent_65%)] transition-opacity duration-700 ease-out motion-reduce:transition-none"
          style={{ opacity: glow === "persona" ? 1 : 0 }}
        />
      </div>

      <Header
        establishment={establishment}
        purposeLabel={purposeLabel}
        showPurpose={phase !== "entrante"}
        duration={live || phase === "finalizando" ? formatDuration(seconds) : null}
        muted={muted && live}
      />

      <main className="relative mx-auto flex min-h-0 w-full max-w-[600px] flex-1 flex-col px-5">
        <div role="status" aria-live="polite" aria-atomic="true" className={`text-center ${phase === "guion" ? "pt-3" : talk ? "pt-4" : "pt-6"}`}>
          {phase === "activa" && (
            <span
              aria-hidden
              className="mb-2 inline-block size-2 rounded-full transition-colors duration-300"
              style={{ background: muted && !agentSpeaking && !thinking ? "#ffffff55" : WAVE_COLOR[speaker ?? "agente"] }}
            />
          )}
          <p className="text-balance font-display text-[26px] font-bold leading-tight tracking-[-0.01em] @lg:text-3xl">{title}</p>
          {detail && <p className="mx-auto mt-1.5 max-w-[34ch] text-pretty text-[15px] leading-snug text-white/75">{detail}</p>}
        </div>

        {talk && (
          <div className={`relative -mx-5 shrink-0 @3xl:-mx-24 ${phase === "guion" ? "mt-1 h-14" : "mt-4 h-28 @lg:h-32 @3xl:h-40"}`}>
            <VoiceWave levels={waveLevels} active={waveActive} speaker={speaker} />
          </div>
        )}

        {talk ? (
          phase === "conectando" ? (
            <div className="flex-1" />
          ) : (
            <CaptionsPanel captions={captions} visible={captionsVisible} onToggle={actions.toggleCaptions} live={live} />
          )
        ) : (
          // incoming, reconnect, busy and no connection: the emblem sits in the optical centre of the free space
          <div className="flex flex-1 flex-col items-center justify-center pb-6">
            {(phase === "entrante" || phase === "reconectar") && <Avatar ringing={phase === "entrante"} />}
            {phase === "ocupado" && <BusyStage kind={busy?.kind ?? "capacidad"} position={busy?.position ?? null} />}
            {phase === "sin_conexion" && <Emblem icon={<WifiOff className="size-9" aria-hidden />} />}
          </div>
        )}

        {phase === "guion" && props.scriptOptions.length > 0 && (
          <div role="group" aria-label="Opciones de respuesta" className="grid shrink-0 gap-2 pt-2">
            {props.scriptOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={!props.onScriptOption}
                onClick={() => props.onScriptOption?.(o.id)}
                className={`press min-h-[52px] rounded-2xl px-4 py-2 text-[17px] font-semibold leading-tight disabled:opacity-50 ${
                  o.tone === "primary" ? "bg-[#7ee0c9] text-[#0b2b2a] active:bg-[#9be9d6]" : SOFT
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </main>

      <footer className="relative mx-auto w-full max-w-[600px] shrink-0 px-5 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] pt-3">
        {showPerson && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={actions.talkToPerson}
              className="press inline-flex min-h-12 items-center gap-2 rounded-full border border-white/25 px-5 text-[15px] font-semibold text-white active:bg-white/10"
            >
              <UserRound className="size-5" aria-hidden />
              Hablar con una persona
            </button>
          </div>
        )}
        <Controls {...props} />
        {phase !== "finalizada" && (
          <div className="mx-auto mt-4 flex w-fit max-w-full items-start gap-2 text-[13px] leading-snug text-white/75">
            <ShieldCheck className="mt-px size-4 shrink-0 text-[#7ee0c9]" aria-hidden />
            <ul className="space-y-0.5">
              {SAFETY_LINES.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </footer>
    </div>
  );
}

function Header({
  establishment,
  purposeLabel,
  showPurpose,
  duration,
  muted,
}: {
  establishment: string;
  purposeLabel: string;
  showPurpose: boolean;
  duration: string | null;
  muted: boolean;
}) {
  return (
    <header className="relative mx-auto w-full max-w-[600px] shrink-0 px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/90">Demostración</span>
        <div className="flex items-center gap-2">
          {muted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#d92d20]/25 px-2.5 py-1 text-xs font-semibold text-[#ffcdc7]">
              <MicOff className="size-3.5" aria-hidden />
              Silenciado
            </span>
          )}
          {duration && (
            <span className="text-sm font-semibold tabular-nums text-white/85" aria-label={`Duración ${duration}`}>
              {duration}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-[#7ee0c9]">
          <Bot className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight">{AGENT_IDENTIFICATION(establishment)}</p>
          {showPurpose && <p className="truncate text-sm text-white/70">{purposeLabel}</p>}
        </div>
      </div>
    </header>
  );
}

function Avatar({ ringing }: { ringing: boolean }) {
  return (
    <div className="flex justify-center">
      <div className={`relative grid size-28 place-items-center rounded-full bg-white/10 text-[#7ee0c9] ${ringing ? "ring-pulse" : ""}`}>
        <Bot className="size-12" aria-hidden />
      </div>
    </div>
  );
}

function Emblem({ icon, tone = "#7ee0c9" }: { icon: ReactNode; tone?: string }) {
  return (
    <div className="flex justify-center">
      <div className="grid size-20 place-items-center rounded-3xl bg-white/10" style={{ color: tone }}>
        {icon}
      </div>
    </div>
  );
}

function BusyStage({ kind, position }: { kind: "otro_dispositivo" | "capacidad"; position: number | null }) {
  if (kind === "otro_dispositivo") return <Emblem icon={<MonitorSmartphone className="size-9" aria-hidden />} />;
  return (
    <div className="flex flex-col items-center">
      <Emblem icon={<Hourglass className="size-9" aria-hidden />} tone="#f6c177" />
      {position != null && position > 0 && (
        <p className="mt-5 flex flex-col items-center">
          <span className="text-sm text-white/75">Su lugar en la fila</span>
          <span className="font-display text-5xl font-bold tabular-nums leading-none">{position}</span>
        </p>
      )}
    </div>
  );
}

function CaptionsPanel({
  captions,
  visible,
  onToggle,
  live,
}: {
  captions: Caption[];
  visible: boolean;
  onToggle: () => void;
  live: boolean;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const last = captions.length ? captions[captions.length - 1] : null;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [captions.length, last?.text, visible]);

  return (
    <section aria-label="Subtítulos" className={`flex flex-1 flex-col ${visible ? "min-h-[104px]" : "min-h-0"}`}>
      <div className="flex shrink-0 justify-end">
        <button
          type="button"
          onClick={onToggle}
          className="press inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white/85 active:bg-white/10"
        >
          {visible ? <CaptionsOff className="size-4" aria-hidden /> : <Captions className="size-4" aria-hidden />}
          {visible ? "Ocultar subtítulos" : "Mostrar subtítulos"}
        </button>
      </div>
      {visible && (
        <ol
          ref={listRef}
          role="log"
          aria-live="polite"
          className="min-h-0 flex-1 basis-0 space-y-3 overflow-y-auto overscroll-contain pb-1 pt-5 [mask-image:linear-gradient(to_bottom,transparent,black_24px)]"
        >
          {captions.length === 0 && live && (
            <li className="text-center text-[15px] text-white/65">Aquí aparecerá lo que digan usted y el asistente.</li>
          )}
          {captions.map((c) => (
            <li key={c.id} className={`bubble-in transition-opacity duration-300 ${c.id === last?.id ? "opacity-100" : "opacity-70"}`}>
              <p className="text-xs font-semibold" style={{ color: WAVE_COLOR[c.who] }}>
                {c.who === "agente" ? "Asistente" : "Usted"}
              </p>
              <p className="text-[17px] leading-snug text-white">{c.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RoundButton({
  label,
  onClick,
  className,
  children,
  big,
}: {
  label: string;
  onClick: () => void;
  className: string;
  children: ReactNode;
  big?: boolean;
}) {
  return (
    <div className="flex w-[100px] flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`press grid place-items-center rounded-full ${big ? "size-[72px]" : "size-16"} ${className}`}
      >
        {children}
      </button>
      <span className="text-center text-[13px] font-medium leading-tight text-white/85" aria-hidden>
        {label}
      </span>
    </div>
  );
}

function PillButton({ label, onClick, tone, icon }: { label: string; onClick: () => void; tone: "primary" | "soft" | "danger"; icon: ReactNode }) {
  const cls =
    tone === "primary"
      ? "bg-[#7ee0c9] text-[#0b2b2a] active:bg-[#9be9d6]"
      : tone === "danger"
        ? "bg-[#d92d20] text-white active:bg-[#b42318]"
        : SOFT;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-[17px] font-semibold ${cls}`}
    >
      {icon}
      {label}
    </button>
  );
}

function Controls(p: CallViewProps) {
  const a = p.actions;
  const chat = a.continueByChat && <MessageSquareText className="size-6" aria-hidden />;

  switch (p.phase) {
    case "entrante":
      return (
        <Row>
          {a.reject && (
            <RoundButton label="Rechazar" onClick={a.reject} className={RED} big>
              <PhoneOff className="size-8" aria-hidden />
            </RoundButton>
          )}
          {a.answer && (
            <RoundButton label="Contestar" onClick={a.answer} className={GREEN} big>
              <Phone className="size-8" aria-hidden />
            </RoundButton>
          )}
        </Row>
      );
    case "reconectar": {
      const reconnect = a.answer ?? a.retry;
      return (
        <Row>
          <RoundButton label="Colgar" onClick={a.hangUp} className={RED} big>
            <PhoneOff className="size-8" aria-hidden />
          </RoundButton>
          {reconnect && (
            <RoundButton label="Volver a conectar" onClick={reconnect} className={GREEN} big>
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
            <RoundButton
              label={p.muted ? "Activar micrófono" : "Silenciar"}
              onClick={a.toggleMute}
              className={p.muted ? "bg-white text-[#10302f]" : SOFT}
            >
              {p.muted ? <MicOff className="size-7" aria-hidden /> : <Mic className="size-7" aria-hidden />}
            </RoundButton>
          )}
          <RoundButton label="Colgar" onClick={a.hangUp} className={RED} big>
            <PhoneOff className="size-8" aria-hidden />
          </RoundButton>
          {a.continueByChat && (
            <RoundButton label="Seguir por chat" onClick={a.continueByChat} className={SOFT}>
              {chat}
            </RoundButton>
          )}
        </Row>
      );
    case "finalizando":
      return <div className="h-4" />;
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
      if (p.busy?.kind === "otro_dispositivo")
        return <Stack>{a.leave && <PillButton label="Cerrar" onClick={a.leave} tone="soft" icon={null} />}</Stack>;
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

function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-start justify-center gap-2 @lg:gap-8">{children}</div>;
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="mx-auto grid w-full max-w-[400px] gap-2.5">{children}</div>;
}
