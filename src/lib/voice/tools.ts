// Tools of the voice agents (RF-15). ONE implementation for every agent: the ElevenLabs server tools
// (/api/voice/tools/[tool]) and the fixed-script fallback (/api/agent) call these same functions, which
// call the same Postgres functions as the panel. No rule is duplicated here.
// Every tool is scoped to the call in progress and answers with a short sentence that is easy to say aloud.
import { rpc, serverDb } from "@/lib/supabase/server";
import { scrubReason } from "@/lib/scrub";
import { SPECIALTIES, dateEs } from "@/lib/labels";

export type CallRow = {
  id: number;
  status: string;
  purpose: "confirmacion" | "oferta" | "validacion" | "registro" | "prueba";
  appointment_id: number | null;
  patient_id: string | null;
  request_id: number | null;
  offer_id: number | null;
  assignment_id: number | null;
  chat_session_id: string | null;
  actions: { at: string; tool: string; result: string }[] | null;
};

export const TOOLS_BY_PURPOSE: Record<CallRow["purpose"], string[]> = {
  confirmacion: ["get_appointment", "confirm_appointment", "release_slot", "get_available_slots", "propose_reschedule", "transfer_to_human", "flag_alarm"],
  oferta: ["get_offer", "respond_offer", "transfer_to_human", "flag_alarm"],
  validacion: ["get_assignment", "confirm_assignment", "decline_assignment", "transfer_to_human", "flag_alarm"],
  registro: ["list_specialties", "register_request", "flag_alarm", "transfer_to_human"],
  prueba: ["transfer_to_human", "flag_alarm"],
};

type Result = { say: string; data?: Record<string, unknown>; done?: string };

/** A test call ("Probar llamada") uses the confirmation agent, which may ask for the appointment: without a
 *  real one these tools answered 403 and the agent improvised "un problema técnico" (call 4536). They now
 *  answer one sentence and change nothing. */
const TEST_CALL_TOOLS = new Set(
  [...TOOLS_BY_PURPOSE.confirmacion, ...TOOLS_BY_PURPOSE.oferta, ...TOOLS_BY_PURPOSE.validacion].filter((t) => !TOOLS_BY_PURPOSE.prueba.includes(t)),
);
export const TEST_CALL_SAY = "Esta es una llamada de prueba: no hay una cita real y no se registró ningún cambio.";

/** The answer of a test call to a tool of a real task, or null when the tool runs normally. */
export function testCallAnswer(purpose: CallRow["purpose"], tool: string): Result | null {
  return purpose === "prueba" && TEST_CALL_TOOLS.has(tool) ? { say: TEST_CALL_SAY } : null;
}

function timeEs(t: string) {
  return t.replace(/^0/, "");
}

async function log(call: CallRow, tool: string, result: string) {
  const actions = [...(call.actions ?? []), { at: new Date().toISOString(), tool, result }].slice(-30);
  await serverDb().from("calls").update({ actions }).eq("id", call.id);
  call.actions = actions;
  await rpc("hint", { p_kind: "call" });
}

export async function loadCall(callId: number) {
  const { data } = await serverDb()
    .from("calls")
    .select("id,status,purpose,appointment_id,patient_id,request_id,offer_id,assignment_id,chat_session_id,actions")
    .eq("id", callId)
    .maybeSingle<CallRow>();
  return data;
}

/** Context for the agent's dynamic variables (names are fictitious). */
export async function callContext(call: CallRow) {
  const db = serverDb();
  const ctx: Record<string, string> = { call_id: String(call.id), patient_name: "", role: "paciente", specialty: "", slot_text: "", deadline_text: "" };
  if (call.appointment_id) {
    const { data: a } = await db
      .from("appointments")
      .select("specialty,date,time,remote,patient:patients(first_name,caregiver_name,caregiver_relation)")
      .eq("id", call.appointment_id)
      .single();
    const p = (a?.patient ?? null) as unknown as { first_name: string; caregiver_name: string | null; caregiver_relation: string | null } | null;
    ctx.patient_name = p?.first_name ?? "";
    ctx.role = p?.caregiver_name ? "cuidador" : "paciente";
    ctx.specialty = a?.specialty ?? "";
    ctx.slot_text = a ? `el ${dateEs(a.date)} a las ${timeEs(a.time)}${a.remote ? ", por teleconsulta" : ""}` : "";
  }
  if (!ctx.patient_name && call.patient_id) {
    // test calls and calls without an appointment: the character's first name (fictitious)
    const { data: p } = await db.from("patients").select("first_name,caregiver_name").eq("id", call.patient_id).maybeSingle();
    ctx.patient_name = p?.first_name ?? "";
    if (p?.caregiver_name) ctx.role = "cuidador";
  }
  if (call.request_id) {
    const detail = await rpc<{ request: { specialty: string } | null; person: { name: string } | null }>("staff_request_detail", { p_request: call.request_id });
    ctx.patient_name = detail.person?.name.split(" ")[0] ?? ctx.patient_name;
    ctx.specialty = detail.request?.specialty ?? ctx.specialty;
  }
  if (call.offer_id) {
    const { data: o } = await db.from("slot_offers").select("closes_min,slot:slots(date,time,specialty)").eq("id", call.offer_id).single();
    const s = o?.slot as unknown as { date: string; time: string; specialty: string } | null;
    if (s) ctx.slot_text = `el ${dateEs(s.date)} a las ${timeEs(s.time)}`;
    if (o) ctx.deadline_text = `las ${String(Math.floor((o.closes_min % 1440) / 60)).padStart(2, "0")}:${String(o.closes_min % 60).padStart(2, "0")}`;
  }
  if (call.assignment_id) {
    const { data: a } = await db.from("assignments").select("slot:slots(date,time,specialty)").eq("id", call.assignment_id).single();
    const s = a?.slot as unknown as { date: string; time: string; specialty: string } | null;
    if (s) {
      ctx.slot_text = `el ${dateEs(s.date)} a las ${timeEs(s.time)}`;
      ctx.specialty = s.specialty;
    }
  }
  return ctx;
}

export async function runTool(call: CallRow, tool: string, args: Record<string, unknown>): Promise<Result> {
  const test = testCallAnswer(call.purpose, tool);
  if (test) {
    await log(call, tool, test.say);
    return test;
  }
  if (!TOOLS_BY_PURPOSE[call.purpose]?.includes(tool)) throw new Error("tool not allowed");
  if (!["sonando", "en_curso"].includes(call.status)) throw new Error("call ended");
  const r = await exec(call, tool, args);
  await log(call, tool, r.say);
  return r;
}

async function exec(call: CallRow, tool: string, args: Record<string, unknown>): Promise<Result> {
  const db = serverDb();
  switch (tool) {
    // ---------------------------------------------------------------- confirmation (48 h)
    case "get_appointment": {
      const ctx = await callContext(call);
      return { say: `La cita es de ${ctx.specialty}, ${ctx.slot_text}.`, data: ctx };
    }
    case "confirm_appointment":
      await rpc("patient_reply", { p_appt: call.appointment_id, p_reply: "confirma", p_channel: "voz", p_actor: "Asistente automático", p_detail: "Confirmó en la llamada con el asistente automático" });
      return { say: "Listo, la cita quedó confirmada.", done: "Confirmó la cita" };
    case "release_slot":
      await rpc("patient_reply", { p_appt: call.appointment_id, p_reply: "libera", p_channel: "voz", p_actor: "Asistente automático", p_detail: "Avisó en la llamada que no podrá asistir; el cupo queda libre" });
      return { say: "Gracias por avisar: su cupo se ofrecerá a otro paciente.", done: "Liberó el cupo" };
    case "get_available_slots": {
      const opts = await rpc<{ label: string }[]>("reschedule_options", { p_appt: call.appointment_id });
      return { say: `Hay estas fechas libres: ${opts.map((o, i) => `${i + 1}, ${o.label}`).join("; ")}.`, data: { options: opts.map((o) => o.label) } };
    }
    case "propose_reschedule": {
      const opts = await rpc<{ label: string }[]>("reschedule_options", { p_appt: call.appointment_id });
      const n = Number(args.option ?? args.index ?? 1);
      const label = String(args.label ?? opts[Math.max(0, Math.min(opts.length - 1, n - 1))]?.label ?? "");
      await rpc("choose_reschedule", { p_appt: call.appointment_id, p_label: label, p_channel: "voz" });
      return { say: `Registré el pedido para el ${label}. Queda pendiente de que el equipo de citas lo valide; mientras tanto su cita actual se mantiene.`, done: "Pidió reprogramar" };
    }
    // ---------------------------------------------------------------- offer
    case "get_offer": {
      const ctx = await callContext(call);
      return { say: `Se liberó un cupo de ${ctx.specialty} ${ctx.slot_text}. Se ofrece a varios pacientes a la vez y se asigna por prioridad. Tiene hasta ${ctx.deadline_text}.`, data: ctx };
    }
    case "respond_offer": {
      const accept = ["accept", "acepta", "si", "sí", "true", "yes"].includes(String(args.answer ?? args.response ?? args.accept ?? "").toLowerCase());
      await rpc("respond_offer", { p_offer: call.offer_id, p_request: call.request_id, p_response: accept ? "acepta" : "declina", p_channel: "voz" });
      return accept
        ? { say: "Registré que acepta. Al cerrar el plazo le confirmamos si el cupo es suyo.", done: "Aceptó la oferta" }
        : { say: "Entendido. Conserva su lugar en la lista.", done: "No aceptó la oferta" };
    }
    // ---------------------------------------------------------------- validation
    case "get_assignment": {
      const ctx = await callContext(call);
      return { say: `El cupo asignado es de ${ctx.specialty}, ${ctx.slot_text}.`, data: ctx };
    }
    case "confirm_assignment": {
      const role = String(args.role ?? "paciente").toLowerCase().includes("cuid") ? "cuidador" : "paciente";
      await rpc("validate_assignment", { p_assignment: call.assignment_id, p_ok: true, p_by: "agente", p_role: role, p_actor: "Asistente automático" });
      return { say: "Listo, su cita quedó registrada. Le enviaremos un recordatorio 72 horas antes.", done: "Validó la asignación" };
    }
    case "decline_assignment":
      await rpc("validate_assignment", { p_assignment: call.assignment_id, p_ok: false, p_by: "agente", p_role: "paciente", p_actor: "Asistente automático" });
      return { say: "Entendido. Conserva su lugar en la lista.", done: "No pudo tomar el cupo" };
    // ---------------------------------------------------------------- registration
    case "list_specialties":
      return { say: `Puedo registrar: ${SPECIALTIES.slice(0, 8).join(", ")}. Si no sabe, diga "no sé".`, data: { specialties: SPECIALTIES } };
    case "register_request": {
      const name = String(args.patient_name ?? args.name ?? "").trim().slice(0, 60) || "Paciente sin nombre";
      const specialty = matchSpecialty(String(args.specialty ?? "")) ?? "Por definir";
      const res = await rpc<{ id: number; code: string }>("create_request", {
        p: {
          display_name: name,
          doc_type: String(args.document_type ?? "sin_documento"),
          age: Number(args.age ?? 0),
          specialty,
          referral: Boolean(args.referral),
          reason_text: scrubReason(String(args.reason ?? ""), name),
          pregnant: Boolean(args.pregnant),
          disability: Boolean(args.disability),
          preferred_channel: String(args.channel ?? "").includes("llam") ? "llamada" : "chat",
          short_notice_ok: Boolean(args.short_notice_ok),
          source: "voz",
          chat_session_id: call.chat_session_id,
          actor: "Asistente de voz",
        },
      });
      // closing: what was registered, who reviews it, how we notify, what to do if it gets worse (no time promised)
      const byCall = String(args.channel ?? "").includes("llam");
      if (call.chat_session_id) {
        await rpc("chat_system_message", {
          p_session: call.chat_session_id,
          p_body:
            `Registramos por llamada su solicitud ${res.code}; todavía no es una cita. Un profesional la revisará y le avisaremos ` +
            `${byCall ? "con una llamada" : "por este chat"} cuando haya un cupo (si deja de responder, no pierde su lugar); si empeora, acuda a emergencia o llame al 106.`,
        });
      }
      const digits = res.code.replace(/\D/g, "").split("").join(", ");
      return {
        say:
          `Listo. Su número de solicitud es S, ${digits}; todavía no es una cita. Un profesional la revisará y le avisaremos ` +
          `${byCall ? "con una llamada" : "por el chat"} cuando haya un cupo. Si empeora, acuda a emergencia o llame al 106.`,
        data: res,
        done: `Registró la solicitud ${res.code}`,
      };
    }
    // ---------------------------------------------------------------- common
    case "transfer_to_human":
      await rpc("create_task", {
        p_type: "pide_persona",
        p_request: call.request_id,
        p_appt: call.appointment_id,
        p_source: "agente",
        p_note: String(args.reason ?? "Pidió hablar con una persona durante la llamada").slice(0, 200),
        p_session: call.chat_session_id,
        p_assignment: call.assignment_id,
      });
      if (call.appointment_id) {
        await rpc("patient_reply", { p_appt: call.appointment_id, p_reply: "persona", p_channel: "voz", p_actor: "Asistente automático", p_detail: "Pidió hablar con una persona durante la llamada" }).catch(() => {});
      }
      return { say: "Listo: una persona del equipo de citas le contactará pronto. Gracias por llamar.", done: "Pidió hablar con una persona" };
    case "flag_alarm": {
      // what the person said goes to the staff task (never a diagnosis: their words, scrubbed)
      const said = scrubReason(String(args.symptom ?? "").trim()).slice(0, 160);
      if (call.request_id) {
        await rpc("derive_emergency", { p_request: call.request_id, p_actor: "Asistente automático", p_source: "agente" });
        if (said) {
          await db
            .from("staff_tasks")
            .update({ note: `Signos de alarma (llamada). La persona dijo: «${said}». Confirmar que acudió a emergencia.`.slice(0, 300) })
            .eq("request_id", call.request_id)
            .eq("type", "alarma");
        }
      } else {
        await rpc("create_task", { p_type: "alarma", p_request: null, p_appt: call.appointment_id, p_source: "agente", p_note: (said ? `Signos de alarma en la llamada. La persona dijo: «${said}»` : "Signos de alarma mencionados en la llamada").slice(0, 200), p_session: call.chat_session_id });
      }
      return {
        say: "No espere una cita: acuda a la emergencia más cercana o llame al 106. Ya avisamos a una persona del equipo de citas, que revisará su caso y le contactará.",
        done: "Signos de alarma: derivado a emergencia",
      };
    }
    default:
      void db;
      throw new Error("unknown tool");
  }
}

export function matchSpecialty(text: string) {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (!t) return null;
  return (
    SPECIALTIES.find((s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === t) ??
    SPECIALTIES.find((s) => {
      const n = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      return n.startsWith(t.slice(0, 6)) || t.includes(n.slice(0, 6));
    }) ??
    null
  );
}
