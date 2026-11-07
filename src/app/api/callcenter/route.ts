// Call center (role "callcenter" or "admision"): human tasks only (RF-16).
import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { rpc } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [tasks, board] = await Promise.all([rpc("callcenter_tasks"), rpc<Record<string, unknown>>("board_v4")]);
    return NextResponse.json({
      tasks,
      load: { total: board.tasks_today, closed: board.tasks_closed, agent: board.agent_derivations, byType: board.tasks_by_type },
    });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "close") {
      await rpc("close_task", {
        p_task: Number(body.taskId),
        p_outcome: String(body.outcome ?? ""),
        p_actor: "Call center",
        p_note: body.note ?? null,
      });
      return ok();
    }
    if (body.action === "take") {
      return ok();
    }
    return fail("unknown action");
  } catch (e) {
    return fail(e);
  }
}
