"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, CheckCheck, Info, Volume2 } from "lucide-react";
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
    toast.success(okMic ? "Sonido y micrófono listos para las llamadas" : "Sonido listo. El micrófono se pedirá al contestar.");
  }

  if (missing) {
    return (
      <Shell>
        <div className="m-auto max-w-xs p-6 text-center text-muted">
          Este enlace no corresponde a ningún paciente de la demo. Vuelva a escanear el código QR.
        </div>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <div className="m-auto text-muted">Cargando mensajes…</div>
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
      <header className="flex items-center gap-3 border-b border-black/5 bg-brand px-3 pb-2.5 pt-[calc(0.6rem+env(safe-area-inset-top))] text-white">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15">
          <Building2 className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold">Citas · Hospital María Auxiliadora</p>
          <p className="truncate text-xs text-white/75">Mensajes automáticos</p>
        </div>
        <span className="rounded-md bg-white/15 px-2 py-1 text-xs tabular-nums">{state ? fmtMin(nowMin) : ""}</span>
      </header>
      <div className="flex items-start gap-2 bg-[#fff8e1] px-3 py-1.5 text-[11px] leading-snug text-[#6b4e00]">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <p>
          Teléfono simulado de <strong>{p.full_name}</strong>
          {p.caregiver_name ? ` (lo usa ${p.caregiver_name}, ${p.caregiver_relation})` : ""}. {DISCLAIMER}
        </p>
      </div>
      {!soundReady && (
        <button
          onClick={enableSound}
          className="press flex items-center justify-center gap-2 bg-[#10302f] px-3 py-2.5 text-sm font-semibold text-white"
        >
          <Volume2 className="size-4" aria-hidden /> Activar sonido y llamadas
        </button>
      )}

      <ol ref={listRef} className="flex-1 space-y-2 overflow-y-auto overscroll-contain bg-[#e9efed] px-3 py-3" aria-live="polite">
        {!data.messages.length && (
          <li className="mx-auto mt-10 max-w-[260px] rounded-xl bg-white/80 p-4 text-center text-sm text-muted">
            Todavía no hay mensajes. Cuando el hospital envíe el recordatorio o le ofrezca un cupo, llegará aquí.
          </li>
        )}
        {data.messages.map((m) => {
          const so = m.slot_offer_id ? data.slotOffers.find((o) => o.id === m.slot_offer_id) : undefined;
          const buttons = buttonsFor(m);
          return (
            <li key={m.id} className={`bubble-in flex ${m.direction === "entrante" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[86%]">
                <div
                  className={`rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm ${
                    m.direction === "entrante" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-white text-ink"
                  }`}
                >
                  <p className="whitespace-pre-line">{m.body}</p>
                  {m.answered_with && m.direction === "saliente" && (
                    <p className="mt-1 text-xs font-semibold text-brand">Respondió: {m.answered_with}</p>
                  )}
                  <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${m.direction === "entrante" ? "text-white/75" : "text-faint"}`}>
                    {fmtMin(m.demo_min)}
                    {m.direction === "entrante" && <CheckCheck className="size-3.5" aria-label="Enviado" />}
                  </p>
                </div>
                {m.kind === "oferta" && so?.state === "enviada" && (
                  <p className="mt-1 px-1 text-xs font-medium text-st-free">
                    Se cierra a las {fmtMin(so.closes_min)} ({Math.max(0, so.closes_min - nowMin)} min)
                  </p>
                )}
                {buttons && (
                  <div className="mt-1.5 grid gap-1.5">
                    {buttons.map((b) => (
                      <button
                        key={b.label}
                        disabled={busy === m.id}
                        onClick={() => send(b.body, m.id)}
                        className="press min-h-11 select-none rounded-xl border border-brand/20 bg-white px-3 text-[15px] font-semibold text-brand active:bg-brand-soft disabled:opacity-60"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <footer className="flex items-center gap-2 border-t border-black/5 bg-white px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2.5">
        <div className="flex-1 rounded-full bg-sunken px-4 py-2.5 text-sm text-faint">Responda con los botones del mensaje</div>
      </footer>

      {callActive && data.call && (
        <CallScreen key={data.call.id} call={data.call} auth={{ token }} name={p.first_name} onDone={load} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh items-stretch justify-center bg-[#cfd8d4] sm:py-6">
      <div className="relative flex h-full w-full max-w-[420px] flex-col overflow-hidden bg-white sm:rounded-[28px] sm:border-[6px] sm:border-ink sm:shadow-xl">
        {children}
      </div>
    </div>
  );
}
