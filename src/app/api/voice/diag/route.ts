// Voice diagnostics sink (E5, hito 1): writes client voice events to the server log. Accepts only short
// event names and scalar values; nothing is stored in the database.
export const dynamic = "force-dynamic";

const SID = /^[a-z0-9]{4,16}$/;
const EVENT = /^[a-z_.]{1,40}$/;

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (raw.length > 2000) return new Response(null, { status: 413 });
  let body: { sid?: unknown; event?: unknown; data?: unknown; t?: unknown; path?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const sid = String(body.sid ?? "");
  const event = String(body.event ?? "");
  if (!SID.test(sid) || !EVENT.test(event)) return new Response(null, { status: 400 });
  const data: Record<string, string | number | boolean | null> = {};
  if (body.data && typeof body.data === "object") {
    for (const [k, v] of Object.entries(body.data as Record<string, unknown>).slice(0, 12)) {
      if (!/^[a-zA-Z_]{1,30}$/.test(k)) continue;
      if (typeof v === "number" || typeof v === "boolean" || v === null) data[k] = v;
      else if (typeof v === "string") data[k] = v.slice(0, 160);
    }
  }
  console.info(`[voz ${sid}] cliente ${event} ${JSON.stringify(data)} t=${Number(body.t) || 0} ${String(body.path ?? "").slice(0, 40)}`);
  return new Response(null, { status: 204 });
}
