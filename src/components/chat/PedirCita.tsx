"use client";

// /pedir-cita (v4 §3): public and mobile. Three ways in: chat with the assistant, a voice call in the
// browser, or the front-desk form as a fallback. No third-party logos, no phone number, no e-mail.
import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ChevronRight, ClipboardList, MessageCircle, Mic, SendHorizontal, Trash2, TriangleAlert } from "lucide-react";
import { Bubble, DemoNotice, QuickReplies, SoundBar, ThreadList, TypingBubble } from "./ChatParts";
import { toast } from "sonner";
import { Brand } from "@/components/Brand";
import { getJson, post } from "@/lib/post";
import { browserDb } from "@/lib/supabase/browser";
import { DISCLAIMER } from "@/lib/labels";
import { ring, unlockAudio } from "@/lib/voice/audio";
import type { Call } from "@/lib/types";
import type { Turn } from "@/lib/voice/agent";
import { CallScreen, ESTABLISHMENT, isThinking, toCaptions } from "@/components/phone/CallScreen";
import { RegisterForm } from "@/components/panel/WaitlistTab";
import type { LiveVoiceControl, VoiceSession } from "@/components/voice/LiveVoice";
import { bindDiag, newDiagId, voiceDiag } from "@/lib/voice/diag";
import { initialVoiceState, isBusy, voiceReducer } from "@/lib/voice/machine";
import type { AudioLevels, CallPhase } from "@/lib/voice/contract";
import { CallView } from "@/components/voice/CallView";
import { VoiceStartView } from "@/components/voice/VoiceStartView";

const LiveVoice = dynamic(() => import("@/components/voice/LiveVoice").then((m) => m.LiveVoice), { ssr: false });

export type Msg = { id: number; direction: "saliente" | "entrante"; kind: string; body: string; buttons: string[] | null; answered_with: string | null; created_at: string };
type ChatData = { alias: string; topic: string; consent: boolean; linkedName: string | null; messages: Msg[]; call: Call | null };
export type View = "inicio" | "chat" | "voz" | "formulario";

export function PedirCita() {
  const [view, setView] = useState<View>("inicio");
  const [data, setData] = useState<ChatData | null>(null);
  const [expired, setExpired] = useState(false);
  const [sound, setSound] = useState(false);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const d = await getJson<ChatData>("/api/chat/messages");
      setData(d);
      setExpired(false);
      // notify when a new message arrives with the tab in the background
      if (d.messages.length > lastCount.current && lastCount.current > 0 && document.visibilityState !== "visible") {
        document.title = "(1) Mensaje nuevo · AsistIA";
        ring();
        navigator.vibrate?.(200);
      }
      lastCount.current = d.messages.length;
    } catch {
      setExpired(true);
    }
  }, []);

  // session first, then the conversation; Realtime hints (content-free) + a light poll as safety net
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof browserDb>["channel"]> | null = null;
    let alive = true;
    (async () => {
      const s = await post<{ topic: string }>("/api/chat/session", {}).catch(() => null);
      if (!alive || !s) return;
      await load();
      channel = browserDb()
        .channel(s.topic)
        .on("broadcast", { event: "change" }, () => load())
        .subscribe();
    })();
    const poll = setInterval(() => document.visibilityState === "visible" && load(), 4000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        document.title = "Pedir una cita · AsistIA";
        load();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      if (channel) browserDb().removeChannel(channel);
    };
  }, [load]);

  async function enableSound() {
    const mic = await unlockAudio({ microphone: true });
    setSound(true);
    await post("/api/chat/messages", { soundReady: true }).catch(() => {});
    toast.success(mic ? "Sonido y micrófono listos para las llamadas" : "Sonido listo. El micrófono se pedirá al contestar.");
  }

  async function wipe() {
    if (!window.confirm("¿Borrar esta conversación? Se elimina del sistema y empieza una nueva.")) return;
    await fetch("/api/chat/session", { method: "DELETE" });
    window.location.reload();
  }

  const call = data?.call && (data.call.status === "sonando" || data.call.status === "en_curso") ? data.call : null;

  return (
    <PedirCitaFrame>
      <PedirCitaHeader
        view={view}
        subtitle={data ? `Usted aparece como «${data.alias}»${data.linkedName ? ` · personaje: ${data.linkedName}` : ""}` : "Conectando…"}
        onBack={() => setView("inicio")}
        onWipe={wipe}
      />
      <DemoNotice>{DISCLAIMER} Use un nombre ficticio.</DemoNotice>
      {!sound && <SoundBar onEnable={enableSound} />}

      {expired && <ExpiredNotice onRestart={() => window.location.reload()} />}

      {!expired && view === "inicio" && <Home onPick={setView} />}
      {!expired && view === "chat" && data && <ChatView data={data} reload={load} />}
      {!expired && view === "voz" && <VoiceRegister ready={!!data} onDone={() => setView("chat")} />}
      {!expired && view === "formulario" && (
        <FormWrapper>
          <RegisterForm
            compact
            endpoint="/api/public/request"
            onDone={(code) => {
              toast.success(`Solicitud ${code} registrada`);
              setView("chat");
              load();
            }}
          />
        </FormWrapper>
      )}

      {call && <CallScreen key={call.id} call={call} auth={{}} name={data?.alias ?? ""} onDone={load} />}
    </PedirCitaFrame>
  );
}

// ---------- Presentational pieces (E5 app): props only, also rendered by /dev/pantallas ----------

const stagger = (n: number) => ({ "--i": n }) as CSSProperties;
const VIEW_TITLE: Record<View, string> = {
  inicio: "Pedir una cita",
  chat: "Asistente de citas",
  voz: "Llamada con el asistente",
  formulario: "Formulario",
};

/** The page and the phone-sized column (full screen on a phone, a framed column on a desktop). */
export function PedirCitaFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh justify-center bg-vc-bg-2 sm:py-6" style={{ backgroundImage: "radial-gradient(80% 60% at 50% 0%, var(--vc-surface), transparent 70%)" }}>
      <div
        data-voice-theme="claro"
        className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-vc-bg text-vc-text sm:rounded-[28px] sm:border sm:border-vc-line sm:shadow-[0_28px_70px_-30px_rgb(16_48_47/0.45)]"
      >
        {children}
      </div>
    </div>
  );
}

export function PedirCitaHeader({ view, subtitle, onBack, onWipe }: { view: View; subtitle: string; onBack: () => void; onWipe: () => void }) {
  return (
    <header className="flex shrink-0 items-center gap-2.5 border-b border-vc-line bg-vc-bg px-3 pb-2.5 pt-[calc(0.6rem+env(safe-area-inset-top))]">
      {view !== "inicio" ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="vc-round grid size-10 shrink-0 place-items-center rounded-full bg-vc-surface text-vc-text active:bg-vc-surface-press"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
      ) : (
        <span className="shrink-0">
          <Brand />
        </span>
      )}
      <div className={`min-w-0 flex-1 leading-tight ${view === "inicio" ? "border-l border-vc-line pl-2.5" : ""}`}>
        <p className="truncate font-display text-[17px] font-bold tracking-[-0.01em] text-vc-text">{VIEW_TITLE[view]}</p>
        <p className="truncate text-[12px] text-vc-text-2">{subtitle}</p>
      </div>
      {view === "chat" && (
        <button
          type="button"
          onClick={onWipe}
          title="Borrar mi conversación"
          aria-label="Borrar mi conversación"
          className="vc-round grid size-10 shrink-0 place-items-center rounded-full text-vc-text-2 hover:bg-vc-surface active:bg-vc-surface-press"
        >
          <Trash2 className="size-[18px]" aria-hidden />
        </button>
      )}
    </header>
  );
}

export function ExpiredNotice({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="vc-enter m-auto flex max-w-xs flex-col items-center p-6 text-center">
      <span style={stagger(0)} className="grid size-14 place-items-center rounded-full bg-vc-surface text-vc-icon">
        <MessageCircle className="size-6" aria-hidden />
      </span>
      <p style={stagger(1)} className="mt-4 text-[16px] font-semibold text-vc-text">
        La conversación se cerró o venció.
      </p>
      <button
        type="button"
        style={stagger(2)}
        onClick={onRestart}
        className="vc-pill mt-5 min-h-12 rounded-2xl bg-vc-primary px-6 text-[16px] font-semibold text-vc-on-primary active:bg-vc-primary-press"
      >
        Empezar de nuevo
      </button>
    </div>
  );
}

export function FormWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="vc-enter flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-5">
      <p style={stagger(0)} className="mb-5 flex items-start gap-2.5 rounded-2xl bg-vc-bg-2 p-3.5 text-[14px] leading-snug text-vc-text-2">
        <ClipboardList className="mt-0.5 size-4 shrink-0 text-vc-icon" aria-hidden />
        El mismo formulario de ventanilla. Su respuesta y las ofertas llegarán al chat de esta página.
      </p>
      <div style={stagger(1)}>{children}</div>
    </div>
  );
}

export function Home({ onPick }: { onPick: (v: View) => void }) {
  const items = [
    { id: "chat" as const, icon: MessageCircle, title: "Chatear con el asistente", text: "Le hace unas preguntas y registra su solicitud en unos minutos." },
    { id: "voz" as const, icon: Mic, title: "Hablar con el asistente", text: "Una llamada de voz aquí mismo, en el navegador. Necesita el micrófono." },
    { id: "formulario" as const, icon: ClipboardList, title: "Formulario", text: "El mismo formulario de la ventanilla del hospital." },
  ];
  return (
    <main
      className="vc-enter flex-1 overflow-y-auto overscroll-contain px-5 pb-7 pt-7"
      style={{ backgroundImage: "linear-gradient(to bottom, var(--vc-bg-2), var(--vc-bg) 60%)" }}
    >
      <h1 style={stagger(0)} className="text-balance font-display text-[30px] font-bold leading-[1.08] tracking-[-0.02em] text-vc-text">
        ¿Necesita una cita?
      </h1>
      <p style={stagger(1)} className="mt-3 max-w-[38ch] text-pretty text-[15px] leading-snug text-vc-text-2">
        Registramos su solicitud aunque hoy no haya cupo. Un profesional la revisa y le avisamos aquí cuando haya un cupo para usted. No le
        pedimos su número ni su correo.
      </p>
      <ul className="mt-6 space-y-3">
        {items.map(({ id, icon: Icon, title, text }, n) => {
          const main = n === 0;
          return (
            <li key={id} style={stagger(n + 2)}>
              <button
                type="button"
                onClick={() => onPick(id)}
                className={`app-lift flex w-full items-center gap-3.5 rounded-[22px] p-4 text-left ${
                  main ? "bg-vc-primary text-vc-on-primary active:bg-vc-primary-press" : "bg-vc-bg text-vc-text ring-1 ring-vc-line active:bg-vc-bg-2"
                }`}
              >
                <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${main ? "bg-vc-primary-press text-vc-on-primary" : "bg-vc-surface text-vc-icon"}`}>
                  <Icon className="size-[22px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold leading-tight">{title}</span>
                  <span className={`mt-1 block text-[14px] leading-snug ${main ? "text-vc-on-primary-2" : "text-vc-text-2"}`}>{text}</span>
                </span>
                <ChevronRight className={`size-5 shrink-0 ${main ? "text-vc-on-primary-2" : "text-vc-icon"}`} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      <p style={stagger(5)} className="mt-6 flex items-start gap-2.5 rounded-2xl bg-vc-danger-soft p-3.5 text-[13px] leading-snug text-vc-text">
        <TriangleAlert className="mt-px size-4 shrink-0 text-vc-danger-press" aria-hidden />
        <span>Si tiene dolor fuerte en el pecho, falta de aire, un desmayo o sangrado abundante, no espere una cita: acuda a emergencia o llame al 106 (SAMU).</span>
      </p>
    </main>
  );
}

function ChatView({ data, reload }: { data: ChatData; reload: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const count = data.messages.length;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [count, typing]);

  async function send(t: string) {
    const v = t.trim();
    if (!v || typing) return;
    setText("");
    setTyping(true);
    try {
      const r = await post<{ deleted?: boolean; replies?: { body: string }[] }>("/api/chat/messages", { text: v });
      if (r.deleted) {
        toast(r.replies?.[0]?.body ?? "Listo, borramos esta conversación.");
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTyping(false);
    }
  }

  const last = [...data.messages].reverse().find((m) => m.direction === "saliente");
  const quick = last && last.buttons && !last.answered_with && last.id === data.messages[data.messages.length - 1]?.id ? last.buttons : null;

  return (
    <ChatThreadView
      messages={data.messages}
      consent={data.consent}
      typing={typing}
      quick={quick}
      text={text}
      listRef={listRef}
      onText={(v) => setText(v.slice(0, 500))}
      onSend={send}
      onSubmit={() => send(text)}
    />
  );
}

type ChatThreadViewProps = {
  messages: Msg[];
  consent: boolean;
  typing: boolean;
  quick: string[] | null;
  text: string;
  listRef?: React.Ref<HTMLOListElement>;
  onText: (value: string) => void;
  onSend: (text: string) => void;
  onSubmit: () => void;
};

const BUBBLE_LABEL: Record<string, string> = { oferta: "Oferta de cupo", validacion: "Confirmación de cupo" };

/** The chat thread, the quick answers and the composer. Props only (ChatView owns the state). */
export function ChatThreadView({ messages, consent, typing, quick, text, listRef, onText, onSend, onSubmit }: ChatThreadViewProps) {
  return (
    <>
      <ThreadList listRef={listRef}>
        {!messages.length && !typing && (
          <li className="mx-auto mt-8 max-w-[260px] rounded-2xl bg-vc-bg p-4 text-center text-[14px] leading-snug text-vc-text-2 ring-1 ring-vc-line">
            Escriba un mensaje para empezar. El asistente le hará unas preguntas, una a la vez.
          </li>
        )}
        {messages.map((m) => (
          <Bubble
            key={m.id}
            mine={m.direction === "entrante"}
            highlight={m.direction === "saliente" ? (BUBBLE_LABEL[m.kind] ?? null) : null}
            answered={m.answered_with}
            time={new Date(m.created_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
          >
            {m.body}
          </Bubble>
        ))}
        {typing && <TypingBubble />}
      </ThreadList>
      {quick && <QuickReplies options={quick} disabled={typing} onPick={onSend} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-vc-line bg-vc-bg px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2"
      >
        {/* the PERSONA hint lives above the field: as a placeholder it was cut on a 360 px phone */}
        {consent && (
          <p id="msg-hint" className="w-full px-1 text-[12px] text-vc-text-3">
            Para hablar con una persona, escriba PERSONA.
          </p>
        )}
        <label className="sr-only" htmlFor="msg">
          Mensaje
        </label>
        <input
          id="msg"
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder={consent ? "Escriba aquí…" : "Escriba ACEPTO para continuar"}
          aria-describedby={consent ? "msg-hint" : undefined}
          autoComplete="off"
          enterKeyHint="send"
          className="min-h-12 min-w-0 flex-1 rounded-full border border-vc-edge bg-vc-bg px-4 text-[16px] text-vc-text transition-[border-color] duration-150 placeholder:text-vc-text-3 focus:border-vc-focus"
        />
        <button
          type="submit"
          disabled={!text.trim() || typing}
          aria-label="Enviar"
          className="vc-round grid size-12 shrink-0 place-items-center rounded-full bg-vc-primary text-vc-on-primary active:bg-vc-primary-press disabled:bg-vc-surface disabled:text-vc-text-3"
        >
          <SendHorizontal className="size-5" aria-hidden />
        </button>
      </form>
    </>
  );
}

/** Registration by voice in the browser with the asistia-registro agent (fallback: chat or form).
 *  E5: waits until the anonymous chat session exists (`ready`), follows the voice state machine (one session,
 *  idempotent start, busy and queue states) and retries once if the session was not ready yet. */
function VoiceRegister({ onDone, ready }: { onDone: () => void; ready: boolean }) {
  const [vs, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [live, setLive] = useState<{ session: VoiceSession; voiceSessionId: string } | null>(null);
  const [callId, setCallId] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [reason, setReason] = useState("");
  const control = useRef<LiveVoiceControl | null>(null);
  const [sid, setSid] = useState("");
  const clicks = useRef(0);
  const requesting = useRef(false);
  const queueId = useRef<string | null>(null);
  const callRef = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  type R = {
    session: VoiceSession | null;
    callId: number;
    voiceSessionId?: string;
    busy?: "otro_dispositivo" | "capacidad";
    queueId?: string | null;
    position?: number | null;
    reason?: string;
  };

  async function request(id: string): Promise<R> {
    const body = { mode: "registro", diag: id, callId: callRef.current ?? undefined, queueId: queueId.current };
    try {
      return await post<R>("/api/voice/session", body);
    } catch (e) {
      // the chat session may still be on its way: create it (idempotent) and retry once
      voiceDiag(id, "session.reintento", { message: (e as Error).message.slice(0, 120) });
      await post("/api/chat/session", {}).catch(() => {});
      return post<R>("/api/voice/session", body);
    }
  }

  async function start() {
    clicks.current += 1;
    if (requesting.current || isBusy(vs) || !ready) return; // idempotent
    requesting.current = true;
    const id = sid || newDiagId();
    if (!sid) setSid(id);
    voiceDiag(id, "ui.start", { clicks: clicks.current, mode: "registro" });
    dispatch({ type: "START" });
    const mic = await unlockAudio({ microphone: true });
    voiceDiag(id, "mic.unlock", { ok: mic });
    if (!mic) {
      dispatch({ type: "SESSION_FAILED", message: "micrófono" });
      setReason("No se pudo usar el micrófono. Revise el permiso del navegador o use el chat.");
      requesting.current = false;
      return;
    }
    try {
      const r = await request(id);
      voiceDiag(id, "session.response", { callId: r.callId ?? null, ok: !!r.session, busy: r.busy ?? null, reason: r.reason ?? null });
      if (r.callId) {
        callRef.current = r.callId;
        setCallId(r.callId);
      }
      if (r.session && r.voiceSessionId) {
        bindDiag(id, r.voiceSessionId, r.callId);
        queueId.current = null;
        dispatch({ type: "SESSION_GRANTED", sessionId: r.voiceSessionId });
        setLive({ session: r.session, voiceSessionId: r.voiceSessionId });
        return;
      }
      if (r.busy) {
        dispatch({ type: "SESSION_BUSY", kind: r.busy, position: r.position ?? null, queueId: r.queueId ?? null });
        if (r.busy === "capacidad") {
          queueId.current = r.queueId ?? null;
          retryTimer.current = setTimeout(() => {
            requesting.current = false;
            void start();
          }, 10_000);
        }
        return;
      }
      throw new Error(r.reason ?? "La llamada no está disponible ahora.");
    } catch (e) {
      voiceDiag(id, "session.error", { message: (e as Error).message.slice(0, 140) });
      dispatch({ type: "SESSION_FAILED", message: (e as Error).message });
      setReason((e as Error).message);
    } finally {
      requesting.current = false;
    }
  }

  async function end(result: string, closeCall = true) {
    voiceDiag(sid, "finish", { callId, result });
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setLive(null);
    if (closeCall && callRef.current) await post("/api/voice/status", { callId: callRef.current, status: "finalizada", result }).catch(() => {});
  }

  function hangUp() {
    if (live && control.current) {
      control.current.hangUp();
      return;
    }
    dispatch({ type: "HANGUP" });
    void end("Colgó mientras esperaba");
  }

  const [muted, setMuted] = useState(false);
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [closed, setClosed] = useState(false);
  const [levels] = useState<AudioLevels>(() => ({
    input: () => control.current?.frequencies().input ?? null,
    output: () => control.current?.frequencies().output ?? null,
  }));
  useEffect(() => {
    if (vs.name !== "activa") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [vs.name]);

  const busy = vs.name === "ocupado" ? { kind: vs.kind, position: vs.position } : null;
  const viewPhase: CallPhase | null =
    vs.name === "idle" || closed
      ? null
      : vs.name === "error"
        ? "sin_conexion"
        : busy
          ? "ocupado"
          : vs.name === "activa"
            ? "activa"
            : vs.name === "finalizando"
              ? "finalizando"
              : vs.name === "finalizada"
                ? "finalizada"
                : "conectando";

  function continueByChat() {
    if (callRef.current && vs.name === "error") {
      post("/api/voice/status", {
        callId: callRef.current,
        status: "fallo",
        result: "Siguió por chat",
        fallback_reason: `La persona eligió seguir por chat: ${(reason || "la voz no conectó").slice(0, 100)}`,
      }).catch(() => {});
    }
    if (live) control.current?.hangUp();
    onDone();
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col">
      {viewPhase === null && <VoiceStartView ready={ready} onStart={start} establishment={ESTABLISHMENT} />}
      {viewPhase && (
        <CallView
          phase={viewPhase}
          purposeLabel="Registro de solicitud"
          establishment={ESTABLISHMENT}
          agentSpeaking={speaking}
          thinking={viewPhase === "activa" && isThinking(turns, speaking)}
          muted={muted}
          seconds={seconds}
          captions={toCaptions(turns)}
          captionsVisible={captionsVisible}
          busy={busy}
          errorMessage={vs.name === "error" ? reason || vs.message : null}
          levels={live ? levels : null}
          scriptOptions={[]}
          actions={{
            hangUp,
            toggleMute: live
              ? () => {
                  const next = !muted;
                  setMuted(next);
                  control.current?.setMuted(next);
                }
              : undefined,
            toggleCaptions: () => setCaptionsVisible((v) => !v),
            retry: vs.name === "error" ? () => void start() : undefined,
            continueByChat,
            talkToPerson: live ? () => control.current?.say("Quiero hablar con una persona, por favor.") : undefined,
            leave: vs.name === "finalizada" ? () => setClosed(true) : busy?.kind === "otro_dispositivo" ? onDone : undefined,
          }}
        />
      )}
      {live && (
        <LiveVoice
          sid={sid}
          callId={callId ?? 0}
          voiceSessionId={live.voiceSessionId}
          session={live.session}
          dispatch={dispatch}
          controlRef={control}
          onTurn={(t) => setTurns((x) => [...x, t])}
          onSpeaking={setSpeaking}
          onConnected={(ms) => {
            if (callRef.current) post("/api/voice/status", { callId: callRef.current, status: "en_curso", first_turn_ms: ms, provider: "elevenlabs" }).catch(() => {});
          }}
          onEnd={(kind, r) => {
            if (kind === "error") {
              voiceDiag(sid, "fail", { callId, message: r.slice(0, 140) });
              setReason(`La conexión de voz se cortó (${r}).`);
              setLive(null);
              return;
            }
            void end(r, kind !== "remoto");
          }}
        />
      )}
    </main>
  );
}
