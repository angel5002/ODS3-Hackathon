// Admisión reads (PIN + role "admision", see src/proxy.ts). From v4 the browser no longer reads the tables
// with the publishable key: every screen asks here and the server decides what each role may see.
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { rpc, serverDb } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ROW_SELECT =
  "id,patient_id,specialty,date,time,risk,risk_rank,status,status_at,status_channel,origin,replaces_id,reassigned_to_id,remote,is_base,updated_at,uses_messaging,request_id," +
  "patient:patients(full_name,short_name,age,caregiver_name,caregiver_relation,demo_role,token)";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view");
  const db = serverDb();
  try {
    switch (view) {
      case "appointments": {
        // demo day only (future appointments live in the request detail)
        const since = url.searchParams.get("since");
        const ids = url.searchParams.get("ids");
        const rows: unknown[] = [];
        for (let from = 0; from < 4000; from += 1000) {
          let q = db.from("appointments").select(ROW_SELECT).eq("date", "2023-10-19").order("id").range(from, from + 999);
          if (since) q = q.gt("updated_at", since);
          if (ids) q = q.in("id", ids.split(",").map(Number).filter(Number.isFinite));
          const { data, error } = await q;
          if (error) throw new Error(error.message);
          rows.push(...(data ?? []));
          if ((data?.length ?? 0) < 1000) break;
        }
        return NextResponse.json({ rows });
      }
      case "events": {
        const after = Number(url.searchParams.get("after") ?? 0);
        const ids = (url.searchParams.get("ids") ?? "").split(",").map(Number).filter(Number.isFinite);
        if (url.searchParams.get("last")) {
          const { data } = await db.from("events").select("id").order("id", { ascending: false }).limit(1);
          return NextResponse.json({ last: data?.[0]?.id ?? 0 });
        }
        const { data } = await db
          .from("events")
          .select("id,appointment_id,from_status,to_status,channel,patient:patients(short_name),appointment:appointments(specialty,time,origin)")
          .in("appointment_id", ids)
          .gt("id", after)
          .in("channel", ["mensaje", "voz", "chat"])
          .eq("kind", "estado")
          .neq("actor", "Paciente (simulado)")
          .order("id");
        return NextResponse.json({ events: data ?? [] });
      }
      case "detail": {
        const id = Number(url.searchParams.get("id"));
        const { data: a } = await db.from("appointments").select("*").eq("id", id).single();
        if (!a) return fail("not found", 404);
        const related = [a.id, a.replaces_id, a.reassigned_to_id].filter((x) => x != null);
        const [p, ev, msg, call, slot, newAppt] = await Promise.all([
          db.from("patients").select("*").eq("id", a.patient_id).maybeSingle(),
          db.from("events").select("*").in("appointment_id", related).order("id", { ascending: false }).limit(60),
          db.from("messages").select("*").eq("patient_id", a.patient_id).order("id").limit(80),
          db.from("calls").select("*").eq("appointment_id", id).order("id", { ascending: false }).limit(1),
          db.from("slots").select("id,state").eq("source_appointment_id", id).maybeSingle(),
          a.reassigned_to_id
            ? db.from("appointments").select("id,patient:patients(full_name)").eq("id", a.reassigned_to_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        return NextResponse.json({
          appt: a,
          patient: p.data,
          events: ev.data ?? [],
          messages: msg.data ?? [],
          call: call.data?.[0] ?? null,
          slot: slot.data,
          newAppt: newAppt.data,
        });
      }
      case "requests":
        return NextResponse.json({ requests: await rpc("staff_requests") });
      case "request":
        return NextResponse.json(await rpc("staff_request_detail", { p_request: Number(url.searchParams.get("id")) }));
      case "slots": {
        const [slots, feed] = await Promise.all([
          rpc("staff_slots"),
          db
            .from("events")
            .select("id,kind,detail,actor,demo_min,appointment_id")
            .in("kind", ["oferta", "asignacion", "validacion", "domino", "reversion"])
            .order("id", { ascending: false })
            .limit(20),
        ]);
        return NextResponse.json({ slots, feed: feed.data ?? [] });
      }
      case "validations":
        return NextResponse.json(await rpc("staff_validations"));
      case "board": {
        const [board, lite, calls, metrics] = await Promise.all([
          rpc("board_v4"),
          db.from("appointments").select("status").eq("is_base", true).range(0, 1999),
          db.from("calls").select("id", { count: "exact", head: true }),
          db.from("metrics").select("key,value").in("key", ["historical", "model_card", "reveal", "summary"]),
        ]);
        return NextResponse.json({ board, statuses: lite.data ?? [], calls: calls.count ?? 0, metrics: metrics.data ?? [] });
      }
      case "live":
        return NextResponse.json(await rpc("live_overview"));
      case "params": {
        const { data } = await db.from("params").select("*").order("sort");
        return NextResponse.json({ params: data ?? [] });
      }
      default:
        return fail("unknown view");
    }
  } catch (e) {
    return fail(e, 500);
  }
}
