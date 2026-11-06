// RF-13 router of the live web chat. Depending on the state of the conversation, a message goes to:
//   global words (PERSONA, SALIR) -> consent -> validation of an assignment -> answer to an offer
//   -> confirmation of a linked persona's appointment -> reschedule choice -> registration bot.
// Every branch calls the same Postgres functions as the panel and the simulated phones.
import { rpc, serverDb } from "@/lib/supabase/server";
import { webChat } from "@/lib/channels";
import { CONSENT, MENU, botStep, type BotState, type Reply } from "@/lib/bot/machine";
import { rules } from "@/lib/bot/interpret";
import type { loadSession } from "./session";

type Session = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

export const LIMITS = { perTenMinutes: 30, maxChars: 500 };

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export async function post(conversationId: number, reply: Reply, kind = "bot", ref?: Record<string, unknown>) {
  await serverDb().from("chat_messages").insert({
    conversation_id: conversationId,
    direction: "saliente",
    kind,
    body: reply.body,
    buttons: reply.buttons ?? null,
    ref: ref ?? null,
  });
}

export async function handleMessage(session: Session, conversationId: number, text: string): Promise<{ deleted?: boolean; replies?: Reply[]; meta?: Record<string, unknown> }> {
  const db = serverDb();
  const t = norm(text);

  // global words, at any moment
  if (t === "salir") {
    await db.from("chat_sessions").delete().eq("id", session.id);
    return { deleted: true, replies: [{ body: "Listo, borramos esta conversación." }] };
  }
  await db.from("chat_messages").insert({ conversation_id: conversationId, direction: "entrante", kind: "usuario", body: text });
  if (t === "persona" || t === "3. hablar con una persona") {
    await rpc("create_task", { p_type: "pide_persona", p_request: session.linked_request_id, p_appt: null, p_source: "chat", p_note: "Escribió PERSONA en el chat", p_session: session.id });
    return reply(conversationId, [{ body: "Una persona del equipo de citas le escribirá pronto." }]);
  }

  // consent first: until ACEPTO, only the consent text
  if (!session.consent_at) {
    if (/^acepto\b/.test(t)) {
      await db.from("chat_sessions").update({ consent_at: new Date().toISOString(), bot: { step: "menu", data: {} } }).eq("id", session.id);
      await rpc("hint", { p_kind: "live" });
      return reply(conversationId, [MENU]);
    }
    return reply(conversationId, [{ body: CONSENT, buttons: ["ACEPTO", "SALIR"] }]);
  }

  const reqs = (await rpc<number[]>("session_requests", { p_session: session.id })) ?? [];
  const bot = (session.bot ?? { step: "menu", data: {} }) as BotState;
  const inBot = !["menu", "done", "consent"].includes(bot.step);

  if (!inBot && reqs.length) {
    // 1. validation of an assignment ("Responda SÍ ... paciente o cuidador")
    const { data: pend } = await db
      .from("assignments")
      .select("id")
      .in("request_id", reqs)
      .eq("validation_state", "pendiente")
      .eq("reverted", false)
      .order("id", { ascending: false })
      .limit(1);
    if (pend?.length) {
      const yes = /^(si|sí|1)\b/.test(t) || t.startsWith("si,") || t.includes("confirmo");
      const no = /^(no|2)\b/.test(t) || t.includes("no puedo");
      if (yes || no) {
        await rpc("validate_assignment", {
          p_assignment: pend[0].id,
          p_ok: yes && !no,
          p_by: "mensaje",
          p_role: t.includes("cuidador") ? "cuidador" : "paciente",
          p_actor: `Chat «${session.alias}»`,
        });
        return { replies: [] };
      }
      return reply(conversationId, [{ body: "Para confirmar el cupo responda SÍ (y si es el paciente o su cuidador) o NO.", buttons: ["Sí, soy el paciente", "Sí, soy su cuidador", "No puedo"] }]);
    }
    // 2. answer to an open offer
    const { data: offers } = await db.from("slot_offers").select("id,candidate_ids").eq("state", "enviada").overlaps("candidate_ids", reqs);
    for (const o of offers ?? []) {
      const reqId = (o.candidate_ids as number[]).find((c) => reqs.includes(c))!;
      const { data: done } = await db.from("offer_responses").select("id").eq("offer_id", o.id).eq("request_id", reqId).maybeSingle();
      if (done) continue;
      const accept = /^(1|acepto|si|sí)\b/.test(t) || t.includes("lo quiero");
      const decline = /^(2|no)\b/.test(t) || t.includes("no puedo");
      if (accept || decline) {
        await webChat.receiveSlotOfferAnswer(o.id, reqId, accept, "chat");
        return { replies: [] };
      }
      return reply(conversationId, [{ body: "Responda 1 para aceptar el cupo o 2 para no. Si dice que no, conserva su lugar.", buttons: ["1. Acepto", "2. No puedo"] }]);
    }
  }

  if (!inBot && session.linked_patient_id) {
    // 3. reschedule choice of a linked persona
    const { data: res } = await db
      .from("messages")
      .select("appointment_id,buttons")
      .eq("patient_id", session.linked_patient_id)
      .eq("kind", "reprogramacion")
      .is("answered_with", null)
      .order("id", { ascending: false })
      .limit(1);
    if (res?.length && res[0].buttons) {
      const opts = (res[0].buttons as string[]).map((b) => [b, b] as [string, string]);
      const label = rules(text, "choice", opts);
      if (label) {
        await rpc("choose_reschedule", { p_appt: res[0].appointment_id, p_label: label, p_channel: "chat" });
        return { replies: [] };
      }
    }
    // 4. reminder of the linked persona's appointment (Carmen answers in the chat)
    const appt = await rpc<number | null>("chat_reminder_target", { p_session: session.id });
    if (appt) {
      const map: [RegExp, "confirma" | "libera" | "reprograma" | "persona"][] = [
        [/^(1|confirmo|si|sí)\b/, "confirma"],
        [/^(2|no podre|no podré|no puedo|no)\b/, "libera"],
        [/^(3|reprogramar|otra fecha)\b/, "reprograma"],
        [/^(4|hablar con una persona)\b/, "persona"],
      ];
      const hit = map.find(([re]) => re.test(t));
      if (hit) {
        await webChat.receiveReply(appt, hit[1], "chat");
        return { replies: [] };
      }
    }
  }

  // 5. the registration bot
  const r = await botStep(bot, text, { sessionId: session.id, linkedRequestId: session.linked_request_id });
  await db.from("chat_sessions").update({ bot: r.state }).eq("id", session.id);
  const out = await reply(conversationId, r.replies);
  return { ...out, meta: r.meta };
}

async function reply(conversationId: number, replies: Reply[]) {
  for (const r of replies) await post(conversationId, r);
  return { replies };
}
