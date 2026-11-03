"use client";

import { callTool, type AgentCallbacks, type AgentContext, type AppointmentInfo, type Option, type ToolName, type Turn, type VoiceAgent } from "./agent";

type Step = "identity" | "attendance" | "done";

/** Fixed-script agent (RF-19). Speaks with the browser's speech synthesis when available. */
export class ScriptedVoiceAgent implements VoiceAgent {
  transcript: Turn[] = [];
  private step: Step = "identity";
  private info: AppointmentInfo | null = null;
  private ended = false;

  constructor(
    private ctx: AgentContext,
    private cb: AgentCallbacks,
    private speak = true,
  ) {}

  async start() {
    const { appointment } = await callTool<{ appointment: AppointmentInfo }>(this.ctx, "get_appointment");
    this.info = appointment;
    const p = appointment.patient;
    const who = p.caregiver_name
      ? `¿Hablo con ${p.caregiver_relation === "padre" ? "el padre" : `la ${p.caregiver_relation}`} de ${p.first_name}?`
      : `¿Hablo con ${p.first_name}?`;
    this.say(
      `Hola, le habla el asistente automático del Hospital María Auxiliadora. Le llamo por una cita médica. ` +
        `Si en algún momento prefiere hablar con una persona, solo dígalo. ${who}`,
    );
    this.options([
      { id: "yes", label: p.caregiver_name ? `Sí, soy quien cuida a ${p.first_name}` : "Sí, soy yo", tone: "primary" },
      { id: "human", label: "Quiero hablar con una persona" },
      { id: "wrong", label: "No, número equivocado" },
    ]);
  }

  async choose(id: string) {
    if (this.ended || !this.info) return;
    const label = this.lastOptions.find((o) => o.id === id)?.label ?? id;
    this.hear(label);
    if (id === "human") return this.finish("transfer_to_human", "Le comunico con una persona del equipo de citas. Le contactarán en unos minutos. Gracias.");
    if (id === "wrong") {
      this.say("Disculpe la molestia. Que tenga un buen día.");
      return this.end("Número equivocado: no se dieron detalles de la cita");
    }
    if (this.step === "identity" && id === "yes") {
      const i = this.info;
      const whose = i.patient.caregiver_name ? `La cita de ${i.patient.first_name}` : "Su cita";
      this.step = "attendance";
      this.say(
        `Gracias. ${whose} de ${i.specialty} es mañana, ${i.day_label}, a las ${i.time}${i.remote ? ", por teleconsulta" : ""}. ¿Podrá asistir?`,
      );
      return this.options([
        { id: "confirm", label: "Sí, asistiré", tone: "primary" },
        { id: "release", label: "No podré ir" },
        { id: "reschedule", label: "Necesito otra fecha" },
        { id: "human", label: "Quiero hablar con una persona" },
      ]);
    }
    if (this.step === "attendance") {
      if (id === "confirm") return this.finish("confirm_appointment", "Perfecto, la cita queda confirmada. Recuerde llegar 20 minutos antes a admisión. Que tenga un buen día.");
      if (id === "release") return this.finish("release_slot", "Entendido, gracias por avisar. El cupo pasará a otro paciente que lo espera. Si necesita una nueva cita, puede pedirla en admisión.");
      if (id === "reschedule") return this.finish("request_reschedule", "Entendido. Registré su pedido de otra fecha y el equipo de citas le llamará. El cupo de mañana pasará a otro paciente.");
    }
  }

  async hangUp() {
    if (this.ended) return;
    this.hear("(colgó)");
    this.end("El paciente colgó");
  }

  private lastOptions: Option[] = [];
  private options(o: Option[]) {
    this.lastOptions = o;
    this.cb.onOptions(o);
  }

  private async finish(tool: ToolName, closing: string) {
    this.cb.onOptions([]);
    await callTool(this.ctx, tool);
    this.say(closing);
    const summary: Record<string, string> = {
      confirm_appointment: "Confirmó la cita",
      release_slot: "Liberó el cupo",
      request_reschedule: "Pidió otra fecha",
      transfer_to_human: "Pidió hablar con una persona",
    };
    this.end(summary[tool] ?? tool);
  }

  private end(result: string) {
    this.ended = true;
    this.step = "done";
    this.cb.onOptions([]);
    this.cb.onEnd(result);
  }

  private say(text: string) {
    const t: Turn = { who: "agente", text };
    this.transcript.push(t);
    this.cb.onTurn(t);
    if (this.speak && typeof window !== "undefined" && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      u.voice = voices.find((v) => v.lang === "es-PE") ?? voices.find((v) => v.lang.startsWith("es-US")) ?? voices.find((v) => v.lang.startsWith("es")) ?? null;
      u.lang = u.voice?.lang ?? "es-ES";
      u.rate = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  }

  private hear(text: string) {
    const t: Turn = { who: "paciente", text };
    this.transcript.push(t);
    this.cb.onTurn(t);
  }
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
