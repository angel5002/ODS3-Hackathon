"use client";

// /pedir-cita (v4 §3): public and mobile. Three ways in: chat with the assistant, a voice call in the
// browser, or the front-desk form as a fallback. No third-party logos, no phone number, no e-mail.
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ClipboardList, Info, MessageCircle, Mic, PhoneOff, SendHorizontal, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/Brand";
import { getJson, post } from "@/lib/post";
import { browserDb } from "@/lib/supabase/browser";
import { DISCLAIMER } from "@/lib/labels";
import { ring, unlockAudio } from "@/lib/voice/audio";
import type { Call } from "@/lib/types";
import type { Turn } from "@/lib/voice/agent";
import { CallScreen } from "@/components/phone/CallScreen";
import { RegisterForm } from "@/components/panel/WaitlistTab";
import type { VoiceSession } from "@/components/phone/ElevenLabsCall";

const ElevenLabsCall = dynamic(() => import("@/components/phone/ElevenLabsCall").then((m) => m.ElevenLabsCall), { ssr: false });

type Msg = { id: number; direction: "saliente" | "entrante"; kind: string; body: string; buttons: string[] | null; answered_with: string | null; created_at: string };
type ChatData = { alias: string; topic: string; consent: boolean; linkedName: string | null; messages: Msg[]; call: Call | null };
type View = "inicio" | "chat" | "voz" | "formulario";

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
    <div className="flex h-dvh justify-center bg-[#cfd8d4] sm:py-6">
      <div className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-paper sm:rounded-[28px] sm:shadow-xl">
        <header className="flex items-center gap-2 bg-brand px-3 pb-2.5 pt-[calc(0.6rem+env(safe-area-inset-top))] text-white">
          {view !== "inicio" ? (
            <button onClick={() => setView("inicio")} aria-label="Volver" className="press grid size-9 place-items-center rounded-full hover:bg-white/10">
              <ArrowLeft className="size-5" />
            </button>
          ) : (
            <span className="rounded-lg bg-white px-2 py-1">
              <Brand />
            </span>
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold">{view === "chat" ? "Asistente de citas" : view === "voz" ? "Llamada con el asistente" : view === "formulario" ? "Formulario" : "Pedir una cita"}</p>
            <p className="truncate text-xs text-white/75">{data ? `Usted aparece como «${data.alias}»${data.linkedName ? ` · personaje: ${data.linkedName}` : ""}` : "Conectando…"}</p>
          </div>
          {view === "chat" && (
            <button onClick={wipe} title="Borrar mi conversación" aria-label="Borrar mi conversación" className="press grid size-9 place-items-center rounded-full hover:bg-white/10">
              <Trash2 className="size-4.5" />
            </button>
          )}
        </header>
        <p className="flex items-start gap-2 bg-[#fff8e1] px-3 py-1.5 text-[11px] leading-snug text-[#6b4e00]">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {DISCLAIMER} Use un nombre ficticio.
        </p>
        {!sound && (
          <button onClick={enableSound} className="press flex items-center justify-center gap-2 bg-[#10302f] px-3 py-2.5 text-sm font-semibold text-white">
            <Volume2 className="size-4" aria-hidden /> Activar sonido y llamadas
          </button>
        )}

        {expired && (
          <div className="m-auto max-w-xs p-6 text-center text-sm text-muted">
            La conversación se cerró o venció.{" "}
            <button className="font-semibold text-brand underline" onClick={() => window.location.reload()}>
              Empezar de nuevo
            </button>
          </div>
        )}

        {!expired && view === "inicio" && <Home onPick={setView} />}
        {!expired && view === "chat" && data && <ChatView data={data} reload={load} />}
        {!expired && view === "voz" && <VoiceRegister onDone={() => setView("chat")} />}
        {!expired && view === "formulario" && (
          <div className="flex-1 overflow-y-auto p-4">
            <p className="mb-3 text-sm text-muted">El mismo formulario de ventanilla. Su respuesta y las ofertas llegarán al chat de esta página.</p>
            <RegisterForm
              compact
              endpoint="/api/public/request"
              onDone={(code) => {
                toast.success(`Solicitud ${code} registrada`);
                setView("chat");
                load();
              }}
            />
          </div>
        )}

        {call && <CallScreen key={call.id} call={call} auth={{}} name={data?.alias ?? ""} onDone={load} />}
      </div>
    </div>
  );
}

function Home({ onPick }: { onPick: (v: View) => void }) {
  const items = [
    { id: "chat" as const, icon: MessageCircle, title: "Chatear con el asistente", text: "Le hace unas preguntas y registra su solicitud en unos minutos." },
    { id: "voz" as const, icon: Mic, title: "Hablar con el asistente", text: "Una llamada de voz aquí mismo, en el navegador. Necesita el micrófono." },
    { id: "formulario" as const, icon: ClipboardList, title: "Formulario", text: "El mismo formulario de la ventanilla del hospital." },
  ];
  return (
    <main className="flex-1 overflow-y-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold leading-tight tracking-tight">¿Necesita una cita?</h1>
      <p className="mt-1 text-sm text-muted">
        Registramos su solicitud aunque hoy no haya cupo. Un profesional la revisa y le avisamos aquí cuando haya un cupo para usted. No le
        pedimos su número ni su correo.
      </p>
      <ul className="mt-5 space-y-3">
        {items.map(({ id, icon: Icon, title, text }) => (
          <li key={id}>
            <button onClick={() => onPick(id)} className="press flex w-full items-start gap-3 rounded-2xl bg-surface p-4 text-left ring-1 ring-line hover:ring-brand">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted">{text}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-muted">Si tiene dolor fuerte en el pecho, falta de aire, un desmayo o sangrado abundante, no espere una cita: acuda a emergencia o llame al 106 (SAMU).</p>
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
    <>
      <ol ref={listRef} className="flex-1 space-y-2 overflow-y-auto overscroll-contain bg-[#e9efed] px-3 py-3" aria-live="polite">
        {data.messages.map((m) => (
          <li key={m.id} className={`bubble-in flex ${m.direction === "entrante" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[86%] rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm ${
                m.direction === "entrante" ? "rounded-br-md bg-brand text-white" : m.kind === "oferta" || m.kind === "validacion" ? "rounded-bl-md bg-white ring-2 ring-st-free/50" : "rounded-bl-md bg-white text-ink"
              }`}
            >
              <p className="whitespace-pre-line">{m.body}</p>
              {m.answered_with && <p className="mt-1 text-xs font-semibold text-brand">Respondió: {m.answered_with}</p>}
              <p className={`mt-1 text-right text-[11px] ${m.direction === "entrante" ? "text-white/70" : "text-faint"}`}>
                {new Date(m.created_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </li>
        ))}
        {typing && (
          <li className="flex justify-start" aria-label="El asistente está escribiendo">
            <span className="rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm text-muted shadow-sm">escribiendo…</span>
          </li>
        )}
      </ol>
      {quick && (
        <div className="flex flex-wrap gap-1.5 border-t border-black/5 bg-white px-3 pt-2">
          {quick.map((b) => (
            <button key={b} disabled={typing} onClick={() => send(b)} className="press min-h-10 rounded-full border border-brand/30 px-3 text-sm font-semibold text-brand active:bg-brand-soft disabled:opacity-50">
              {b}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex items-center gap-2 bg-white px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2"
      >
        <label className="sr-only" htmlFor="msg">
          Mensaje
        </label>
        <input
          id="msg"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          placeholder={data.consent ? "Escriba aquí… (PERSONA para hablar con alguien)" : "Escriba ACEPTO para continuar"}
          autoComplete="off"
          enterKeyHint="send"
          className="min-h-11 flex-1 rounded-full bg-sunken px-4 text-[16px]"
        />
        <button type="submit" disabled={!text.trim() || typing} aria-label="Enviar" className="press grid size-11 place-items-center rounded-full bg-brand text-white disabled:opacity-50">
          <SendHorizontal className="size-5" />
        </button>
      </form>
    </>
  );
}

/** Registration by voice in the browser with the asistia-registro agent (fallback: chat or form). */
function VoiceRegister({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<"idle" | "connecting" | "live" | "unavailable" | "ended">("idle");
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [callId, setCallId] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [reason, setReason] = useState("");
  const hangUp = useRef<(() => void) | null>(null);

  async function start() {
    setState("connecting");
    const mic = await unlockAudio({ microphone: true });
    if (!mic) {
      setReason("No se pudo usar el micrófono. Revise el permiso del navegador o use el chat.");
      setState("unavailable");
      return;
    }
    try {
      const r = await post<{ session: VoiceSession | null; callId: number; reason?: string }>("/api/voice/session", { mode: "registro" });
      setCallId(r.callId);
      if (!r.session) throw new Error(r.reason ?? "La llamada no está disponible ahora.");
      setSession(r.session);
      setState("live");
    } catch (e) {
      setReason((e as Error).message);
      setState("unavailable");
    }
  }

  async function end(result: string) {
    setState("ended");
    if (callId) await post("/api/voice/status", { callId, status: "finalizada", result }).catch(() => {});
  }

  return (
    <main className="flex flex-1 flex-col bg-[#10302f] p-4 text-white">
      {state === "idle" && (
        <div className="m-auto max-w-xs text-center">
          <p className="text-lg font-semibold">Hablar con el asistente</p>
          <p className="mt-2 text-sm text-white/75">Le hará las mismas preguntas que el chat, una a la vez. Use un nombre ficticio. No se graba la llamada.</p>
          <button onClick={start} className="press mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#17b26a] px-6 font-semibold">
            <Mic className="size-5" aria-hidden /> Empezar la llamada
          </button>
        </div>
      )}
      {state === "connecting" && <p className="m-auto text-white/75">Conectando…</p>}
      {(state === "live" || state === "ended") && (
        <>
          <p className="text-center text-sm text-white/70">{state === "live" ? (speaking ? "Habla el asistente" : "Le escucha: hable con normalidad") : "Llamada terminada"}</p>
          <ol className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-2xl bg-black/20 p-3" aria-live="polite">
            {turns.map((t, i) => (
              <li key={i} className={`flex ${t.who === "paciente" ? "justify-end" : ""}`}>
                <p className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] ${t.who === "agente" ? "bg-white/10" : "bg-[#7ee0c9] text-[#0b2b2a]"}`}>{t.text}</p>
              </li>
            ))}
          </ol>
          {state === "live" ? (
            <button onClick={() => hangUp.current?.()} className="press mx-auto mt-4 grid size-16 place-items-center rounded-full bg-[#d92d20]" aria-label="Colgar">
              <PhoneOff className="size-7" />
            </button>
          ) : (
            <button onClick={onDone} className="press mx-auto mt-4 min-h-11 rounded-full bg-white px-5 font-semibold text-[#10302f]">
              Ver mi conversación
            </button>
          )}
        </>
      )}
      {state === "unavailable" && (
        <div className="m-auto max-w-xs text-center">
          <p className="font-semibold">La llamada no está disponible</p>
          <p className="mt-1 text-sm text-white/75">{reason}</p>
          <button onClick={onDone} className="press mt-4 min-h-11 rounded-full bg-white px-5 font-semibold text-[#10302f]">
            Usar el chat
          </button>
        </div>
      )}
      {session && state === "live" && (
        <ElevenLabsCall
          session={session}
          hangUpRef={hangUp}
          onTurn={(t) => setTurns((x) => [...x, t])}
          onSpeaking={setSpeaking}
          onConnected={(ms) => callId && post("/api/voice/status", { callId, status: "en_curso", first_turn_ms: ms, provider: "elevenlabs" }).catch(() => {})}
          onEnd={(r) => end(r)}
          onFail={(err) => {
            setReason(`La voz falló (${err}). Puede seguir por el chat o el formulario.`);
            setState("unavailable");
            if (callId) post("/api/voice/status", { callId, status: "fallo", result: err.slice(0, 120) }).catch(() => {});
          }}
        />
      )}
    </main>
  );
}
