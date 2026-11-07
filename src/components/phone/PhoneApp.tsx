"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Building2, QrCode } from "lucide-react";
import { Bubble, DeadlineChip, DemoNotice, ReplyButton, ReplyButtons, SoundBar, ThreadList } from "@/components/chat/ChatParts";
import { toast } from "sonner";
import { useDemoState, useHints, useNow, useSingleFlight } from "@/lib/realtime";
import { getJson, post } from "@/lib/post";
import { DISCLAIMER, demoNowMin, fmtMin } from "@/lib/labels";
import { isBroad, type Call, type Message, type Offer, type Patient } from "@/lib/types";
import { unlockAudio } from "@/lib/voice/audio";
import { CallScreen } from "./CallScreen";

const REPLY_ID: Record<string, string> = {
  Confirmo: "confirma",
  "No podré asistir": "libera",
  Reprogramar: "reprograma",
  "Hablar con una persona": "persona",
};

type Appt = { id: number; specialty: string; date: string; time: string; remote: boolean; status: string };
type Data = {
  patient: Patient;
  appts: Appt[];
  messages: Message[];
  offers: Offer[];
  slotOffers: { id: number; state: string; closes_min: number }[];
  assignments: { id: number; validation_state: string; reverted: boolean }[];
  call: Call | null;
};

export function PhoneApp({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const state = useDemoState();
  const now = useNow(1000);
  const listRef = useRef<HTMLOListElement>(null);

  const fetchData = useCallback(async () => {
    try {
      setData(await getJson<Data>(`/api/patient?token=${encodeURIComponent(token)}`));
    } catch {
      setMissing(true);
    }
  }, [token]);
  const load = useSingleFlight(fetchData);

  useEffect(() => {
    load();
  }, [load]);

  const patientId = data?.patient.id;
  useHints((h) => {
    if (isBroad(h) || (patientId && h.patients.includes(patientId)) || h.kind === "slot" || h.kind === "call") load();
  });

  // presence for the operator ("En vivo" in /demo), every 20 s while open
  useEffect(() => {
    const ping = () => post("/api/patient", { token, action: "presence", soundReady }).catch(() => {});
    ping();
    const id = setInterval(ping, 20000);
    return () => clearInterval(id);
  }, [token, soundReady]);

  const count = data?.messages.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: count > 1 ? "smooth" : "auto" });
  }, [count]);

  const ringing = data?.call?.status === "sonando";
  useEffect(() => {
    if (ringing && "vibrate" in navigator) navigator.vibrate?.([400, 200, 400, 200, 400]);
  }, [ringing]);

  async function send(body: Record<string, unknown>, msgId: number) {
    setBusy(msgId);
    try {
      await post("/api/patient", { token, ...body });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function enableSound() {
    const okMic = await unlockAudio({ microphone: true });
    setSoundReady(true);
    toast.success(okMic ? "Sonido y micrófono listos para las llamadas" : "Sonido listo. El micrófono se pedirá al contestar.", { position: "bottom-center" }); // never over the header
  }

  if (missing) {
    return (
      <Shell>
        <PhoneMissing />
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <PhoneLoading />
      </Shell>
    );
  }

  const p = data.patient;
  const nowMin = demoNowMin(state, now);
  const latestReminder = [...data.messages].reverse().find((m) => m.kind === "recordatorio");
  const callActive = data.call && (data.call.status === "sonando" || data.call.status === "en_curso");

  function buttonsFor(m: Message): { label: string; body: Record<string, unknown> }[] | null {
    if (m.direction !== "saliente" || !m.buttons || m.answered_with) return null;
    const appt = data!.appts.find((x) => x.id === m.appointment_id);
    if (m.kind === "recordatorio") {
      const open = m.id === latestReminder?.id && (appt?.status === "recordatorio_enviado" || appt?.status === "sin_respuesta");
      return open ? m.buttons.map((b) => ({ label: b, body: { action: "reply", appointmentId: m.appointment_id, reply: REPLY_ID[b] } })) : null;
    }
    if (m.kind === "reprogramacion") {
      const open = appt && !["liberada", "reasignada", "reprogramacion_pendiente"].includes(appt.status);
      return open ? m.buttons.map((b) => ({ label: b, body: { action: "reschedule", appointmentId: m.appointment_id, label: b } })) : null;
    }
    if (m.kind === "oferta" && m.slot_offer_id) {
      const so = data!.slotOffers.find((o) => o.id === m.slot_offer_id);
      if (so?.state !== "enviada") return null;
      return m.buttons.map((b) => ({
        label: b,
        body: { action: "offer", slotOfferId: m.slot_offer_id, requestId: m.request_id, accept: b === "Acepto" },
      }));
    }
    if (m.kind === "oferta") {
      const offer = data!.offers.find((o) => o.id === m.offer_id);
      if (!(offer?.status === "enviada" && nowMin <= offer.expires_min)) return null;
      return m.buttons.map((b) => ({ label: b, body: { action: "offer", offerId: m.offer_id, accept: b === "Acepto" } }));
    }
    if (m.kind === "validacion") {
      const a = data!.assignments.find((x) => x.id === m.assignment_id);
      if (a?.validation_state !== "pendiente" || a.reverted) return null;
      return m.buttons.map((b) => ({
        label: b,
        body: { action: "validate", assignmentId: m.assignment_id, ok: b !== "No puedo", role: b.includes("cuidador") ? "cuidador" : "paciente" },
      }));
    }
    return null;
  }

  return (
    <Shell>
      <PhoneHeader clock={state ? fmtMin(nowMin) : ""} />
      <DemoNotice>
        Teléfono simulado de <strong className="font-semibold text-vc-text">{p.full_name}</strong>
        {p.caregiver_name ? ` (lo usa ${p.caregiver_name}, ${p.caregiver_relation})` : ""}. {DISCLAIMER}
      </DemoNotice>
      {!soundReady && <SoundBar onEnable={enableSound} />}

      <ThreadList listRef={listRef}>
        {!data.messages.length && <PhoneEmpty />}
        {data.messages.map((m) => {
          const so = m.slot_offer_id ? data.slotOffers.find((o) => o.id === m.slot_offer_id) : undefined;
          const buttons = buttonsFor(m);
          return (
            <Bubble
              key={m.id}
              mine={m.direction === "entrante"}
              highlight={m.direction === "saliente" ? (PHONE_BUBBLE_LABEL[m.kind] ?? null) : null}
              answered={m.direction === "saliente" ? m.answered_with : null}
              sent={m.direction === "entrante"}
              time={fmtMin(m.demo_min)}
              after={
                <>
                  {m.kind === "oferta" && so?.state === "enviada" && (
                    <DeadlineChip>
                      Se cierra a las {fmtMin(so.closes_min)} ({Math.max(0, so.closes_min - nowMin)} min)
                    </DeadlineChip>
                  )}
                  {buttons && (
                    <ReplyButtons>
                      {buttons.map((b) => (
                        <ReplyButton key={b.label} label={b.label} disabled={busy === m.id} onPress={() => send(b.body, m.id)} />
                      ))}
                    </ReplyButtons>
                  )}
                </>
              }
            >
              {m.body}
            </Bubble>
          );
        })}
      </ThreadList>
      <PhoneFooter />

      {callActive && data.call && (
        <CallScreen key={data.call.id} call={data.call} auth={{ token }} name={p.first_name} onDone={load} />
      )}
    </Shell>
  );
}

// ---------- Presentational pieces (E5 app): props only, also rendered by /dev/pantallas ----------

const PHONE_BUBBLE_LABEL: Record<string, string> = {
  oferta: "Oferta de cupo",
  validacion: "Confirmación de cupo",
};

/** The simulated phone: full screen on a phone, a framed handset on a desktop. */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-dvh items-stretch justify-center bg-vc-bg-2 sm:py-6"
      style={{ backgroundImage: "radial-gradient(80% 60% at 50% 0%, var(--vc-surface), transparent 70%)" }}
    >
      <div
        data-voice-theme="claro"
        className="relative flex h-full w-full max-w-[420px] flex-col overflow-hidden bg-vc-bg text-vc-text sm:rounded-[34px] sm:border-[7px] sm:border-vc-text sm:shadow-[0_30px_70px_-28px_rgb(16_48_47/0.55)]"
      >
        {children}
      </div>
    </div>
  );
}

export function PhoneHeader({ clock }: { clock: string }) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-vc-line bg-vc-bg px-3 pb-2.5 pt-[calc(0.6rem+env(safe-area-inset-top))]">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-vc-surface text-vc-icon">
        <Building2 className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-display text-[16px] font-bold tracking-[-0.01em] text-vc-text">Citas · Hospital María Auxiliadora</p>
        <p className="truncate text-[12px] text-vc-text-2">Mensajes automáticos</p>
      </div>
      {clock && (
        <span className="shrink-0 rounded-full border border-vc-edge px-2.5 py-1 text-[13px] font-semibold tabular-nums text-vc-text" aria-label={`Hora de la demo ${clock}`}>
          {clock}
        </span>
      )}
    </header>
  );
}

export function PhoneEmpty() {
  return (
    <li className="mx-auto mt-10 flex max-w-[270px] flex-col items-center rounded-2xl bg-vc-bg p-5 text-center text-[14px] leading-snug text-vc-text-2 ring-1 ring-vc-line">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-vc-surface text-vc-icon">
        <BellRing className="size-5" aria-hidden />
      </span>
      Todavía no hay mensajes. Cuando el hospital envíe el recordatorio o le ofrezca un cupo, llegará aquí.
    </li>
  );
}

export function PhoneFooter() {
  return (
    <footer className="flex shrink-0 items-center gap-2 border-t border-vc-line bg-vc-bg px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2.5">
      <div className="flex-1 rounded-full bg-vc-surface px-4 py-3 text-[14px] text-vc-text-3">Responda con los botones del mensaje</div>
    </footer>
  );
}

export function PhoneLoading() {
  return (
    <>
      <DemoNotice>{DISCLAIMER}</DemoNotice>
      <div className="m-auto flex items-center gap-2.5 text-[15px] text-vc-text-2" role="status">
        <span className="app-typing text-vc-text-3" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        Cargando mensajes…
      </div>
    </>
  );
}

export function PhoneMissing() {
  return (
    <>
      <DemoNotice>{DISCLAIMER}</DemoNotice>
      <div className="vc-enter m-auto flex max-w-xs flex-col items-center p-6 text-center">
        <span style={{ "--i": 0 } as React.CSSProperties} className="grid size-14 place-items-center rounded-full bg-vc-surface text-vc-icon">
          <QrCode className="size-6" aria-hidden />
        </span>
        <p style={{ "--i": 1 } as React.CSSProperties} className="mt-4 text-pretty text-[15px] leading-snug text-vc-text-2">
          Este enlace no corresponde a ningún paciente de la demo. Vuelva a escanear el código QR.
        </p>
      </div>
    </>
  );
}
