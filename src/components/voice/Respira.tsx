"use client";

// "Respira" (E5 stoic, v2 after testing on Android): the voice of the call as ONE horizontal wave, Siri-like, centred
// on the screen. Several thin lines oscillate vertically with the REAL audio (frequency data read inside the frame):
//   - "listen": almost flat, breathing slowly, and it follows the person's microphone (levels.input) in graphite
//     (--vc-person);
//   - "speak": wide, following the assistant's voice (levels.output) in the one accent (teal, --vc-agent);
//   - "think": a low, slow teal swell; "connect": a soft teal pulse; "ring": two short beats every 1.5 s;
//   - "muted" / "rest": a still, flat line (--vc-rest); "end": the wave flattens and fades.
// The state words live in the DOM under the wave (CallView), not in this canvas. The v1 circles are kept as a
// backup in RespiraCirculos.tsx.
// Budget (it runs during a live call and must never disturb the audio):
//   - <canvas> + requestAnimationFrame; React never re-renders per frame (props go through a ref);
//   - no allocations per frame once warm: typed arrays, colour strings cached per quantized mix, alpha via
//     globalAlpha; 4 polylines with one point every 4 px;
//   - DPR capped at 1.5 (measured: at 2 the p95 frame doubled on an emulated Pixel 7 with CPU 4x);
//   - the loop stops when nothing moves (rest, muted, finished transitions), runs at 30 fps for the slow modes
//     (ring, connect, think) and stops while the tab is hidden;
//   - prefers-reduced-motion: one static drawing per change of props, nothing moves.
import { useEffect, useRef } from "react";
import type { AudioLevels } from "@/lib/voice/contract";

export type RespiraMode = "ring" | "connect" | "listen" | "speak" | "think" | "muted" | "rest" | "end";

export type RespiraProps = {
  mode: RespiraMode;
  levels: AudioLevels | null;
  /** force the static drawing (prefers-reduced-motion is also read from the media query) */
  reducedMotion?: boolean;
  className?: string;
};

type RGB = [number, number, number];

const BANDS = 8;
const VOICE_BINS = 48;
const MAX_DPR = 1.5;
const STEP = 4; // px between points
const MIX = 16; // colour quantization steps
/** the lines, back to front: cycles across the wave, speed, phase, share of the amplitude, alpha, width */
const LINES = [
  { freq: 1.6, speed: 1.7, phase: 2.1, gain: 0.55, alpha: 0.22, width: 1.25 },
  { freq: 2.7, speed: 2.6, phase: 4.0, gain: 0.7, alpha: 0.35, width: 1.5 },
  { freq: 1.2, speed: 3.4, phase: 0.9, gain: 0.85, alpha: 0.55, width: 1.5 },
  { freq: 2.1, speed: 2.2, phase: 0, gain: 1, alpha: 1, width: 2.25 },
];
const TAU = Math.PI * 2;

type Snap = { mode: RespiraMode; levels: AudioLevels | null; reduced: boolean };

/** mean energy of the voice bins of one getter, 0..1 (square root: quiet speech still shows) + 8 bands */
function read(get: (() => Uint8Array | null) | undefined, bands: Float32Array): number {
  bands.fill(0);
  if (!get) return 0;
  let data: Uint8Array | null = null;
  try {
    data = get();
  } catch {
    data = null;
  }
  if (!data || data.length < 2) return 0;
  const n = Math.min(VOICE_BINS, data.length - 1);
  const per = Math.max(1, Math.floor(n / BANDS));
  let total = 0;
  for (let b = 0; b < BANDS; b++) {
    let sum = 0;
    const from = 1 + b * per;
    const to = Math.min(data.length, from + per);
    for (let i = from; i < to; i++) sum += data[i];
    const v = Math.min(1, (sum / Math.max(1, to - from) / 255) * (1 + b * 0.15));
    bands[b] = v;
    total += v;
  }
  return Math.min(1, Math.sqrt(total / BANDS) * 1.25);
}

function parse(cs: CSSStyleDeclaration, name: string, fallback: RGB): RGB {
  const m = cs.getPropertyValue(name).trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const isTeal = (m: RespiraMode) => m === "speak" || m === "think" || m === "connect" || m === "ring";

export function Respira({ mode, levels, reducedMotion = false, className = "" }: RespiraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snap = useRef<Snap>({ mode, levels, reduced: reducedMotion });
  const wake = useRef<(() => void) | null>(null);

  useEffect(() => {
    snap.current = { mode, levels, reduced: reducedMotion };
    wake.current?.();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

    const bands = new Float32Array(BANDS);
    const smooth = new Float32Array(BANDS);
    const cache = new Map<number, string>();
    let agent: RGB = [12, 107, 98];
    let person: RGB = [63, 72, 70];
    let rest: RGB = [124, 133, 131];
    let w = 1;
    let h = 1;
    let raf = 0;
    let last = 0;
    let lastDraw = 0;
    let t = 0;
    let prevMode: RespiraMode = snap.current.mode;
    let agentMix = isTeal(snap.current.mode) ? 1 : 0; // colour: teal share
    let personMix = snap.current.mode === "listen" ? 1 : 0; // colour: graphite share
    let amp = 0; // amplitude, share of the maximum
    let fade = 1;
    let level = 0;
    let kick = 0;

    const reduced = () => snap.current.reduced || mql.matches;

    function readTokens() {
      const cs = getComputedStyle(canvas!);
      agent = parse(cs, "--vc-agent", agent);
      person = parse(cs, "--vc-person", person);
      rest = parse(cs, "--vc-rest", rest);
      cache.clear();
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** the colour of the current mix, cached per quantized step (no string building once warm) */
    function colour() {
      const a = Math.round(agentMix * MIX);
      const p = Math.round(personMix * MIX);
      const key = a * (MIX + 1) + p;
      const hit = cache.get(key);
      if (hit) return hit;
      const fa = a / MIX;
      const fp = p / MIX;
      const c0 = Math.round(rest[0] + (agent[0] - rest[0]) * fa + (person[0] - rest[0]) * fp);
      const c1 = Math.round(rest[1] + (agent[1] - rest[1]) * fa + (person[1] - rest[1]) * fp);
      const c2 = Math.round(rest[2] + (agent[2] - rest[2]) * fa + (person[2] - rest[2]) * fp);
      const value = `rgb(${c0},${c1},${c2})`;
      cache.set(key, value);
      return value;
    }

    function draw() {
      ctx!.globalAlpha = 1;
      ctx!.clearRect(0, 0, w, h);
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      const span = Math.min(w * 0.9, 760);
      const x0 = (w - span) / 2;
      const cy = h / 2;
      const a = Math.min(h * 0.36, 150) * amp;
      ctx!.strokeStyle = colour();
      for (let j = 0; j < LINES.length; j++) {
        const L = LINES[j];
        ctx!.globalAlpha = L.alpha * fade;
        ctx!.lineWidth = L.width;
        ctx!.beginPath();
        for (let d = 0; d <= span + STEP; d += STEP) {
          const u = Math.min(1, d / span);
          // Siri-like envelope: the lines meet at both ends; the bands shape the middle (low bands in the centre)
          const pos = Math.abs(u - 0.5) * 2 * (BANDS - 1);
          const bi = Math.floor(pos);
          const lo = smooth[bi];
          const band = lo + (smooth[Math.min(BANDS - 1, bi + 1)] - lo) * (pos - bi); // no corners between bands
          const s = Math.sin(Math.PI * u);
          const env = s * s * (0.6 + 0.4 * Math.min(1, band * 1.8));
          const y = cy + a * L.gain * env * Math.sin(TAU * L.freq * u - t * L.speed + L.phase);
          if (d === 0) ctx!.moveTo(x0, y);
          else ctx!.lineTo(x0 + Math.min(d, span), y);
        }
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;
    }

    /** target amplitude (share of the maximum) of each mode */
    function target(m: RespiraMode, now: number) {
      switch (m) {
        case "speak":
          return 0.14 + 0.86 * level;
        case "listen":
          // almost flat, breathing (~6 s per breath); the person's voice lifts it
          return 0.035 + 0.02 * Math.sin(now / 950) + 0.55 * level;
        case "think":
          return 0.12 + 0.05 * Math.sin(now / 420);
        case "connect":
          return 0.07 + 0.08 * Math.pow(Math.max(0, Math.sin(now / 380)), 6);
        case "ring": {
          // two short beats every 1.5 s, like a phone ringing
          const c = (now / 1000) % 1.5;
          return 0.05 + 0.32 * (Math.exp(-((c - 0.15) ** 2) / 0.006) + Math.exp(-((c - 0.45) ** 2) / 0.006));
        }
        default:
          return 0;
      }
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function frame(now: number) {
      const s = snap.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const m = s.mode;
      if (m !== prevMode) {
        if (prevMode === "connect" && (m === "listen" || m === "speak" || m === "think" || m === "muted")) kick = 1; // the voice connected
        prevMode = m;
      }
      let lv = 0;
      if (m === "speak") lv = read(s.levels?.output, bands);
      else if (m === "listen") lv = read(s.levels?.input, bands);
      else bands.fill(0);
      level += (lv - level) * (lv > level ? 0.35 : 0.1);
      for (let i = 0; i < BANDS; i++) smooth[i] += (bands[i] - smooth[i]) * (bands[i] > smooth[i] ? 0.4 : 0.12);

      const teal = isTeal(m) ? 1 : 0;
      const grey = m === "listen" ? 1 : 0;
      const e = Math.min(1, dt * 6);
      agentMix += (teal - agentMix) * e;
      personMix += (grey - personMix) * e;
      kick *= Math.pow(0.05, dt);
      const goal = target(m, now) + kick * 0.3;
      amp += (goal - amp) * Math.min(1, dt * (goal > amp ? 14 : 6));
      const fadeGoal = m === "end" ? 0.35 : 1;
      fade += (fadeGoal - fade) * Math.min(1, dt * 4);
      t += dt * (1 + level * 1.5);

      const still =
        (m === "rest" || m === "muted" || m === "end") &&
        Math.abs(teal - agentMix) < 0.01 &&
        Math.abs(grey - personMix) < 0.01 &&
        amp < 0.002 &&
        kick < 0.005 &&
        Math.abs(fadeGoal - fade) < 0.01;
      const slow = m === "ring" || m === "connect" || m === "think";
      if (!slow || now - lastDraw > 32) {
        draw();
        lastDraw = now;
      }
      if (still) {
        amp = 0;
        draw();
        raf = 0;
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function staticDraw() {
      const m = snap.current.mode;
      agentMix = isTeal(m) ? 1 : 0;
      personMix = m === "listen" ? 1 : 0;
      // a still line; a modest still wave when someone speaks, so the state also reads without motion
      amp = m === "speak" ? 0.35 : m === "listen" ? 0.12 : m === "think" || m === "ring" || m === "connect" ? 0.08 : 0;
      fade = m === "end" ? 0.35 : 1;
      smooth.fill(0.5);
      t = 0;
      draw();
    }

    function start() {
      if (document.hidden) return stop();
      if (reduced()) {
        stop();
        staticDraw();
        return;
      }
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    }

    const onVisibility = () => (document.hidden ? stop() : start());
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced()) staticDraw();
      else {
        draw();
        start();
      }
    });

    readTokens();
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
