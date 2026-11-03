"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, CheckCheck, Info } from "lucide-react";
import { toast } from "sonner";
import { browserDb } from "@/lib/supabase/browser";
import { useDemoState, useHints, useNow, useSingleFlight } from "@/lib/realtime";
import { post } from "@/lib/post";
import { DISCLAIMER, demoNowMin, fmtMin } from "@/lib/labels";
import { isBroad, type Appointment, type Call, type Message, type Offer, type Patient } from "@/lib/types";
import { CallScreen } from "./CallScreen";

const REPLY_ID: Record<string, string> = {
  Confirmo: "confirma",
  "No podré asistir": "libera",
  "Hablar con una persona": "persona",
};

type Data = { patient: Patient; appts: Appointment[]; messages: Message[]; offers: Offer[]; call: Call | null };

export function PhoneApp({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const state = useDemoState();
  const now = useNow(1000);
  const listRef = useRef<HTMLOListElement>(null);

  const fetchData = useCallback(async () => {
    const db = browserDb();
    const { data: patient } = await db.from("patients").select("*").eq("token", token).maybeSingle<Patient>();
    if (!patient) {
      setMissing(true);
      return;
    }
    const [a, m, o, c] = await Promise.all([
      db.from("appointments").select("*").eq("patient_id", patient.id).order("id"),
      db.from("messages").select("*").eq("patient_id", patient.id).order("id"),
      db.from("offers").select("*").eq("patient_id", patient.id).order("id"),
      db.from("calls").select("*").eq("patient_id", patient.id).order("id", { ascending: false }).limit(1),
    ]);
    setData({
      patient,
      appts: (a.data ?? []) as Appointment[],
      messages: (m.data ?? []) as Message[],
      offers: (o.data ?? []) as Offer[],
      call: ((c.data ?? []) as Call[])[0] ?? null,
    });
  }, [token]);
  const load = useSingleFlight(fetchData);

  useEffect(() => {
     
    load();
  }, [load]);

  const patientId = data?.patient.id;
  useHints((h) => {
    if (isBroad(h) || (patientId && h.patients.includes(patientId))) load();
  });

  const count = data?.messages.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: count > 1 ? "smooth" : "auto" });
  }, [count]);

  // a new incoming call vibrates the phone (Android)
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
          {p.caregiver_name ? ` (lo usa ${p.caregiver_name}, ${p.caregiver_relation})` : ""}, número ficticio {p.phone}.{" "}
          {DISCLAIMER}
        </p>
      </div>

      <ol ref={listRef} className="flex-1 space-y-2 overflow-y-auto overscroll-contain bg-[#e9efed] px-3 py-3" aria-live="polite">
        {!data.messages.length && (
          <li className="mx-auto mt-10 max-w-[260px] rounded-xl bg-white/80 p-4 text-center text-sm text-muted">
            Todavía no hay mensajes. Cuando el hospital envíe el recordatorio o le ofrezca un cupo, llegará aquí.
          </li>
        )}
        {data.messages.map((m) => {
          const offer = m.offer_id ? data.offers.find((o) => o.id === m.offer_id) : undefined;
          const apptStatus = data.appts.find((x) => x.id === m.appointment_id)?.status;
          const isReminderOpen =
            m.kind === "recordatorio" && m.id === latestReminder?.id && !m.answered_with &&
            (apptStatus === "recordatorio_enviado" || apptStatus === "sin_respuesta");
          const isOfferOpen = m.kind === "oferta" && offer?.status === "enviada" && nowMin <= offer.expires_min;
          const buttons = m.direction === "saliente" && m.buttons && (isReminderOpen || isOfferOpen) ? m.buttons : null;
          return (
            <li key={m.id} className={`bubble-in flex ${m.direction === "entrante" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[86%]">
                <div
                  className={`rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm ${
                    m.direction === "entrante" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-white text-ink"
                  }`}
                >
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${m.direction === "entrante" ? "text-white/75" : "text-faint"}`}>
                    {fmtMin(m.demo_min)}
                    {m.direction === "entrante" && <CheckCheck className="size-3.5" aria-label="Enviado" />}
                  </p>
                </div>
                {isOfferOpen && offer && (
                  <p className="mt-1 px-1 text-xs font-medium text-st-free">
                    Quedan {Math.max(0, offer.expires_min - nowMin)} min para responder
                  </p>
                )}
                {buttons && (
                  <div className="mt-1.5 grid gap-1.5">
                    {buttons.map((b) => (
                      <button
                        key={b}
                        disabled={busy === m.id}
                        onClick={() =>
                          m.kind === "oferta"
                            ? send({ action: "offer", offerId: m.offer_id, accept: b === "Acepto" }, m.id)
                            : send({ action: "reply", appointmentId: m.appointment_id, reply: REPLY_ID[b] }, m.id)
                        }
                        className="press min-h-11 select-none rounded-xl border border-brand/20 bg-white px-3 text-[15px] font-semibold text-brand active:bg-brand-soft disabled:opacity-60"
                      >
                        {b}
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
        <CallScreen key={data.call.id} call={data.call} token={token} patient={p} onDone={load} />
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
