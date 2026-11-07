// Read-only: ElevenLabs plan of this workspace and how much of it is used (no keys printed).
// Usage: node scripts/dev/voice-plan.mjs
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.log("ELEVENLABS_API_KEY vacía: no se puede consultar el plan");
  process.exit(1);
}
const get = async (path) => {
  const r = await fetch(`https://api.elevenlabs.io${path}`, { headers: { "xi-api-key": key } });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

const sub = await get("/v1/user/subscription");
console.log("suscripción", sub.status);
if (sub.status === 200) {
  const d = sub.data;
  const pick = ["tier", "status", "character_count", "character_limit", "next_character_count_reset_unix", "max_voice_add_edits"];
  for (const k of pick) if (k in d) console.log(" ", k, d[k]);
  for (const [k, v] of Object.entries(d)) if (/concurr/i.test(k)) console.log(" ", k, JSON.stringify(v));
}

// Conversations still marked as running on ElevenLabs' side (calls that never closed).
const conv = await get("/v1/convai/conversations?page_size=30");
console.log("conversaciones", conv.status);
if (conv.status === 200) {
  const list = conv.data.conversations ?? [];
  const byStatus = {};
  for (const c of list) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  console.log("  últimas", list.length, JSON.stringify(byStatus));
  for (const c of list.slice(0, 10)) {
    console.log("  ", new Date(c.start_time_unix_secs * 1000).toISOString(), c.status, `${c.call_duration_secs ?? "?"} s`, c.agent_name ?? "", c.call_successful ?? "");
  }
}
