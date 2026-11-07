"use client";

// /pedir-cita (v4 §3): public and mobile. Three ways in: chat with the assistant, a voice call in the
// browser, or the front-desk form as a fallback. No third-party logos, no phone number, no e-mail.
import { EvidenceLink } from "@/components/Evidence";
import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ClipboardList, MessageCircle, Mic, SendHorizontal, Trash2, TriangleAlert, UserRound } from "lucide-react";
import { Bubble, DemoNotice, QuickReplies, SoundButton, ThreadList, TypingBubble } from "./ChatParts";
import { toast } from "sonner";
import { Brand } from "@/components/Brand";
import { getJson, post } from "@/lib/post";
import { mayReload, shouldRecover } from "@/lib/chat/recovery";
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
import { PUSH_TO_TALK_BUTTON_READY, type AudioLevels, type CallPhase } from "@/lib/voice/contract";
import { CallView } from "@/components/voice/CallView";
import { VoiceStartView } from "@/components/voice/VoiceStartView";

const LiveVoice = dynamic(() => import("@/components/voice/LiveVoice").then((m) => m.LiveVoice), { ssr: false });

export type Msg = { id: number; direction: "saliente" | "entrante"; kind: string; body: string; buttons: string[] | null; answered_with: string | null; created_at: string };
type ChatData = { alias: string; topic: string; consent: boolean; linkedName: string | null; messages: Msg[]; call: Call | null };
export type View = "inicio" | "chat" | "voz" | "formulario";

/** E5 final: `jury` ties the chat session to a jury card (/j/<token>); `channels` limits the ways in
 *  (/pedir-cita?canal=chat for the audience QR: no voice); `start` opens a view directly. All optional:
 *  without them the page behaves exactly as before. */
export type PedirCitaProps = { jury?: string; channels?: View[]; start?: View };

export function PedirCita({ jury, channels, start }: PedirCitaProps = {}) {
  const [view, setView] = useState<View>(start ?? "inicio");
  const [data, setData] = useState<ChatData | null>(null);
  const [expired, setExpired] = useState(false);
  const [sound, setSound] = useState(false);
  const lastCount = useRef(0);

  // E5: one session request at a time; a failed load recreates the session (at most twice per page) before
  // showing "expired"; once expired the page stops polling. Incident 7/11 08:42 UTC: reload/expired loop.
  const ensuring = useRef<Promise<{ topic: string } | null> | null>(null);
  const recoveries = useRef(0);
  const expiredRef = useRef(false);
  const ensureSession = useCallback(() => {
    ensuring.current ??= post<{ topic: string }>("/api/chat/session", jury ? { jury } : {})
      .catch((e) => {
        console.info("[chat] no se pudo crear la sesión", (e as Error).message);
        return null;
      })
      .finally(() => {
        setTimeout(() => (ensuring.current = null), 0);
      });
    return ensuring.current;
  }, [jury]);

  const load = useCallback(async () => {
    if (expiredRef.current) return;
    try {
      let d: ChatData;
      try {
        d = await getJson<ChatData>("/api/chat/messages");
      } catch (first) {
        if (!shouldRecover(recoveries.current)) throw first;
        recoveries.current += 1;
        console.info("[chat] la sesión no responde; se crea otra", recoveries.current, (first as Error).message);
        const s = await ensureSession();
        if (!s) throw first;
        d = await getJson<ChatData>("/api/chat/messages");
      }
      setData(d);
      setExpired(false);
      // notify when a new message arrives with the tab in the background
      if (d.messages.length > lastCount.current && lastCount.current > 0 && document.visibilityState !== "visible") {
        document.title = "(1) Mensaje nuevo · AsistIA";
        ring();
        navigator.vibrate?.(200);
      }
      lastCount.current = d.messages.length;
    } catch (e) {
      console.info("[chat] conversación no disponible", (e as Error).message);
      expiredRef.current = true;
      setExpired(true);
    }
  }, [ensureSession]);

  // session first, then the conversation; Realtime hints (content-free) + a light poll as safety net
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof browserDb>["channel"]> | null = null;
    let alive = true;
    (async () => {
      const s = await ensureSession();
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
  }, [load, ensureSession]);

  async function enableSound() {
    const mic = await unlockAudio({ microphone: true });
    setSound(true);
    await post("/api/chat/messages", { soundReady: true }).catch(() => {});
    toast.success(mic ? "Sonido y micrófono listos para las llamadas" : "Sonido listo. El micrófono se pedirá al contestar.", { position: "bottom-center" }); // never over the header
  }

  async function wipe() {
    if (!window.confirm("¿Borrar esta conversación? Se elimina del sistema y empieza una nueva.")) return;
    await fetch("/api/chat/session", { method: "DELETE" });
    safeReload();
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
      {expired && <ExpiredNotice onRestart={safeReload} />}

      {!expired && view === "inicio" && <Home onPick={setView} channels={channels} sound={sound ? null : <SoundButton onEnable={enableSound} />} />}
      {!expired && view === "chat" && data && <ChatView data={data} reload={load} sound={sound ? null : <SoundButton onEnable={enableSound} />} />}
      {!expired && view === "voz" && <VoiceRegister ready={!!data} jury={jury} onDone={() => setView("chat")} />}
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

      {/* the one demo notice of the page, at its foot; not under a voice call (the call screen carries none) */}
      {view !== "voz" && <DemoNotice>{DISCLAIMER}</DemoNotice>}

      {call && <CallScreen key={call.id} call={call} auth={{}} name={data?.alias ?? ""} onDone={load} />}
    </PedirCitaFrame>
  );
}

// ---------- Presentational pieces (E5 app, E5 stoic): props only, also rendered by /dev/pantallas ----------
// "Stoic, versión salud" (docs/estilo.md): near-white page, white cards with a subtle border, one main action
// (near-black), short titles in DM Serif Display, one supporting line, nothing else unless tapped.

const stagger = (n: number) => ({ "--i": n }) as CSSProperties;
const VIEW_TITLE: Record<View, string> = {
  inicio: "Pedir una cita",
  chat: "Asistente de citas",
  voz: "Llamada",
  formulario: "Formulario",
};

/** The page and the phone-sized column (full screen on a phone, a framed column on a desktop). */
export function PedirCitaFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh justify-center bg-vc-bg-2 sm:py-6">
      <div
        data-voice-theme="claro"
        className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-vc-bg text-vc-text sm:rounded-3xl sm:border sm:border-vc-line"
      >
        {children}
      </div>
    </div>
  );
}

/** One quiet bar: the brand (home) or Volver + the view's name. The alias ("Usted aparece como «…»") is NOT shown
 *  (user test on Android): it stays only for screen readers and the end-to-end checks that wait for it. */
export function PedirCitaHeader({ view, subtitle, onBack, onWipe }: { view: View; subtitle: string; onBack: () => void; onWipe: () => void }) {
  return (
    <header className="flex shrink-0 items-center gap-2 bg-vc-bg px-3 pb-1.5 pt-[calc(0.5rem+env(safe-area-inset-top))]">
      {view !== "inicio" ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="vc-round press grid size-11 shrink-0 place-items-center rounded-full bg-vc-surface text-vc-text active:bg-vc-surface-press"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
      ) : (
        <span className="shrink-0 pl-1">
          <Brand />
        </span>
      )}
      <div className={`min-w-0 flex-1 leading-tight ${view === "inicio" ? "text-right" : ""}`}>
        {view !== "inicio" && <p className="text-[17px] font-semibold text-vc-text">{VIEW_TITLE[view]}</p>}
        <p className="sr-only">{subtitle}</p>
      </div>
      {view === "chat" && (
        <button
          type="button"
          onClick={onWipe}
          title="Borrar mi conversación"
          aria-label="Borrar mi conversación"
          className="vc-round press grid size-11 shrink-0 place-items-center rounded-full text-vc-text-2 hover:bg-vc-surface active:bg-vc-surface-press"
        >
          <Trash2 className="size-5" aria-hidden />
        </button>
      )}
    </header>
  );
}

/** Reload, but never in a loop: at most 2 reloads per minute; otherwise say what to do. */
function safeReload() {
  let store: Storage | null = null;
  try {
    store = window.sessionStorage;
  } catch {
    store = null;
  }
  if (mayReload(store, Date.now())) {
    window.location.reload();
    return;
  }
  console.info("[chat] recarga bloqueada para evitar un bucle");
  toast.error("No pudimos abrir la conversación. Revise que el navegador permita cookies de este sitio y vuelva a intentar en un minuto.", {
    position: "bottom-center",
    duration: 8000,
  });
}

export function ExpiredNotice({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="vc-enter m-auto flex max-w-xs flex-col items-center p-6 text-center">
      <MessageCircle style={stagger(0)} className="size-8 text-vc-icon" aria-hidden strokeWidth={1.5} />
      <p style={stagger(1)} className="mt-3 font-display text-[26px] leading-tight text-vc-text">
        La conversación venció
      </p>
      <button
        type="button"
        style={stagger(2)}
        onClick={onRestart}
        className="vc-pill press mt-6 min-h-12 rounded-full bg-vc-primary px-7 text-[17px] font-semibold text-vc-on-primary active:bg-vc-primary-press"
      >
        Empezar de nuevo
      </button>
    </div>
  );
}

export function FormWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="vc-enter flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">
      <h1 style={stagger(0)} className="font-display text-[30px] leading-tight text-vc-text">
        Sus datos
      </h1>
      <p style={stagger(0)} className="mb-5 mt-1 text-[16px] leading-snug text-vc-text-2">
        La respuesta le llegará al chat.
      </p>
      <div style={stagger(1)}>{children}</div>
    </div>
  );
}

export function Home({ onPick, sound, channels }: { onPick: (v: View) => void; sound?: ReactNode; channels?: View[] }) {
  // one main action (chat, near-black), two quiet alternatives as small cards, one safety line
  const others = [
    { id: "voz" as const, icon: Mic, title: "Hablar con el asistente" },
    { id: "formulario" as const, icon: ClipboardList, title: "Formulario" },
  ].filter((o) => !channels || channels.includes(o.id)); // E5 final: /pedir-cita?canal=chat hides voice
  return (
    <main className="vc-enter flex flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-5 pt-8">
      <h1 style={stagger(0)} className="text-balance font-display text-[38px] leading-[1.05] text-vc-text">
        ¿Necesita una cita?
      </h1>
      <p style={stagger(1)} className="mt-3 max-w-[30ch] text-pretty text-[17px] leading-snug text-vc-text-2">
        Pídala aquí. Le avisamos cuando haya un cupo para usted.
      </p>
      {sound && <div className="mt-5">{sound}</div>}
      <div className="mt-auto pt-8">
        <button
          type="button"
          style={stagger(2)}
          onClick={() => onPick("chat")}
          className="press flex min-h-16 w-full items-center justify-center gap-3 rounded-full bg-vc-primary px-6 py-3 text-vc-on-primary hover:bg-vc-primary-press active:bg-vc-primary-press"
        >
          <MessageCircle className="size-6 shrink-0" aria-hidden strokeWidth={1.75} />
          <span className="text-[18px] font-semibold leading-tight">Chatear con el asistente</span>
        </button>
        {others.length > 0 && (
        <ul className={`mt-3 grid gap-3 ${others.length > 1 ? "grid-cols-2" : ""}`}>
          {others.map(({ id, icon: Icon, title }, n) => (
            <li key={id} style={stagger(n + 3)}>
              <button
                type="button"
                onClick={() => onPick(id)}
                className="app-lift press flex min-h-[104px] w-full flex-col items-start justify-between gap-3 rounded-3xl border border-vc-line bg-vc-card p-4 text-left text-vc-text hover:bg-vc-bg-2 active:bg-vc-surface-press"
              >
                <Icon className="size-6 text-vc-icon" aria-hidden strokeWidth={1.5} />
                <span className="text-[16px] font-semibold leading-tight">{title}</span>
              </button>
            </li>
          ))}
        </ul>
        )}
        <p style={stagger(5)} className="mt-5 flex items-start gap-2 text-pretty text-[14px] leading-snug text-vc-text-2">
          <TriangleAlert className="mt-px size-4 shrink-0 text-vc-danger-press" aria-hidden />
          <span>¿Es una emergencia? Acuda a emergencia o llame al 106 (SAMU).</span>
        </p>
        <EvidenceLink className="mt-2" />
      </div>
    </main>
  );
}

function ChatView({ data, reload, sound }: { data: ChatData; reload: () => Promise<void>; sound?: ReactNode }) {
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
        setTimeout(safeReload, 1200);
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
      sound={sound}
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
  /** "Activar sonido y llamadas", at the top of the thread while sound is off */
  sound?: ReactNode;
};

const BUBBLE_LABEL: Record<string, string> = { oferta: "Oferta de cupo", validacion: "Confirmación de cupo" };

/** The chat thread, the quick answers and the composer. Props only (ChatView owns the state). */
export function ChatThreadView({ messages, consent, typing, quick, text, listRef, onText, onSend, onSubmit, sound }: ChatThreadViewProps) {
  return (
    <>
      <ThreadList listRef={listRef}>
        {sound && <li className="flex justify-center">{sound}</li>}
        {!messages.length && !typing && (
          <li className="mx-auto mt-10 max-w-[260px] text-center text-[16px] leading-snug text-vc-text-2">Escriba un mensaje para empezar.</li>
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
        className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 bg-vc-bg px-3 pb-2 pt-2"
      >
        {/* "Hablar con una persona" is a button now: it sends the existing PERSONA command (src/lib/chat/router.ts) */}
        {consent && (
          <div className="w-full">
            <button
              type="button"
              disabled={typing}
              onClick={() => onSend("PERSONA")}
              className="vc-pill press inline-flex min-h-11 items-center gap-2 rounded-full bg-vc-surface px-4 text-[15px] font-semibold text-vc-text active:bg-vc-surface-press disabled:opacity-50"
            >
              <UserRound className="size-[18px] text-vc-icon" aria-hidden />
              Hablar con una persona
            </button>
          </div>
        )}
        <label className="sr-only" htmlFor="msg">
          Mensaje
        </label>
        <input
          id="msg"
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder={consent ? "Escriba aquí…" : "Escriba ACEPTO para continuar"}
          autoComplete="off"
          enterKeyHint="send"
          className="min-h-12 min-w-0 flex-1 rounded-full border border-vc-edge bg-vc-card px-4 text-[16px] text-vc-text placeholder:text-vc-text-3 focus:border-vc-focus"
        />
        <button
          type="submit"
          disabled={!text.trim() || typing}
          aria-label="Enviar"
          className="vc-round press grid size-12 shrink-0 place-items-center rounded-full bg-vc-primary text-vc-on-primary active:bg-vc-primary-press disabled:bg-vc-surface disabled:text-vc-text-3"
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
function VoiceRegister({ onDone, ready, jury }: { onDone: () => void; ready: boolean; jury?: string }) {
  const [vs, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [live, setLive] = useState<{ session: VoiceSession; voiceSessionId: string; pushToTalk?: boolean } | null>(null);
  const [talking, setTalking] = useState(false);
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
    /** noisy-room mode (push-to-talk), from settings_v51 'sala_ruidosa' */
    pushToTalk?: boolean;
  };

  async function request(id: string): Promise<R> {
    const body = { mode: "registro", diag: id, callId: callRef.current ?? undefined, queueId: queueId.current, jury };
    try {
      return await post<R>("/api/voice/session", body);
    } catch (e) {
      // the chat session may still be on its way: create it (idempotent) and retry once
      voiceDiag(id, "session.reintento", { message: (e as Error).message.slice(0, 120) });
      await post("/api/chat/session", jury ? { jury } : {}).catch(() => {});
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
        setLive({ session: r.session, voiceSessionId: r.voiceSessionId, pushToTalk: !!r.pushToTalk });
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
  // noisy-room mode: the same rule as CallScreen — only while the view draws "Mantener para hablar" (contract.ts)
  const pushToTalk = !!live?.pushToTalk && PUSH_TO_TALK_BUTTON_READY && viewPhase === "activa";

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
          pushToTalk={
            pushToTalk
              ? {
                  talking,
                  start: () => {
                    setTalking(true);
                    control.current?.talkStart();
                  },
                  end: () => {
                    setTalking(false);
                    control.current?.talkEnd();
                  },
                }
              : undefined
          }
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
          pushToTalk={pushToTalk}
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
