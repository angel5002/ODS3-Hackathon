// Staff actions (Admisión: panel, board, demo controls). Protected by PIN + role in src/proxy.ts.
// Every action calls one atomic Postgres function; the browser cannot run them.
import { fail, ok } from "@/lib/api";
import { messaging, voice } from "@/lib/channels";
import { demoNowMin } from "@/lib/labels";
import { broadcast, rpc, serverDb } from "@/lib/supabase/server";
import { scrubReason } from "@/lib/scrub";
import type { DemoState, Status } from "@/lib/types";
import { juryFail } from "@/lib/jury/server";
import { isJuryToken } from "@/lib/jury/tokens";
import { setNoisyRoom } from "@/lib/voice/sessions";

const STAFF = "Admisión";
const MANUAL: Status[] = ["confirmada", "liberada", "sin_respuesta", "derivada_a_persona", "pendiente"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim().slice(0, 60) : STAFF;
  try {
    switch (body.action) {
      // ---------------------------------------------------------------- E1 (kept)
      case "reminders": {
        const sent = await messaging.sendReminders();
        await broadcast("bulk");
        return ok({ sent });
      }
      case "last_reminders": {
        const sent = await rpc<number>("send_last_reminders");
        await broadcast("bulk");
        return ok({ sent });
      }
      case "agent_calls": {
        const calls = await rpc<number>("start_agent_calls");
        await broadcast("bulk");
        return ok({ calls });
      }
      case "status": {
        if (!MANUAL.includes(body.to)) return fail("invalid status");
        await rpc("staff_set_status", { p_appt: Number(body.appointmentId), p_to: body.to, p_actor: actor });
        return ok();
      }
      case "call":
        return ok({ callId: await voice.startCall(Number(body.appointmentId), actor) });
      case "tick": {
        // v5.1 (proposal 3.5): offers close and pass on with the assignment rule of /demo; then the rest of the tick
        const changes = (await rpc<number>("demo_tick_offers_v51")) + (await rpc<number>("demo_tick"));
        if (changes > 0) await broadcast("bulk");
        return ok({ changes });
      }
      case "advance":
        await rpc("advance_clock_v51", { p_minutes: Math.max(1, Math.min(1440, Number(body.minutes) || 60)) });
        await broadcast("bulk");
        return ok();
      case "reset": {
        const t0 = Date.now();
        await rpc("reset_demo");
        await broadcast("full");
        return ok({ ms: Date.now() - t0 });
      }
      case "settings":
        await saveSettings(body.settings ?? {});
        return ok();
      case "params":
        await saveParams(body.params ?? {});
        return ok();
      case "noisy_room": {
        // final day: "modo sala ruidosa" (push-to-talk on the phones' voice), settings_v51 'sala_ruidosa'
        if (typeof body.on !== "boolean") return fail("invalid on");
        return ok({ noisyRoom: await setNoisyRoom(body.on) });
      }
      case "assignment_rule": {
        // v5.1: the two assignment variants, stored as text (settings_v51)
        const rule = String(body.rule ?? "");
        if (rule !== "ventana_prioridad" && rule !== "primero_acepta") return fail("invalid rule");
        const { error } = await serverDb().from("settings_v51").update({ value: rule, updated_at: new Date().toISOString() }).eq("key", "regla_asignacion");
        if (error) throw new Error(error.message);
        await broadcast("bulk");
        return ok({ rule });
      }
      case "reveal":
        return ok(await reveal());

      // ---------------------------------------------------------------- RF-01 / RF-12: requests
      case "register": {
        const r = body.request ?? {};
        const res = await rpc<{ id: number; code: string }>("create_request", {
          p: { ...r, reason_text: scrubReason(String(r.reason_text ?? ""), String(r.display_name ?? "")), source: "ventanilla", actor },
        });
        return ok(res);
      }
      case "withdraw":
        await rpc("withdraw_request", {
          p_request: Number(body.requestId),
          p_reason: body.reason ?? null,
          p_text: body.text ?? null,
          p_user: actor,
        });
        return ok();

      // ---------------------------------------------------------------- RF-05 to RF-09: offers
      case "approve_offer":
        return ok({ offerId: await rpc<number>("approve_offer_v51", { p_slot: Number(body.slotId), p_actor: actor }) });
      case "approve_all": {
        const { data } = await serverDb().from("slots").select("id").eq("state", "libre");
        let sent = 0;
        for (const s of data ?? []) {
          const { error } = await serverDb().rpc("approve_offer_v51", { p_slot: s.id, p_actor: actor });
          if (!error) sent++;
        }
        return ok({ sent });
      }
      case "close_offer":
        return ok({ assignmentId: await rpc<number | null>("close_offer_v51", { p_offer: Number(body.offerId), p_actor: actor }) });

      // ---------------------------------------------------------------- pitch scene 1 (docs/escenas.md)
      case "escena1_preparar":
        // Tito: P1 assigned by a professional, appointment in 5 weeks (idempotent; needed again after a reset)
        return ok({ tito: await rpc("seed_escena1", { p_specialty: "Oncología Médica" }) });
      case "escena1_aprobar": {
        // the STAFF approves the offer of the released Oncología Médica slot (jury card "Carmen"); Tito's "sí" on
        // the call is his answer. Refused unless Tito is the first candidate of that slot.
        let slotId = Number(body.slotId) || null;
        if (!slotId) {
          const { data } = await serverDb().from("slots").select("id").eq("specialty", "Oncología Médica").eq("state", "libre").order("date").order("time");
          for (const s of data ?? []) {
            const p = await rpc<{ candidates?: { name?: string }[] }>("propose_candidates_v51", { p_slot: s.id });
            if (p?.candidates?.[0]?.name === "Tito Quispe Rojas") {
              slotId = s.id;
              break;
            }
          }
        }
        if (!slotId) return fail("escena1: no free slot where Tito is first", 409);
        // then "close_offer" with the returned offer_id assigns it (highest priority among those who accepted)
        const result = await rpc<{ offer_id: number }>("escena1_offer_to_tito", { p_slot: slotId, p_actor: actor, p_close: false });
        await broadcast("bulk");
        return ok({ result });
      }
      case "escena1_cerrar": {
        // the staff closes the open Oncología Médica offer now (close_offer_v51: highest priority among acceptors)
        const { data: open } = await serverDb()
          .from("slot_offers")
          .select("id,slot:slots!inner(specialty)")
          .eq("state", "enviada")
          .eq("slot.specialty", "Oncología Médica")
          .order("id", { ascending: false })
          .limit(1);
        if (!open?.length) return fail("escena1: no open offer", 409);
        const assignmentId = await rpc<number | null>("close_offer_v51", { p_offer: open[0].id, p_actor: actor });
        await broadcast("bulk");
        return ok({ assignmentId });
      }
      case "simulate_response":
        // "Usar simulado": the same flow without the live channel
        return ok({
          response: await rpc("respond_offer", {
            p_offer: Number(body.offerId),
            p_request: Number(body.requestId),
            p_response: body.accept ? "acepta" : "declina",
            p_channel: "simulado",
          }),
        });
      case "validate":
        return ok({
          state: await rpc("validate_assignment", {
            p_assignment: Number(body.assignmentId),
            p_ok: Boolean(body.ok),
            p_by: body.by === "persona" ? "persona" : "mensaje",
            p_role: body.role === "cuidador" ? "cuidador" : "paciente",
            p_actor: body.by === "persona" ? actor : "Usar simulado",
          }),
        });
      case "validation_call": {
        const { data: a } = await serverDb().from("assignments").select("id,request_id,offer_id").eq("id", Number(body.assignmentId)).single();
        if (!a) return fail("assignment not found", 404);
        return ok({
          callId: await rpc("start_request_call", { p_request: a.request_id, p_purpose: "validacion", p_offer: a.offer_id, p_assignment: a.id, p_session: null }),
        });
      }
      case "revert":
        await rpc("revert_assignment", { p_assignment: Number(body.assignmentId), p_reason: body.reason ?? "", p_actor: actor });
        return ok();
      case "review_reschedule":
        return ok({ appointmentId: await rpc("review_reschedule", { p_appt: Number(body.appointmentId), p_approve: Boolean(body.approve), p_actor: actor }) });

      // ---------------------------------------------------------------- RF-13: "En vivo"
      case "link_session": {
        const patient = body.patientId ? String(body.patientId) : null;
        const { error } = await serverDb().from("chat_sessions").update({ linked_patient_id: patient }).eq("id", String(body.sessionId));
        if (error) throw new Error(error.message);
        await rpc("hint", { p_kind: "live" });
        return ok();
      }
      case "test_message": {
        const sessionId = body.sessionId ? String(body.sessionId) : null;
        const patientId = body.patientId ? String(body.patientId) : null;
        if (sessionId) {
          await rpc("chat_system_message", { p_session: sessionId, p_body: "Mensaje de prueba del equipo de citas: si lo ve, el chat en vivo funciona." });
        } else if (patientId) {
          await rpc("deliver", { p_patient: patientId, p_request: null, p_body: "Mensaje de prueba del equipo de citas: si lo ve, este teléfono recibe los mensajes.", p_buttons: null, p_kind: "info" });
          await rpc("notify", { p_kind: "appt", p_appts: [], p_patients: [patientId] });
        }
        return ok();
      }
      case "test_call": {
        const callId = await rpc<number>("start_test_call", {
          p_session: body.sessionId ? String(body.sessionId) : null,
          p_patient: body.patientId ? String(body.patientId) : null,
        });
        return ok({ callId });
      }
      case "end_call":
        await voice.updateCall(Number(body.callId), "finalizada", "Terminada desde el panel (usar simulado)");
        return ok();

      // ---------------------------------------------------------------- E5 final: jury cards (docs/jurado.md)
      case "jury_prepare":
      case "jury_categorize":
      case "jury_offer":
      case "jury_close":
      case "jury_rearm":
        return await juryAction(body, actor);
      default:
        return fail("unknown action");
    }
  } catch (e) {
    return fail(e);
  }
}

// One click each in /demo. The person decides: categorizing calls the regulator's regulate(), the offer is
// approve_offer_v51() (candidates in priority order) and closing is close_offer_v51(). Errors in plain words.
async function juryAction(body: Record<string, unknown>, actor: string) {
  const token = isJuryToken(body.token) ? body.token : null;
  try {
    switch (body.action) {
      case "jury_prepare":
        return ok({ cards: await rpc<number>("jury_prepare") });
      case "jury_categorize": {
        if (!["P1", "P2", "P3", "P4"].includes(String(body.category))) return juryFail(new Error("invalid category"));
        let id = Number(body.requestId);
        if (!Number.isFinite(id) || id <= 0) {
          const { data } = await serverDb().from("requests").select("id").eq("code", String(body.code ?? "")).maybeSingle();
          if (!data) return juryFail(new Error("jury request missing"), 404);
          id = data.id;
        }
        await rpc("jury_categorize", { p_request: id, p_category: body.category, p_actor: body.actor ? actor : "Regulador" });
        return ok({ requestId: id });
      }
      case "jury_offer":
        if (!token) return juryFail(new Error("jury card not found"), 404);
        return ok({ offerId: await rpc<number>("jury_offer", { p_token: token, p_actor: actor }) });
      case "jury_close":
        if (!token) return juryFail(new Error("jury card not found"), 404);
        return ok({ assignmentId: await rpc<number | null>("jury_close", { p_token: token, p_actor: actor }) });
      case "jury_rearm": {
        // one card, or every printed card (body.all) — never the rest of the demo
        const tokens = token
          ? [token]
          : body.all
            ? ((await serverDb().from("jury_cards").select("token").eq("is_test", false).order("sort")).data ?? []).map((c) => c.token as string)
            : [];
        if (!tokens.length) return juryFail(new Error("jury card not found"), 404);
        for (const t of tokens) await rpc("jury_rearm", { p_token: t });
        await broadcast("bulk");
        return ok({ cards: tokens.length });
      }
    }
    return fail("unknown action");
  } catch (e) {
    return juryFail(e);
  }
}

async function saveParams(input: Record<string, unknown>) {
  const db = serverDb();
  const { data } = await db.from("params").select("key");
  const keys = new Set((data ?? []).map((p) => p.key));
  for (const [key, raw] of Object.entries(input)) {
    const value = Number(raw);
    if (!keys.has(key) || !Number.isFinite(value) || value < 0 || value > 1_000_000) continue;
    const { error } = await db.from("params").update({ value }).eq("key", key);
    if (error) throw new Error(error.message);
  }
  await broadcast("bulk");
}

async function saveSettings(input: Record<string, unknown>) {
  const db = serverDb();
  const { data } = await db.from("demo_state").select("*").eq("id", 1).single<DemoState>();
  if (!data) throw new Error("demo_state missing");
  const n = (k: string, min: number, max: number) => {
    const v = Number(input[k]);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
  };
  const patch: Partial<DemoState> = {
    threshold_high: n("threshold_high", 0.05, 0.99),
    threshold_mid: n("threshold_mid", 0.01, 0.98),
    call_list_pct: n("call_list_pct", 0.01, 0.5),
    reply_deadline_min: n("reply_deadline_min", 10, 600),
    offer_deadline_min: n("offer_deadline_min", 5, 240),
    speed: n("speed", 1, 600),
    simulate_others: typeof input.simulate_others === "boolean" ? input.simulate_others : undefined,
  };
  for (const k of Object.keys(patch) as (keyof DemoState)[]) if (patch[k] === undefined) delete patch[k];
  if (patch.threshold_high != null && patch.threshold_mid != null && patch.threshold_mid >= patch.threshold_high) {
    throw new Error("thresholds");
  }
  if (patch.speed != null && data.clock_started_at) {
    patch.clock_base_min = demoNowMin(data);
    patch.clock_started_at = new Date().toISOString();
  }
  const { error } = await db.from("demo_state").update({ ...patch, version: data.version + 1 }).eq("id", 1);
  if (error) throw new Error(error.message);
  await broadcast("bulk");
}

// RF-37: reveal what really happened on the demo day (the outcome stays hidden until now)
async function reveal() {
  const db = serverDb();
  const { data: state } = await db.from("demo_state").select("*").eq("id", 1).single<DemoState>();
  const appts: { id: number; risk: number; risk_rank: number; specialty: string }[] = [];
  const outcomes = new Map<number, boolean>();
  for (let from = 0; from < 3000; from += 1000) {
    const [a, o] = await Promise.all([
      db.from("appointments").select("id,risk,risk_rank,specialty").eq("is_base", true).range(from, from + 999),
      db.from("appointment_outcomes").select("appointment_id,no_show").range(from, from + 999),
    ]);
    appts.push(...(a.data ?? []));
    for (const r of o.data ?? []) outcomes.set(r.appointment_id, r.no_show);
  }
  const total = appts.length;
  const noShows = appts.filter((a) => outcomes.get(a.id)).length;
  const listSize = Math.floor(total * (state?.call_list_pct ?? 0.1));
  const inList = appts.filter((a) => a.risk_rank <= listSize);
  const listNoShows = inList.filter((a) => outcomes.get(a.id)).length;
  const high = appts.filter((a) => a.risk >= (state?.threshold_high ?? 1));
  const value = {
    total,
    no_shows: noShows,
    no_show_rate: noShows / total,
    list_size: listSize,
    list_no_shows: listNoShows,
    list_precision: listSize ? listNoShows / listSize : 0,
    list_capture: noShows ? listNoShows / noShows : 0,
    high_count: high.length,
    high_no_shows: high.filter((a) => outcomes.get(a.id)).length,
  };
  await db.from("metrics").upsert({ key: "reveal", value });
  await db.from("demo_state").update({ revealed: true }).eq("id", 1);
  await broadcast("bulk");
  return value;
}
