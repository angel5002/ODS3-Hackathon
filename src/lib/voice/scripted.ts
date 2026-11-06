"use client";

import { callTool, type AgentCallbacks, type AgentContext, type CallContext, type Option, type ToolName, type Turn, type VoiceAgent } from "./agent";

type Purpose = "confirmacion" | "oferta" | "validacion" | "registro" | "prueba";

/** Fixed-script agent: the fallback when the live voice is not available. Speaks with the browser's voice. */
export class ScriptedVoiceAgent implements VoiceAgent {
  transcript: Turn[] = [];
  private step: "identity" | "task" | "done" = "identity";
  private purpose: Purpose = "confirmacion";
  private c: CallContext | null = null;
  private ended = false;
  private role = "paciente";
  private lastOptions: Option[] = [];

  constructor(
    private ctx: AgentContext,
    private cb: AgentCallbacks,
    private speak = true,
  ) {}

  async start() {
    const { context, purpose } = await callTool<{ context: CallContext; purpose: Purpose }>(this.ctx, "get_context");
    this.c = context;
    this.purpose = purpose;
    const name = context.patient_name || "la persona de la cita";
    if (purpose === "prueba" || purpose === "registro") {
      this.say("Hola, le llama el asistente automático de citas, en una demostración. Esta es una llamada de prueba: si me escucha, todo funciona. Gracias.");
      return this.end("Llamada de prueba");
    }
    this.say(
      purpose === "oferta"
        ? `Hola, le llama el asistente de citas, en una demostración. ¿Hablo con ${name}? Le llamo porque se liberó un cupo de ${context.specialty}.`
        : `Hola, le llama el asistente automático de citas, en una demostración. Si prefiere hablar con una persona, solo dígalo. ¿Hablo con ${name} o con su cuidador?`,
    );
    this.options([
      { id: "yes", label: context.role === "cuidador" ? `Sí, soy quien cuida a ${name}` : "Sí, soy yo", tone: "primary" },
      { id: "carer", label: "Soy su cuidador" },
      { id: "human", label: "Quiero hablar con una persona" },
      { id: "wrong", label: "No, número equivocado" },
    ]);
  }

  async choose(id: string) {
    if (this.ended || !this.c) return;
    const label = this.lastOptions.find((o) => o.id === id)?.label ?? id;
    this.hear(label);
    if (id === "human") return this.finish("transfer_to_human");
    if (id === "wrong") {
      this.say("Disculpe la molestia. Que tenga un buen día.");
      return this.end("Número equivocado: no se dieron detalles");
    }
    const c = this.c;
    if (this.step === "identity") {
      this.step = "task";
      this.role = id === "carer" ? "cuidador" : "paciente";
      if (this.purpose === "confirmacion") {
        this.say(`Gracias. La cita de ${c.specialty} es ${c.slot_text}. ¿Podrá asistir?`);
        return this.options([
          { id: "confirm", label: "Sí, asistiré", tone: "primary" },
          { id: "release", label: "No podré ir" },
          { id: "reschedule", label: "Necesito otra fecha" },
          { id: "human", label: "Quiero hablar con una persona" },
        ]);
      }
      if (this.purpose === "oferta") {
        this.say(
          `El cupo es ${c.slot_text}. Lo ofrecemos a varios pacientes a la vez y se asigna por prioridad, no por quién responde primero. ` +
            `Tiene hasta ${c.deadline_text}. Si dice que no, conserva su lugar. ¿Lo quiere?`,
        );
        return this.options([
          { id: "accept", label: "Sí, lo quiero", tone: "primary" },
          { id: "decline", label: "No puedo" },
        ]);
      }
      this.say(`Gracias. Le asignamos el cupo de ${c.specialty}, ${c.slot_text}. ¿Podrá asistir?`);
      return this.options([
        { id: "validate", label: "Sí, confirmo", tone: "primary" },
        { id: "decline_assignment", label: "No puedo" },
      ]);
    }
    const map: Record<string, [ToolName, Record<string, unknown>?]> = {
      confirm: ["confirm_appointment"],
      release: ["release_slot"],
      reschedule: ["propose_reschedule", { option: 1 }],
      accept: ["respond_offer", { answer: "accept" }],
      decline: ["respond_offer", { answer: "decline" }],
      validate: ["confirm_assignment", { role: this.role }],
      decline_assignment: ["decline_assignment"],
    };
    const t = map[id];
    if (t) return this.finish(t[0], t[1]);
  }

  async hangUp() {
    if (this.ended) return;
    this.hear("(colgó)");
    this.end("El paciente colgó");
  }

  private options(o: Option[]) {
    this.lastOptions = o;
    this.cb.onOptions(o);
  }

  private async finish(tool: ToolName, args: Record<string, unknown> = {}) {
    this.cb.onOptions([]);
    try {
      const r = await callTool<{ say: string; done: string | null }>(this.ctx, tool, args);
      this.say(`${r.say} Que tenga un buen día.`);
      this.end(r.done ?? tool);
    } catch (e) {
      this.say("Disculpe, no pude registrar su respuesta. Una persona del equipo de citas le contactará.");
      this.end(`Error: ${(e as Error).message}`);
    }
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
