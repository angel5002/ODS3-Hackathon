// Opening timings of the 4 voice agents (E5, voice quality). READ-ONLY for the app's database: it opens one
// ElevenLabs conversation per agent over WebSocket (signed URL, like the browser), listens to the first
// message only and closes; no tool is called, nothing is written to Supabase.
//   node --env-file=<.env.local> scripts/dev/voice-opening.mjs [agent…]
// Per agent: ms from the socket opening to the first audio chunk (first word), the length of the opening and
// the moment its first question ends ("¿…?"): when the person can answer. Times inside the audio come from the
// character alignment of the audio events (or, without it, from the share of characters).
// Each run costs one short conversation (~10 s of audio) per agent.
import lock from "../../voice/agents.lock.json" with { type: "json" };

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Falta ELEVENLABS_API_KEY");
const only = process.argv.slice(2);
const VARS = {
  call_id: "0",
  token: "prueba",
  patient_name: "Valeria",
  role: "paciente",
  specialty: "Cardiología",
  slot_text: "el jueves 19 de octubre a las 10:20",
  deadline_text: "las 20:00",
};

async function measure(name, agentId) {
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers: { "xi-api-key": KEY } });
  if (!r.ok) throw new Error(`${name}: signed url ${r.status}`);
  const { signed_url } = await r.json();
  return new Promise((resolve) => {
    const ws = new WebSocket(signed_url);
    let tOpen = 0;
    let tFirstAudio = null;
    let audioMs = 0; // cumulative audio duration
    let rate = 16000;
    let text = "";
    let alignedChars = ""; // characters with their absolute audio time
    const charTimes = [];
    let lastAudioAt = 0;
    let conversationId = null;
    const done = (why) => {
      try {
        ws.close();
      } catch {}
      const at = (ch) => {
        const q = text.indexOf(ch);
        if (q < 0) return null;
        const qa = alignedChars.indexOf(ch);
        return qa >= 0 ? charTimes[qa] : Math.round((audioMs * (q + 1)) / Math.max(1, text.length));
      };
      const questionEndMs = at("?");
      const questionStartMs = at("¿");
      resolve({
        agent: name,
        conversation: conversationId,
        first_word_ms: tFirstAudio === null ? null : Math.round(tFirstAudio - tOpen),
        opening_audio_s: +(audioMs / 1000).toFixed(1),
        first_question_start_ms: questionStartMs === null || tFirstAudio === null ? null : Math.round(tFirstAudio - tOpen + questionStartMs),
        first_question_end_ms: questionEndMs === null || tFirstAudio === null ? null : Math.round(tFirstAudio - tOpen + questionEndMs),
        chars: text.length,
        aligned: alignedChars.length > 0,
        text,
        end: why,
      });
    };
    const timer = setTimeout(() => done("timeout"), 30000);
    ws.onopen = () => {
      tOpen = performance.now();
      ws.send(JSON.stringify({ type: "conversation_initiation_client_data", dynamic_variables: VARS }));
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "ping") ws.send(JSON.stringify({ type: "pong", event_id: m.ping_event.event_id }));
      if (m.type === "conversation_initiation_metadata") {
        conversationId = m.conversation_initiation_metadata_event.conversation_id;
        const f = m.conversation_initiation_metadata_event.agent_output_audio_format ?? "pcm_16000";
        rate = Number(f.split("_")[1]) || 16000;
      }
      if (m.type === "agent_response") text = m.agent_response_event.agent_response;
      if (m.type === "audio") {
        const now = performance.now();
        if (tFirstAudio === null) tFirstAudio = now;
        const a = m.audio_event;
        const al = a.alignment;
        if (al?.chars?.length) {
          al.chars.forEach((c, i) => {
            alignedChars += c;
            charTimes.push(Math.round(audioMs + (al.char_start_times_ms?.[i] ?? 0) + (al.char_durations_ms?.[i] ?? 0)));
          });
        }
        const bytes = Buffer.from(a.audio_base_64 ?? "", "base64").length;
        audioMs += (bytes / 2 / rate) * 1000;
        lastAudioAt = now;
      }
    };
    // the opening is over when the audio stops for 2.5 s after the text arrived
    const idle = setInterval(() => {
      if (tFirstAudio !== null && text && performance.now() - lastAudioAt > 2500) {
        clearInterval(idle);
        clearTimeout(timer);
        done("fin del primer mensaje");
      }
    }, 200);
    ws.onerror = () => done("error");
  });
}

const rows = [];
for (const [name, { agent_id }] of Object.entries(lock)) {
  if (only.length && !only.includes(name)) continue;
  rows.push(await measure(name, agent_id));
}
for (const r of rows) console.log(JSON.stringify(r));
