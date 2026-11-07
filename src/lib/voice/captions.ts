// Live captions of a voice call (E5, voice quality). Pure helpers + one small hook for the call screen's caption
// line (the UI track calls them; this file has no styling). The agent's full answer arrives as text when it
// starts speaking, so showing it at once and clamping it to two lines showed the BEGINNING of the answer cut
// with "…" while the voice was already further on. Use:
//   const shown = useRevealedCaption(lastCaption, agentSpeaking);   // words revealed at the pace of the voice
//   <div style="max-height: 2lh; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end">
//     {captionTail(shown)}                                          // the TAIL: the latest words, never the start
//   </div>
//   1. the agent's words are revealed at REVEAL_CHARS_PER_S (measured on this agent's TTS: 296 characters in
//      18.4 s of audio ≈ 16 per second) while it speaks, and in full when its turn ends;
//   2. captionTail keeps the end of the text from a whole word, with "…"; a box anchored to the bottom then
//      always shows the newest words, whatever the screen width. stripAudioTags removes "[Entendido]"-like tags.
import { useEffect, useRef, useState } from "react";

export const REVEAL_CHARS_PER_S = 16;
/** characters kept on screen: two lines of 18 px text on a wide screen; the box clips the rest from the top */
export const CAPTION_TAIL_CHARS = 140;
/** the agent's turn is over only after this long without speaking (pauses and buffer hiccups are shorter) */
export const TURN_END_MS = 700;
/** a caption that never gets audio (text answer, muted output) is shown in full after this */
export const NO_AUDIO_MS = 1500;

const AUDIO_TAG = /\[[\p{L}\p{M}\p{N}_\s]+\](?!\()/gu;

/** Removes expressive audio tags ("[Entendido]", "[laughs]") that the voice model may write. */
export function stripAudioTags(text: string) {
  return text.replace(AUDIO_TAG, "").replace(/\s{2,}/g, " ").replace(/^\s*[.,]\s*/, "").trim();
}

/** The part of `text` already spoken after `elapsedMs`, cut at the end of a word (never inside one). */
export function revealedPrefix(text: string, elapsedMs: number, charsPerSecond = REVEAL_CHARS_PER_S) {
  const n = Math.floor((Math.max(0, elapsedMs) / 1000) * charsPerSecond);
  if (n >= text.length) return text;
  if (n <= 0) return "";
  const space = text.lastIndexOf(" ", n);
  // inside the first word: wait until it is complete
  return space <= 0 ? "" : text.slice(0, space);
}

/** The last `maxChars` characters of `text`, starting at a word, with "…" when the start was dropped. */
export function captionTail(text: string, maxChars = CAPTION_TAIL_CHARS) {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(t.length - maxChars);
  const space = cut.indexOf(" ");
  const tail = space >= 0 && space < cut.length - 1 ? cut.slice(space + 1) : cut;
  return `…${tail}`;
}

/**
 * Text to show for the last caption: the agent's words revealed while it speaks (in full once its turn ends),
 * the person's words in full. Re-renders a few times per second only while revealing.
 */
export function useRevealedCaption(caption: { id: number; who: string; text: string } | null, agentSpeaking: boolean) {
  const [view, setView] = useState<{ id: number | null; text: string }>({ id: null, text: "" });
  const clock = useRef<{ id: number; at: number | null; created: number; quietSince: number | null; full: boolean }>({
    id: -1,
    at: null,
    created: 0,
    quietSince: null,
    full: false,
  });
  const id = caption?.id ?? null;
  const who = caption?.who ?? null;
  const raw = caption?.text ?? "";

  useEffect(() => {
    const c = clock.current;
    const now = performance.now();
    if (id !== null && c.id !== id) Object.assign(c, { id, at: null, created: now, quietSince: null, full: who !== "agente" });
    if (agentSpeaking) {
      if (c.at === null) c.at = now;
      c.quietSince = null;
    } else if (c.quietSince === null) c.quietSince = now;
    const text = stripAudioTags(raw);
    let iv: ReturnType<typeof setInterval> | null = null;
    const step = () => {
      if (id === null) return setView({ id: null, text: "" });
      const t = performance.now();
      if (!c.full && c.at !== null && c.quietSince !== null && t - c.quietSince >= TURN_END_MS) c.full = true;
      if (!c.full && c.at === null && t - c.created >= NO_AUDIO_MS) c.full = true;
      const shown = c.full ? text : c.at === null ? "" : revealedPrefix(text, t - c.at);
      setView((v) => (v.id === id && v.text === shown ? v : { id, text: shown }));
      if (c.full && iv) clearInterval(iv);
    };
    const first = setTimeout(step, 0);
    iv = setInterval(step, 200);
    return () => {
      clearTimeout(first);
      if (iv) clearInterval(iv);
    };
  }, [id, who, raw, agentSpeaking]);

  return view.id === id ? view.text : "";
}
