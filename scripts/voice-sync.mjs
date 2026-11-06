// npm run voice:sync  (RF-15) — creates or updates the 4 ElevenLabs agents and their server tools from
// voice/agents/*.json and voice/tools.json. Writes the agent ids (not secret) to voice/agents.lock.json.
// - voice: copied from the test agent "AsistIA prueba" (voice id, model and settings); fallback: search
//   ELEVENLABS_VOICE_NAME with the voices API.
// - tools: webhook tools at PUBLIC_BASE_URL/api/voice/tools/<name>, header x-asistia-secret from a workspace
//   secret holding ELEVENLABS_TOOL_SECRET; call_id and token come from dynamic variables.
// - privacy: private agents (signed URL only), no audio recording, max 4 minutes.
// Flags: --dry  print what would be sent, without calling the API.
// API reference: https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create (see INFORME_E4.md).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const DRY = process.argv.includes("--dry");
const KEY = process.env.ELEVENLABS_API_KEY;
const TOOL_SECRET = process.env.ELEVENLABS_TOOL_SECRET;
const BASE = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
if (!KEY || !TOOL_SECRET || !BASE) throw new Error("Faltan ELEVENLABS_API_KEY, ELEVENLABS_TOOL_SECRET o PUBLIC_BASE_URL en .env.local");

const API = "https://api.elevenlabs.io";
async function el(path, init = {}) {
  if (DRY && init.method && init.method !== "GET") {
    console.log("[dry]", init.method, path, init.body?.slice(0, 200));
    return {};
  }
  const res = await fetch(API + path, { ...init, headers: { "xi-api-key": KEY, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${text.slice(0, 400)}`);
  return data;
}

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const common = read("voice/agents/common.json");
const toolsDef = read("voice/tools.json");
const agentFiles = readdirSync(new URL("../voice/agents/", import.meta.url)).filter((f) => f.startsWith("asistia-"));

// 1. voice from the test agent
const { agents: all = [] } = await el("/v1/convai/agents?page_size=100");
const template = all.find((a) => a.name.trim().toLowerCase() === common.voice_template_agent.toLowerCase());
let tts;
if (template) {
  const t = await el(`/v1/convai/agents/${template.agent_id}`);
  const c = t.conversation_config?.tts ?? {};
  tts = { voice_id: c.voice_id, model_id: c.model_id, stability: c.stability, similarity_boost: c.similarity_boost, speed: c.speed };
  console.log(`Voz copiada de «${template.name}»: ${c.voice_id} (${c.model_id})`);
} else {
  const name = process.env.ELEVENLABS_VOICE_NAME;
  const { voices = [] } = await el(`/v2/voices?search=${encodeURIComponent(name)}&page_size=20`);
  const v = voices.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? voices[0];
  if (!v) throw new Error(`No se encontró la voz «${name}»`);
  tts = { voice_id: v.voice_id };
  console.log(`Voz por nombre: ${v.name} (${v.voice_id})`);
}

// 2. workspace secret for the tool header (name derived from the value: a new value creates a new secret)
const secretName = `asistia_tool_secret_${createHash("sha256").update(TOOL_SECRET).digest("hex").slice(0, 8)}`;
const secrets = await el("/v1/convai/secrets").catch(() => ({ secrets: [] }));
let secretId = (secrets.secrets ?? []).find((s) => s.name === secretName)?.secret_id;
if (!secretId) {
  const s = await el("/v1/convai/secrets", { method: "POST", body: JSON.stringify({ type: "new", name: secretName, value: TOOL_SECRET }) });
  secretId = s.secret_id;
  console.log("Secreto de herramientas creado:", secretName);
}

// 3. tools
const existingTools = (await el("/v1/convai/tools")).tools ?? [];
const toolIds = {};
for (const [name, def] of Object.entries(toolsDef)) {
  if (name.startsWith("_")) continue;
  const properties = {
    call_id: { type: "string", dynamic_variable: "call_id" },
    token: { type: "string", dynamic_variable: "token" },
  };
  for (const [p, spec] of Object.entries(def.params)) properties[p] = spec;
  const tool_config = {
    type: "webhook",
    name,
    description: def.description,
    response_timeout_secs: 10,
    api_schema: {
      url: `${BASE}/api/voice/tools/${name}`,
      method: "POST",
      content_type: "application/json",
      request_headers: { "x-asistia-secret": { secret_id: secretId } },
      request_body_schema: { type: "object", required: ["call_id", "token", ...(def.required ?? [])], properties },
    },
  };
  const found = existingTools.find((t) => t.tool_config?.name === name);
  if (found) {
    await el(`/v1/convai/tools/${found.id}`, { method: "PATCH", body: JSON.stringify({ tool_config }) });
    toolIds[name] = found.id;
  } else {
    const t = await el("/v1/convai/tools", { method: "POST", body: JSON.stringify({ tool_config }) });
    toolIds[name] = t.id;
  }
}
console.log("Herramientas:", Object.keys(toolIds).length);

// 4. agents
const lock = {};
for (const file of agentFiles) {
  const a = read(`voice/agents/${file}`);
  const body = {
    name: a.name,
    tags: ["asistia", "demo"],
    conversation_config: {
      agent: {
        first_message: a.first_message,
        language: common.language,
        dynamic_variables: { dynamic_variable_placeholders: common.dynamic_variables },
        prompt: {
          prompt: `${common.base_prompt}\n\n${a.task}`,
          llm: common.llm,
          temperature: 0.2,
          tool_ids: a.tools.map((t) => toolIds[t]).filter(Boolean),
          built_in_tools: { end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } } },
        },
      },
      tts,
      conversation: { max_duration_seconds: common.max_duration_seconds },
      turn: { silence_end_call_timeout: common.silence_end_call_timeout },
    },
    platform_settings: {
      auth: { enable_auth: true, allowlist: common.allowed_hosts.map((hostname) => ({ hostname })) },
      privacy: { record_voice: false, retention_days: 30 },
    },
  };
  const existing = all.find((x) => x.name === a.name);
  let id = existing?.agent_id;
  try {
    if (id) await el(`/v1/convai/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    else id = (await el("/v1/convai/agents/create", { method: "POST", body: JSON.stringify(body) })).agent_id;
  } catch (e) {
    // an LLM id the account does not accept: keep the test agent's model
    if (!/llm/i.test(e.message) || !template) throw e;
    const t = await el(`/v1/convai/agents/${template.agent_id}`);
    body.conversation_config.agent.prompt.llm = t.conversation_config.agent.prompt.llm;
    console.log(`LLM «${common.llm}» rechazado; se usa «${body.conversation_config.agent.prompt.llm}» del agente de prueba`);
    if (id) await el(`/v1/convai/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    else id = (await el("/v1/convai/agents/create", { method: "POST", body: JSON.stringify(body) })).agent_id;
  }
  lock[a.name] = { agent_id: id, purpose: a.purpose, llm: body.conversation_config.agent.prompt.llm, voice_id: tts.voice_id };
  console.log(`${existing ? "Actualizado" : "Creado"}: ${a.name} -> ${id}`);
}
if (!DRY) writeFileSync(new URL("../voice/agents.lock.json", import.meta.url), `${JSON.stringify(lock, null, 2)}\n`);
console.log("Listo. IDs en voice/agents.lock.json. Webhook posterior a la llamada:", `${BASE}/api/voice/post-call`);
