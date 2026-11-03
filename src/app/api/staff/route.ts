// Staff actions (panel, board, demo controls). Protected by the PIN in src/proxy.ts.
import { fail, ok } from "@/lib/api";
import { messaging, voice } from "@/lib/channels";
import { demoNowMin } from "@/lib/labels";
import { broadcast, rpc, serverDb } from "@/lib/supabase/server";
import type { DemoState, Status } from "@/lib/types";

const STAFF = "Personal de citas";
const MANUAL: Status[] = ["confirmada", "liberada", "sin_respuesta", "derivada_a_persona", "pendiente"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    switch (body.action) {
      case "reminders": {
        const sent = await messaging.sendReminders();
        await broadcast("bulk");
        return ok({ sent });
      }
      case "status": {
        if (!MANUAL.includes(body.to)) return fail("invalid status");
        await rpc("staff_set_status", { p_appt: Number(body.appointmentId), p_to: body.to, p_actor: STAFF });
        return ok();
      }
      case "call":
        return ok({ callId: await voice.startCall(Number(body.appointmentId), STAFF) });
      case "offer":
        return ok({ offerId: await messaging.sendSlotOffer(Number(body.slotId), Number(body.waitlistId), STAFF) });
      case "tick": {
        const changes = await rpc<number>("demo_tick");
        if (changes > 0) await broadcast("bulk");
        return ok({ changes });
      }
      case "advance":
        await rpc("advance_clock", { p_minutes: Math.max(1, Math.min(600, Number(body.minutes) || 60)) });
        await broadcast("bulk");
        return ok();
      case "reset":
        await rpc("reset_demo");
        await broadcast("full");
        return ok();
      case "settings":
        await saveSettings(body.settings ?? {});
        return ok();
      case "reveal":
        return ok(await reveal());
      default:
        return fail("unknown action");
    }
  } catch (e) {
    return fail(e);
  }
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
  // keep the clock continuous when the speed changes
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
