"use client";

// Voice wave for the call screen (E5, hito 3): one continuous wavy line on <canvas> that follows the real
// frequency data of the person's microphone (levels.input) or of the agent's voice (levels.output).
// The getters are read inside requestAnimationFrame; React never re-renders per frame. The loop stops while
// the tab is hidden and once the line has settled after `active` turns false. With reduced motion the line
// keeps a fixed shape and only its height follows the level, a few times per second, without travelling.
import { useEffect, useRef } from "react";
import type { AudioLevels, VoiceWaveProps } from "@/lib/voice/contract";

type RGB = readonly [number, number, number];

/** Same colours as the caption labels, so the wave and the text tell the same story. */
export const WAVE_COLOR: Record<"agente" | "persona", string> = { agente: "#7ee0c9", persona: "#f6c177" };
const AGENT_RGB: RGB = [126, 224, 201];
const PERSON_RGB: RGB = [246, 193, 119];
const REST_RGB: RGB = [190, 214, 210];

const BANDS = 8;
/** bins used for the voice: with fftSize 256 at 48 kHz each bin is ~190 Hz, so 48 bins cover ~9 kHz */
const VOICE_BINS = 48;
const STEP_PX = 4;
const MAX_DPR = 2;

type Snapshot = {
  levels: AudioLevels | null;
  active: boolean;
  speaker: VoiceWaveProps["speaker"];
  reducedMotion: boolean;
};

function readBands(levels: AudioLevels | null, speaker: Snapshot["speaker"], out: Float32Array): boolean {
  out.fill(0);
  if (!levels || !speaker) return false;
  let data: Uint8Array | null = null;
  try {
    data = speaker === "agente" ? levels.output() : levels.input();
  } catch {
    data = null;
  }
  if (!data || data.length === 0) return false;
  const n = Math.min(VOICE_BINS, data.length - 1);
  const per = Math.max(1, Math.floor(n / BANDS));
  for (let b = 0; b < BANDS; b++) {
    let sum = 0;
    const from = 1 + b * per; // skip bin 0 (DC / hum)
    const to = Math.min(data.length, from + per);
    for (let i = from; i < to; i++) sum += data[i];
    // higher bands carry less energy in speech: lift them a little so the edges of the wave move too
    out[b] = Math.min(1, (sum / Math.max(1, to - from) / 255) * (1 + b * 0.12));
  }
  return true;
}

export function VoiceWave({ levels, active, speaker, reducedMotion = false, className = "" }: VoiceWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef<Snapshot>({ levels, active, speaker, reducedMotion });
  const wake = useRef<(() => void) | null>(null);

  // latest props for the loop, without restarting it
  useEffect(() => {
    props.current = { levels, active, speaker, reducedMotion };
    wake.current?.();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const target = new Float32Array(BANDS);
    const bands = new Float32Array(BANDS);
    let width = 0;
    let height = 0;
    let raf = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    let last = 0;
    let phase = 0;
    let mix = props.current.speaker === "persona" ? 0 : 1; // 1 = agent colour, 0 = person colour
    let rest = props.current.active ? 0 : 1; // 1 = resting colour

    const reduced = () => props.current.reducedMotion || mql.matches;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function colour(alpha: number) {
      const r = PERSON_RGB[0] + (AGENT_RGB[0] - PERSON_RGB[0]) * mix;
      const g = PERSON_RGB[1] + (AGENT_RGB[1] - PERSON_RGB[1]) * mix;
      const b = PERSON_RGB[2] + (AGENT_RGB[2] - PERSON_RGB[2]) * mix;
      const rr = Math.round(r + (REST_RGB[0] - r) * rest);
      const gg = Math.round(g + (REST_RGB[1] - g) * rest);
      const bb = Math.round(b + (REST_RGB[2] - b) * rest);
      return `rgba(${rr},${gg},${bb},${alpha})`;
    }

    /** energy at position u (0..1): low bands in the centre, high bands toward both ends */
    function energyAt(u: number) {
      const d = Math.abs(u - 0.5) * 2 * (BANDS - 1);
      const i = Math.floor(d);
      const f = d - i;
      const a = bands[i];
      const b = bands[Math.min(BANDS - 1, i + 1)];
      const s = (1 - Math.cos(f * Math.PI)) / 2;
      return a + (b - a) * s;
    }

    function stroke(t: number, gain: number, flip: number, offset: number, alpha: number, lineWidth: number, floor: number) {
      const mid = height / 2;
      const amp = height * 0.44;
      ctx!.beginPath();
      for (let x = 0; x <= width + STEP_PX; x += STEP_PX) {
        const px = Math.min(x, width);
        const u = px / width;
        const win = Math.sin(Math.PI * u) ** 2; // the ends rest on the centre line
        const e = Math.min(1, floor + energyAt(u) * 1.6);
        const shape =
          Math.sin(2 * Math.PI * 1.4 * u + t * 1.3 + offset) * 0.62 +
          Math.sin(2 * Math.PI * 3.1 * u - t * 2.2 + offset * 2) * 0.28 +
          Math.sin(2 * Math.PI * 5.3 * u + t * 3.4 - offset) * 0.1;
        const y = mid + amp * gain * e * win * shape * flip;
        if (x === 0) ctx!.moveTo(px, y);
        else ctx!.lineTo(px, y);
      }
      const grad = ctx!.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, colour(0));
      grad.addColorStop(0.18, colour(alpha));
      grad.addColorStop(0.82, colour(alpha));
      grad.addColorStop(1, colour(0));
      ctx!.strokeStyle = grad;
      ctx!.lineWidth = lineWidth;
      ctx!.stroke();
    }

    function draw(t: number, floor: number) {
      ctx!.clearRect(0, 0, width, height);
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      stroke(t, 0.5, -1, 1.9, 0.22, 1.5, floor);
      stroke(t, 0.75, 1, 0.8, 0.4, 1.5, floor);
      stroke(t, 1, 1, 0, 0.14, 9, floor); // soft halo, cheaper than shadowBlur
      stroke(t, 1, 1, 0, 1, 2.75, floor);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (timer) clearInterval(timer);
      timer = null;
    }

    function frame(now: number) {
      const p = props.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const hasData = p.active && readBands(p.levels, p.speaker, target);
      if (!p.active) target.fill(0);
      let level = 0;
      for (let i = 0; i < BANDS; i++) {
        const k = target[i] > bands[i] ? 0.35 : 0.08; // fast attack, slow release
        bands[i] += (target[i] - bands[i]) * k;
        level += bands[i];
      }
      level /= BANDS;
      mix += ((p.speaker === "persona" ? 0 : 1) - mix) * 0.12;
      rest += ((p.active ? 0 : 1) - rest) * 0.1;
      // with no data while active (fixed script, browser voice) the line breathes gently instead of lying dead
      const floor = p.active ? (hasData ? 0.05 : 0.09 + 0.05 * Math.sin(now / 700)) : 0;
      phase += dt * (0.8 + level * 3.2);
      draw(phase, floor);
      const settled = !p.active && level < 0.003 && rest > 0.98;
      if (settled) {
        bands.fill(0);
        draw(phase, 0);
        raf = 0;
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function staticTick() {
      const p = props.current;
      if (p.active) readBands(p.levels, p.speaker, bands);
      else bands.fill(0);
      mix = p.speaker === "persona" ? 0 : 1;
      rest = p.active ? 0 : 1;
      draw(0, p.active ? 0.06 : 0);
    }

    function start() {
      if (document.hidden) return stop();
      if (reduced()) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        staticTick();
        if (props.current.active && !timer) timer = setInterval(staticTick, 300);
        if (!props.current.active && timer) {
          clearInterval(timer);
          timer = null;
        }
        return;
      }
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    }

    const onVisibility = () => (document.hidden ? stop() : start());
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced() || !raf) {
        if (reduced()) staticTick();
        else draw(phase, props.current.active ? 0.05 : 0);
      }
    });

    resize();
    ro.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    mql.addEventListener("change", start);
    wake.current = start;
    start();

    return () => {
      wake.current = null;
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      mql.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={`block h-full w-full ${className}`} />;
}
