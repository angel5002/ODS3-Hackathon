"use client";

// The patient's pre-visit (/preconsulta/<token>): consent first (who answers, what this channel is not), then short
// questions by chat. Optional "Leer en voz alta": the assistant's lines are read with the agents' own pre-generated
// voice when the text is one of them (the scene's lines), otherwise with the browser's speech synthesis.
// An alarm sign ends the chat with the emergency instruction (go to the emergency room or call 106).
import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneCall, SendHorizontal, ShieldAlert, Volume2, VolumeX } from "lucide-react";
import { Brand } from "@/components/Brand";
import { DISCLAIMER } from "@/lib/labels";
import { ESCENA_2 } from "@/lib/demo/scenes";

type Msg = { id: number; who: "ia" | "persona"; text: string };
export type PatientView = {
  alias: string;
  status: string;
  consent: boolean;
  intro: string;
  messages: Msg[];
  version: number;
  done: boolean;
  emergency: boolean;
  buttons: string[];
};

const PREGENERATED = new Map(ESCENA_2.lines.filter((l) => l.audio).map((l) => [l.text, l.audio!]));

function speak(text: string, audioEl: HTMLAudioElement | null) {
  const file = PREGENERATED.get(text);
  if (file && audioEl) {
    audioEl.src = file;
    void audioEl.play().catch(() => {});
    return;
  }
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-PE";
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

export type PreconsultaChatProps = { token: string };

export function PreconsultaChat({ token }: PreconsultaChatProps) {
  const [view, setView] = useState<PatientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState(false);
  const spokenRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const url = `/api/preconsulta/${token}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar la preconsulta.");
      setView(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la preconsulta.");
    }
  }, [url]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (res.ok || res.status === 409) {
          if (data && "messages" in data) setView(data as PatientView);
          setError(null);
          return true;
        }
        setError(data.error ?? "No se pudo guardar. Intente de nuevo.");
        return false;
      } catch {
        setError("Sin conexión. Intente de nuevo.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, url],
  );

  // read the new assistant lines aloud (only if the person turned it on)
  useEffect(() => {
    if (!view) return;
    const ia = view.messages.filter((m) => m.who === "ia");
    if (voice && ia.length > spokenRef.current) {
      for (const m of ia.slice(spokenRef.current)) speak(m.text, audioRef.current);
    }
    spokenRef.current = ia.length;
    listRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [view, voice]);

  const answer = async (value: string) => {
    if (!view || !value.trim()) return;
    const ok = await send({ action: "answer", text: value.trim(), version: view.version });
    if (ok) setText("");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <audio ref={audioRef} preload="none" />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[640px] items-center justify-between gap-3 px-4 py-3">
          <Brand compact />
          {view?.consent && (
            <button
              type="button"
              onClick={() => {
                const on = !voice;
                setVoice(on);
                if (!on && "speechSynthesis" in window) window.speechSynthesis.cancel();
                if (!on) audioRef.current?.pause();
              }}
              aria-pressed={voice}
              className="press inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[15px] font-semibold hover:bg-sunken"
            >
              {voice ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
              {voice ? "Leyendo en voz alta" : "Leer en voz alta"}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4 py-4">
        <h1 className="text-[22px] font-bold leading-tight">Preconsulta{view ? ` de ${view.alias}` : ""}</h1>
        <p className="mt-1 text-[15px] text-muted">Asistente automatizado · prepara su consulta, no la reemplaza</p>

        {error && (
          <p role="alert" className="mt-3 rounded-md border border-risk-alto bg-risk-alto-soft p-3 text-[15px] text-risk-alto">
            {error}
          </p>
        )}

        {!view && !error && <p className="mt-6 text-muted">Cargando…</p>}

        {view && !view.consent && (
          <section className="mt-4 rounded-md border border-line bg-surface p-4">
            <p className="text-[17px] leading-relaxed">{view.intro}</p>
            <p className="mt-3 text-[16px] font-semibold">¿Quién responde?</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void send({ action: "consent", respondent: "paciente" })}
                className="press min-h-12 rounded-md bg-brand px-4 text-[16px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
              >
                Acepto · soy el paciente
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send({ action: "consent", respondent: "acompanante" })}
                className="press min-h-12 rounded-md border border-line-strong bg-surface px-4 text-[16px] font-semibold hover:bg-sunken disabled:opacity-60"
              >
                Acepto · respondo por el paciente
              </button>
            </div>
          </section>
        )}

        {view?.consent && (
          <>
            <ol ref={listRef} className="mt-4 flex flex-1 flex-col gap-2" aria-live="polite" aria-label="Conversación">
              {view.messages.map((m) => (
                <li key={m.id} className={`bubble-in flex ${m.who === "ia" ? "justify-start" : "justify-end"}`}>
                  <p
                    className={`max-w-[85%] whitespace-pre-line rounded-md px-3 py-2 text-[16px] leading-snug ${
                      m.who === "ia" ? "border border-line bg-surface" : "bg-brand text-white"
                    }`}
                  >
                    {m.text}
                  </p>
                </li>
              ))}
            </ol>

            {view.emergency && (
              <section role="alert" className="mt-4 rounded-md border-2 border-risk-alto bg-risk-alto-soft p-4 text-risk-alto">
                <p className="flex items-center gap-2 text-[19px] font-bold">
                  <ShieldAlert className="size-6" aria-hidden /> No espere su cita
                </p>
                <p className="mt-1 text-[17px] text-ink">Acuda a la emergencia más cercana o llame al 106 (SAMU).</p>
                <a
                  href="tel:106"
                  className="press mt-3 inline-flex min-h-12 items-center gap-2 rounded-md bg-risk-alto px-4 text-[17px] font-bold text-white"
                >
                  <PhoneCall className="size-5" aria-hidden /> Llamar al 106
                </a>
              </section>
            )}

            {view.done && !view.emergency && (
              <p className="mt-4 rounded-md border border-line bg-surface p-3 text-[15px] text-muted">
                La preconsulta terminó. Su médico la verá antes de atenderle. Puede cerrar esta página.
              </p>
            )}

            {!view.done && (
              <div className="sticky bottom-0 mt-4 bg-paper pb-[env(safe-area-inset-bottom,0px)] pt-2">
                {view.buttons.length > 0 && (
                  <div className="mb-2 flex gap-2">
                    {view.buttons.map((b) => (
                      <button
                        key={b}
                        type="button"
                        disabled={busy}
                        onClick={() => void answer(b)}
                        className="press min-h-11 flex-1 rounded-md border border-brand bg-surface px-4 text-[16px] font-semibold text-brand hover:bg-brand-soft disabled:opacity-60"
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void answer(text);
                  }}
                >
                  <label htmlFor="pc-answer" className="sr-only">
                    Su respuesta
                  </label>
                  <input
                    id="pc-answer"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={400}
                    autoComplete="off"
                    placeholder="Escriba su respuesta"
                    className="min-h-12 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-[16px]"
                  />
                  <button
                    type="submit"
                    disabled={busy || !text.trim()}
                    className="press inline-flex min-h-12 min-w-12 items-center justify-center rounded-md bg-brand px-3 text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    <SendHorizontal className="size-5" aria-hidden />
                    <span className="sr-only">Enviar</span>
                  </button>
                </form>
                <p className="mt-1.5 text-[13px] text-muted">Puede escribir «no sé» o «prefiero decirlo en la consulta». Escriba PERSONA para hablar con alguien.</p>
              </div>
            )}
          </>
        )}
      </main>
      <footer className="border-t border-line bg-surface">
        <p className="mx-auto max-w-[640px] px-4 py-3 text-[13px] leading-snug text-muted">{DISCLAIMER}</p>
      </footer>
    </div>
  );
}
