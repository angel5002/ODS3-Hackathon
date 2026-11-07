"use client";

// Browsers block sound (and the microphone prompt) until the person touches the screen. The phone and
// the chat show "Activar sonido y llamadas" once: it plays a silent sound, warms up speech synthesis and
// asks for the microphone, so a later incoming call can ring and the agent can listen.
let ctx: AudioContext | null = null;

function audioContext() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx ??= new AC();
  return ctx;
}

export async function unlockAudio({ microphone }: { microphone: boolean }) {
  try {
    const c = audioContext();
    await c.resume();
    const o = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.05);
    if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
  } catch {
    // sound stays locked: the call screen still works with text
  }
  if (!microphone || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

/** Ring tone for the incoming call screen (two short beeps; the caller repeats it). */
export function ring() {
  try {
    const c = audioContext();
    const t = c.currentTime;
    for (const start of [0, 0.45]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = 440;
      o.type = "sine";
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(0.25, t + start + 0.03);
      g.gain.linearRampToValueAtTime(0, t + start + 0.35);
      o.connect(g).connect(c.destination);
      o.start(t + start);
      o.stop(t + start + 0.4);
    }
  } catch {
    // no sound available
  }
}
