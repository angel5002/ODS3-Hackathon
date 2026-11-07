"use client";

// /dev/pantallas: the real presentational components of the app screens with static fictitious props, for
// screenshots and design review without a database. Nothing here posts or fetches: every action is a no-op
// and the form's submit is stopped before it reaches RegisterForm.
import type { FormEvent } from "react";
import { DISCLAIMER } from "@/lib/labels";
import type { DemoState, Message } from "@/lib/types";
import { RegisterForm } from "@/components/panel/WaitlistTab";
import { StaffHeader } from "@/components/StaffHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Bubble, DeadlineChip, DemoNotice, ReplyButton, ReplyButtons, SoundButton, ThreadList } from "@/components/chat/ChatParts";
import { ChatThreadView, ExpiredNotice, FormWrapper, Home, PedirCitaFrame, PedirCitaHeader, type Msg, type View } from "@/components/chat/PedirCita";
import { PhoneEmpty, PhoneFooter, PhoneHeader, PhoneLoading, PhoneMissing, Shell } from "@/components/phone/PhoneApp";
import { DemoControlsView, type QrCard } from "@/components/demo/DemoControls";
import { LiveSectionView, type LiveData } from "@/components/demo/LiveSection";
import { VoiceSessionsView } from "@/components/demo/VoiceSessionsCard";
import { ParamsView, type Param } from "@/components/demo/ParamsCard";

import type { Pantalla } from "./screens";

const noop = () => {};
const go = (v: View) => {
  window.location.search = `?p=${v === "voz" ? "inicio" : v}`;
};
const at = (hh: number, mm: number) => new Date(2023, 9, 16, hh, mm).toISOString();

const CHAT: Msg[] = [
  {
    id: 1,
    direction: "saliente",
    kind: "info",
    body: "Hola. Soy el asistente automático del hospital, en una demostración. Use un nombre ficticio y no comparta datos reales de salud. Escriba ACEPTO para continuar.",
    buttons: ["ACEPTO"],
    answered_with: "ACEPTO",
    created_at: at(9, 2),
  },
  { id: 2, direction: "entrante", kind: "respuesta", body: "ACEPTO", buttons: null, answered_with: null, created_at: at(9, 2) },
  {
    id: 3,
    direction: "saliente",
    kind: "info",
    body: "Gracias. ¿Para qué especialidad necesita la cita?",
    buttons: null,
    answered_with: null,
    created_at: at(9, 3),
  },
  { id: 4, direction: "entrante", kind: "respuesta", body: "Cardiología", buttons: null, answered_with: null, created_at: at(9, 3) },
  {
    id: 5,
    direction: "saliente",
    kind: "oferta",
    body: "Se liberó un cupo de Cardiología el jueves 19/10 a las 10:20. ¿Lo quiere?",
    buttons: ["Acepto", "No puedo"],
    answered_with: null,
    created_at: at(9, 40),
  },
];

const fakeMsg = (m: Partial<Message> & Pick<Message, "id" | "direction" | "kind" | "body">): Message => ({
  patient_id: "P0001",
  appointment_id: 1,
  offer_id: null,
  buttons: null,
  answered_with: null,
  demo_min: 540,
  created_at: at(9, 0),
  ...m,
});

const PHONE: Message[] = [
  fakeMsg({
    id: 1,
    direction: "saliente",
    kind: "recordatorio",
    body: "Hola, Rosa. Le recordamos su cita de Otorrinolaringología el jueves 19/10 a las 09:40. ¿Asistirá?",
    buttons: ["Confirmo", "No podré asistir", "Reprogramar", "Hablar con una persona"],
    answered_with: "Confirmo",
    demo_min: 545,
  }),
  fakeMsg({ id: 2, direction: "entrante", kind: "respuesta", body: "Confirmo", demo_min: 551 }),
  fakeMsg({ id: 3, direction: "saliente", kind: "info", body: "Gracias, Rosa. Su cita queda confirmada. Le esperamos.", demo_min: 551 }),
  fakeMsg({
    id: 4,
    direction: "saliente",
    kind: "oferta",
    body: "Se liberó un cupo de Medicina interna el jueves 19/10 a las 11:00. ¿Lo quiere?",
    buttons: ["Acepto", "No, gracias"],
    demo_min: 600,
  }),
];

const STATE: DemoState = {
  id: 1,
  day_label: "Lunes 16/10/2023",
  clock_base_min: 480,
  clock_started_at: null,
  speed: 60,
  reminders_sent_min: null,
  reply_deadline_min: 180,
  offer_deadline_min: 120,
  call_list_pct: 0.1,
  threshold_high: 0.42,
  threshold_mid: 0.25,
  simulate_others: true,
  revealed: false,
  version: 1,
  updated_at: at(8, 0),
};

const PARAMS: Param[] = [
  { key: "deadline_p1", value: 30, label: "Plazo máximo P1", unit: "días", sort: 1 },
  { key: "deadline_p2", value: 90, label: "Plazo máximo P2", unit: "días", sort: 2 },
  { key: "deadline_p3", value: 180, label: "Plazo máximo P3", unit: "días", sort: 3 },
  { key: "deadline_p4", value: 360, label: "Plazo máximo P4", unit: "días", sort: 4 },
  { key: "w_r", value: 0.75, label: "Peso del plazo consumido (R)", unit: "", sort: 5 },
  { key: "w_n", value: 0.15, label: "Peso de primera consulta (N)", unit: "", sort: 6 },
  { key: "w_e", value: 0.1, label: "Peso de atención preferente (E)", unit: "", sort: 7 },
  { key: "protected_pct", value: 0.2, label: "Cupos protegidos para P1 y P2 (próximos 3 días)", unit: "%", sort: 13 },
];
const PCT = new Set(["protected_pct"]);

function demoCards(origin: string, qrs: Record<string, string>): QrCard[] {
  const rows: [string, string, number, string, string, string | null, string | null, string][] = [
    ["rosa", "Rosa Mendoza Ríos", 58, "Riesgo alto: no responde el mensaje y recibe la llamada", "Cita de Otorrinolaringología, jueves 19/10 a las 09:40", null, null, "1"],
    ["valeria", "Valeria Paredes Soto", 1, "Cita pediátrica: responde su cuidador y confirma", "Cita de Cirugía pediátrica, jueves 19/10 a las 08:20", "Lucía Soto", "madre", "2"],
    ["carmen", "Carmen Villanueva Rojas", 47, "Avisa que no podrá ir y libera su cupo", "Cita de Cardiología, jueves 19/10 a las 10:20", null, null, "3"],
    ["julio", "Julio Ramos Cárdenas", 63, "Primero en la lista de espera: recibe la oferta del cupo", "Cardiología, lista de espera · sin cita", null, null, "4"],
    ["ana", "Ana Torres Huamán", 34, "Segunda en la lista de espera: recibe la oferta si el primero no puede", "Cardiología, lista de espera · sin cita", null, null, "5"],
  ];
  return rows.map(([token, full_name, age, demo_label, detail, caregiver_name, caregiver_relation, order]) => ({
    id: token,
    full_name,
    age,
    demo_label,
    detail,
    caregiver_name,
    caregiver_relation,
    demo_order: Number(order),
    url: `${origin}/t/${token}`,
    svg: qrs[token],
  }));
}

const LIVE: LiveData = {
  sessions: [
    {
      id: "s1",
      alias: "Participante 7",
      consent: true,
      linked_patient: null,
      linked_name: null,
      request_code: "S-0007",
      sound_ready: true,
      last_seen_at: new Date().toISOString(),
      created_at: at(9, 0),
      messages: 9,
    },
  ],
  phones: [
    { id: "P1", name: "Rosa Mendoza Ríos", token: "rosa", role: "alto_riesgo", label: "Riesgo alto", order: 1, last_seen_at: new Date().toISOString(), sound_ready: true },
    { id: "P2", name: "Valeria Paredes Soto", token: "valeria", role: "pediatrico", label: "Cita pediátrica", order: 2, last_seen_at: null, sound_ready: false },
    { id: "P3", name: "Carmen Villanueva Rojas", token: "carmen", role: "libera_cupo", label: "Libera su cupo", order: 3, last_seen_at: null, sound_ready: false },
  ],
  calls: [
    {
      id: 12,
      status: "finalizada",
      purpose: "confirmacion",
      agent: "asistia-confirmacion",
      provider: "simulado",
      name: "Rosa",
      summary: "Confirmó su cita.",
      result: null,
      actions: [{ at: at(9, 41), tool: "confirmar_cita", result: "ok" }],
      created_at: at(9, 40),
      answered_at: at(9, 40),
      ended_at: at(9, 42),
      duration_s: 74,
    },
  ],
};

/** No-op wrapper for the form: stops the submit before RegisterForm posts anything. */
function blockSubmit(e: FormEvent) {
  e.preventDefault();
  e.stopPropagation();
}

export function Pantallas({ screen, origin, qrs }: { screen: Pantalla; origin: string; qrs: Record<string, string> }) {
  if (screen === "demo") {
    return (
      <div className="flex min-h-dvh flex-col">
        <StaffHeader role="admision" />
        <div className="flex-1">
          <DemoControlsView
            cards={demoCards(origin, qrs)}
            assumptions={null}
            publicQr={{ url: `${origin}/pedir-cita`, svg: qrs.pedir }}
            state={STATE}
            now={0}
            busy=""
            run={noop}
            liveData={LIVE}
            voiceData={{ active: 0, queued: 0, sessions: [], events: [] }}
            live={<LiveSectionView data={LIVE} busy="" online={(iso) => Boolean(iso)} personas={LIVE.phones} act={noop} />}
            voice={<VoiceSessionsView data={{ active: 0, queued: 0, sessions: [], events: [] }} />}
            params={<ParamsView params={PARAMS} rule="ventana_prioridad" onRule={noop} edit={{}} setEdit={noop} busy={false} show={(p) => (PCT.has(p.key) ? String(p.value * 100) : String(p.value))} onSubmit={blockSubmit} />}
          />
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (screen.startsWith("telefono")) {
    return (
      <Shell>
        {screen === "telefono-cargando" && <PhoneLoading />}
        {screen === "telefono-enlace" && <PhoneMissing />}
        {(screen === "telefono" || screen === "telefono-vacio") && (
          <>
            <PhoneHeader clock="10:05" owner="Rosa Mendoza Ríos" />
            <ThreadList>
              <li className="flex justify-center">
                <SoundButton onEnable={noop} />
              </li>
              {screen === "telefono-vacio" ? (
                <PhoneEmpty />
              ) : (
                PHONE.map((m) => (
                  <Bubble
                    key={m.id}
                    mine={m.direction === "entrante"}
                    highlight={m.kind === "oferta" ? "Oferta de cupo" : null}
                    answered={m.direction === "saliente" ? m.answered_with : null}
                    sent={m.direction === "entrante"}
                    time={`${String(Math.floor((m.demo_min ?? 0) / 60)).padStart(2, "0")}:${String((m.demo_min ?? 0) % 60).padStart(2, "0")}`}
                    after={
                      m.kind === "oferta" ? (
                        <>
                          <DeadlineChip>Se cierra a las 12:00 (115 min)</DeadlineChip>
                          <ReplyButtons>
                            {(m.buttons ?? []).map((b) => (
                              <ReplyButton key={b} label={b} onPress={noop} />
                            ))}
                          </ReplyButtons>
                        </>
                      ) : null
                    }
                  >
                    {m.body}
                  </Bubble>
                ))
              )}
            </ThreadList>
            <PhoneFooter />
            <DemoNotice>{DISCLAIMER}</DemoNotice>
          </>
        )}
      </Shell>
    );
  }

  const view: View = screen === "formulario" ? "formulario" : screen.startsWith("chat") ? "chat" : "inicio";
  return (
    <PedirCitaFrame>
      <PedirCitaHeader view={view} subtitle="Usted aparece como «Participante 7»" onBack={() => go("inicio")} onWipe={noop} />
      {screen === "vencida" && <ExpiredNotice onRestart={noop} />}
      {screen === "inicio" && <Home onPick={go} sound={<SoundButton onEnable={noop} />} />}
      {screen === "chat" && (
        <ChatThreadView messages={CHAT} consent typing={false} quick={["Acepto", "No puedo"]} text="" onText={noop} onSend={noop} onSubmit={noop} />
      )}
      {screen === "chat-vacio" && (
        <ChatThreadView messages={[]} consent={false} typing={false} onText={noop} quick={null} text="" onSend={noop} onSubmit={noop} sound={<SoundButton onEnable={noop} />} />
      )}
      {screen === "formulario" && (
        <div className="contents" onSubmitCapture={blockSubmit}>
          <FormWrapper>
            <RegisterForm compact endpoint="/api/dev-preview-disabled" onDone={noop} />
          </FormWrapper>
        </div>
      )}
      <DemoNotice>{DISCLAIMER}</DemoNotice>
    </PedirCitaFrame>
  );
}
