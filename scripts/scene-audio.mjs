// Generates the AI lines of the two pitch scenes (insumos/AsistIA_Guion_Pitch_v7.pdf §3-§4) with ElevenLabs TTS,
// with the SAME voice, model and voice settings as the call agents (read live from the agent, never guessed).
// The audio is saved as it comes: no speed-up, no pause trimming, no edits (docs/escenas.md).
// Run: node --env-file=<.env.local> scripts/scene-audio.mjs   (needs ELEVENLABS_API_KEY; prints no secrets)
// API: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id} (https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
import { mkdir, readFile, writeFile } from "node:fs/promises";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("Falta ELEVENLABS_API_KEY");
  process.exit(1);
}
const API = "https://api.elevenlabs.io";
const lock = JSON.parse(await readFile(new URL("../voice/agents.lock.json", import.meta.url), "utf8"));
const agentId = lock["asistia-oferta"].agent_id;

const res = await fetch(`${API}/v1/convai/agents/${agentId}`, { headers: { "xi-api-key": KEY } });
if (!res.ok) throw new Error(`agent ${res.status}`);
const tts = (await res.json()).conversation_config.tts;
const voiceId = tts.voice_id;
const modelId = tts.model_id;
const settings = { stability: tts.stability, similarity_boost: tts.similarity_boost, speed: tts.speed };
console.log(`voz ${voiceId} · modelo ${modelId} · ajustes ${JSON.stringify(settings)}`);

// Exact script text (Hospital Mirasur, the fictitious hospital of the demo)
export const LINES = {
  "e1-oferta": "Buenos días, Tito. Le habla el asistente automatizado del Hospital Mirasur. Se liberó un cupo de oncología para mañana a las 9:00. ¿Desea tomarlo?",
  "e1-reservada": "Listo. Su cita quedó reservada para mañana a las 9:00.",
  "e2-motivo": "Hola, Tito. Antes de su cita, ¿qué molestia quiere consultar?",
  "e2-medicamentos": "¿Tomó algún medicamento? ¿Tiene alergias?",
  "e2-alarma": "¿Tiene fiebre, o la rodilla está muy hinchada o caliente?",
  "e2-cierre": "Gracias, Tito. Su médico lo recibirá con este resumen. Su consultorio va con 20 min de atraso: llegue entre 10:20 y 10:35.",
};

const only = process.argv.slice(2);
await mkdir(new URL("../public/escenas/", import.meta.url), { recursive: true });
for (const [id, text] of Object.entries(LINES)) {
  if (only.length && !only.includes(id)) continue;
  const r = await fetch(`${API}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: modelId, language_code: "es", voice_settings: settings, seed: 2026 }),
  });
  if (!r.ok) {
    console.error(id, r.status, (await r.text()).slice(0, 300));
    process.exitCode = 1;
    continue;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(new URL(`../public/escenas/${id}.mp3`, import.meta.url), buf);
  console.log(`${id}.mp3 · ${buf.length} bytes`);
}
