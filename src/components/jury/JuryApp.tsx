"use client";

// /j/<token>: the jury member's card on their own phone (track E, docs/jurado.md). First the character
// (who they are, what to try), then the right experience:
//   cancela / confirma / acepta_oferta -> the simulated phone of the character (messages, and the call when
//   there is a free voice line); pide_cita -> /pedir-cita tied to this card (voice and/or chat).
// When every voice line is busy the page simply offers messages or chat: no error on the card page.
import { useState, type CSSProperties, type ReactNode } from "react";
import { MessageCircle, Mic, Phone, QrCode, Smartphone } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/Brand";
import { DemoNotice } from "@/components/chat/ChatParts";
import { PedirCita, PedirCitaFrame } from "@/components/chat/PedirCita";
import { PhoneApp } from "@/components/phone/PhoneApp";
import { DISCLAIMER } from "@/lib/labels";
import { post } from "@/lib/post";
import { unlockAudio } from "@/lib/voice/audio";
import type { PublicCard } from "@/lib/jury/server";

type Stage = "intro" | "phone" | "chat" | "voz";
const stagger = (n: number) => ({ "--i": n }) as CSSProperties;

export function JuryApp({ card, voice }: { card: PublicCard; voice: boolean }) {
  const [stage, setStage] = useState<Stage>("intro");
  const [busy, setBusy] = useState(false);
  const [voiceFree, setVoiceFree] = useState(voice);

  async function call() {
    if (busy) return;
    setBusy(true);
    await unlockAudio({ microphone: true }).catch(() => false);
    try {
      const r = await post<{ voice: boolean }>("/api/jury", { token: card.token, action: "call" });
      if (!r.voice) setVoiceFree(false);
    } catch {
      setVoiceFree(false);
    } finally {
      setBusy(false);
      setStage("phone"); // the call screen opens on the phone when it rings; otherwise the messages are there
    }
  }

  if (stage === "phone") return <PhoneApp token={card.token} />;
  if (stage === "chat") return <PedirCita jury={card.token} channels={["chat"]} start="chat" />;
  if (stage === "voz") return <PedirCita jury={card.token} channels={["voz", "chat"]} start="voz" />;

  const withVoice = card.channel !== "chat";
  const actions: ReactNode[] = [];
  if (card.kind === "pide_cita") {
    if (withVoice && voiceFree) actions.push(<Action key="v" main icon={Mic} title="Pedir la cita hablando" text="Una llamada con el asistente, aquí mismo. Necesita el micrófono." onPress={() => setStage("voz")} />);
    actions.push(
      <Action
        key="c"
        main={!(withVoice && voiceFree)}
        icon={MessageCircle}
        title="Pedir la cita por chat"
        text="El asistente le hace unas preguntas, una a la vez."
        onPress={() => setStage("chat")}
      />,
    );
  } else if (card.kind === "acepta_oferta") {
    actions.push(
      <Action
        key="p"
        main
        icon={Smartphone}
        title="Abrir mi teléfono"
        text={withVoice && voiceFree ? "Cuando haya un cupo para usted, lo llamarán y le llegará un mensaje aquí." : "Cuando haya un cupo para usted, le llegará un mensaje aquí."}
        onPress={() => setStage("phone")}
      />,
    );
  } else {
    if (withVoice && voiceFree) actions.push(<Action key="v" main icon={Phone} title="Recibir la llamada del hospital" text="El asistente lo llama ahora. Necesita el micrófono." disabled={busy} onPress={call} />);
    actions.push(
      <Action
        key="m"
        main={!(withVoice && voiceFree)}
        icon={MessageCircle}
        title="Responder por mensaje"
        text="El recordatorio de su cita ya está en su teléfono."
        onPress={() => setStage("phone")}
      />,
    );
  }

  return (
    <PedirCitaFrame>
      <JuryCardIntro card={card} voiceBusy={withVoice && !voiceFree} actions={actions} />
    </PedirCitaFrame>
  );
}

// ---------- Presentational pieces: props only ----------

export function JuryCardIntro({ card, actions, voiceBusy }: { card: PublicCard; actions: ReactNode; voiceBusy?: boolean }) {
  return (
    <>
      <header className="flex shrink-0 items-center gap-2.5 border-b border-vc-line bg-vc-bg px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <span className="flex min-h-11 items-center gap-2 text-ink">
          <BrandMark className="size-7" />
          <Wordmark className="text-[19px]" />
        </span>
        <div className="min-w-0 flex-1 border-l border-vc-line pl-2.5 leading-tight">
          <p className="truncate text-[17px] font-bold text-vc-text">Cartilla del jurado</p>
          <p className="truncate text-[13px] text-vc-text-2">Personaje ficticio · no use datos reales</p>
        </div>
      </header>
      <main className="vc-enter flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-6">
        <p style={stagger(0)} className="text-[15px] font-semibold uppercase tracking-[0.06em] text-vc-text-3">
          Usted es
        </p>
        <h1 style={stagger(1)} className="mt-1 text-balance text-[34px] font-bold leading-tight text-vc-text">
          {card.character}
        </h1>
        <p style={stagger(2)} className="mt-3 max-w-[38ch] text-pretty text-[17px] leading-snug text-vc-text">
          {card.story}
        </p>
        <div style={stagger(3)} className="mt-4 border-l-4 border-vc-primary bg-vc-bg-2 p-3">
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-vc-text-2">Qué puede probar</p>
          <p className="mt-1 text-pretty text-[17px] font-semibold leading-snug text-vc-text">{card.tryLine}</p>
        </div>
        {voiceBusy && (
          <p style={stagger(4)} className="mt-4 text-pretty text-[15px] leading-snug text-vc-text-2">
            Las llamadas de voz están ocupadas en este momento: puede hacerlo por mensaje, el resultado es el mismo.
          </p>
        )}
        <ul className="mt-5 space-y-2.5">{actions}</ul>
      </main>
      <DemoNotice>{DISCLAIMER}</DemoNotice>
    </>
  );
}

function Action({
  icon: Icon,
  title,
  text,
  main,
  disabled,
  onPress,
}: {
  icon: typeof Phone;
  title: string;
  text: string;
  main?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onPress}
        className={`app-lift flex w-full items-center gap-3 rounded-md border p-4 text-left disabled:opacity-60 ${
          main
            ? "border-vc-primary bg-vc-primary text-vc-on-primary hover:bg-vc-primary-press active:bg-vc-primary-press"
            : "border-vc-edge bg-vc-bg text-vc-text hover:bg-vc-bg-2 active:bg-vc-surface-press"
        }`}
      >
        <Icon className={`size-6 shrink-0 ${main ? "text-vc-on-primary" : "text-vc-icon"}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold leading-tight">{title}</span>
          <span className={`mt-1 block text-[15px] leading-snug ${main ? "text-vc-on-primary-2" : "text-vc-text-2"}`}>{text}</span>
        </span>
      </button>
    </li>
  );
}

export function JuryMissing() {
  return (
    <PedirCitaFrame>
      <div className="vc-enter m-auto flex max-w-xs flex-col items-center p-6 text-center">
        <QrCode className="size-8 text-vc-icon" aria-hidden />
        <p className="mt-3 text-pretty text-[16px] leading-snug text-vc-text-2">
          Esta cartilla no corresponde a ningún personaje de la demo. Vuelva a escanear el código de su cartilla.
        </p>
      </div>
      <DemoNotice>{DISCLAIMER}</DemoNotice>
    </PedirCitaFrame>
  );
}
