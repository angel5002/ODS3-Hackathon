"use client";

// BACKUP (E5 stoic v1, replaced by the single wave in Respira.tsx after testing on Android; kept per the rule
// "do not delete implementations that work"). "Respira" circles: the visual of the call screen, after Stoic's "Breathe" screen. Concentric circles around a
// dark disc (the disc itself is DOM, drawn by CallView; this canvas draws everything around it):
//   - the assistant speaks ("speak"): horizontal waves leave both sides of the disc and follow levels.output(),
//     like Siri's, in the one accent (teal, --vc-agent), and a thin teal ring hugs the disc;
//   - the person speaks ("listen"): the rings pulse outward with levels.input(), in graphite (--vc-person);
//   - "ring" (incoming call): slow ripples leave the disc; "connect": the rings breathe and one ripple leaves;
//     "think": a short teal arc turns around the disc; "end": the rings fold into the disc; "rest"/"muted": still.
// Budget (it runs during a live call and must never disturb the audio):
//   - <canvas> + requestAnimationFrame; React never re-renders per frame (props go through a ref);
//   - no allocations per frame once warm: typed arrays, colours parsed once into strings, alpha via globalAlpha;
//   - DPR capped at 1.5 (measured: at 2 the p95 frame doubled on an emulated Pixel 7 with CPU 4x); ~10 arcs and
//     6 short polylines per frame;
//   - the loop stops when nothing moves (rest, muted, finished transitions), runs at 30 fps for the slow modes
//     (ring, connect, think) and stops while the tab is hidden;
//   - prefers-reduced-motion: one static drawing per change of props, nothing moves.
// Colours come from the --vc-* tokens of the nearest [data-voice-theme] (src/app/globals.css).
import { useEffect, useRef, type RefObject } from "react";
import type { AudioLevels } from "@/lib/voice/contract";

export type RespiraCirculosMode = "ring" | "connect" | "listen" | "speak" | "think" | "muted" | "rest" | "end";

export type RespiraCirculosProps = {
  mode: RespiraCirculosMode;
  levels: AudioLevels | null;
  /** the DOM disc in the centre: its size sets the radius of every ring (one source of truth: the CSS) */
  discRef: RefObject<HTMLElement | null>;
  /** force the static drawing (prefers-reduced-motion is also read from the media query) */
  reducedMotion?: boolean;
  className?: string;
};

const RINGS = 4;
const GAP = 0.27; // ring spacing, as a share of the disc radius
const RING_ALPHA = [0.5, 0.32, 0.2, 0.11];
const BANDS = 8;
const VOICE_BINS = 48;
const MAX_DPR = 1.5;
const STEP = 3; // px between wave points
const WAVES = [
  { alpha: 1, width: 2, freq: 2.2, speed: 5.2, phase: 0, gain: 1 },
  { alpha: 0.42, width: 1.5, freq: 3.1, speed: 3.9, phase: 1.9, gain: 0.72 },
  { alpha: 0.22, width: 1.25, freq: 1.5, speed: 6.4, phase: 3.7, gain: 0.55 },
];
const TAU = Math.PI * 2;

type Snap = { mode: RespiraCirculosMode; levels: AudioLevels | null; reduced: boolean };

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

function colour(cs: CSSStyleDeclaration, name: string, fallback: string) {
  const v = cs.getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(v) || /^rgb/i.test(v) ? v : fallback;
}

export function RespiraCirculos({ mode, levels, discRef, reducedMotion = false, className = "" }: RespiraCirculosProps) {
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
    let agent = "#0c6b62";
    let person = "#3f4846";
    let rest = "#7c8583";
    let w = 1;
    let h = 1;
    let R = 60;
    let raf = 0;
    let last = 0;
    let lastDraw = 0;
    let t = 0;
    // eased mixes (0..1): how much of each mode is on screen
    let speakMix = 0;
    let listenMix = 0;
    let thinkMix = 0;
    let connectMix = 0;
    let ringMix = 0;
    let endMix = 0;
    let level = 0;
    let kick = 0;
    let prevMode: RespiraCirculosMode = snap.current.mode;
    let arc = 0;

    const reduced = () => snap.current.reduced || mql.matches;

    function readTokens() {
      const cs = getComputedStyle(canvas!);
      agent = colour(cs, "--vc-agent", agent);
      person = colour(cs, "--vc-person", person);
      rest = colour(cs, "--vc-rest", rest);
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const disc = discRef.current;
      R = disc ? disc.offsetWidth / 2 : Math.min(w, h) * 0.18;
    }

    function circle(r: number, stroke: string, alpha: number, width: number) {
      if (alpha <= 0.004 || r <= 0) return;
      ctx!.globalAlpha = Math.min(1, alpha);
      ctx!.strokeStyle = stroke;
      ctx!.lineWidth = width;
      ctx!.beginPath();
      ctx!.arc(w / 2, h / 2, r, 0, TAU);
      ctx!.stroke();
    }

    /** one wave on one side: from the disc edge outward, amplitude tapering to zero at both ends */
    function wave(side: number, j: number, amp: number) {
      const cfg = WAVES[j];
      const cx = w / 2;
      const cy = h / 2;
      const start = R + 6;
      const span = Math.max(24, Math.min(w / 2 - start - 6, R * 2.9));
      ctx!.globalAlpha = cfg.alpha;
      ctx!.lineWidth = cfg.width;
      ctx!.beginPath();
      for (let d = 0; d <= span + STEP; d += STEP) {
        const u = Math.min(1, d / span);
        // band by distance: the low bands near the disc, the high ones toward the edge
        const bi = Math.min(BANDS - 1, Math.floor(u * BANDS));
        const env = Math.sin(Math.PI * u) * (1 - 0.3 * u) * (0.55 + 0.45 * smooth[bi] * 1.6);
        const y = cy + amp * cfg.gain * env * Math.sin(TAU * cfg.freq * u - t * cfg.speed + cfg.phase);
        const x = cx + side * (start + Math.min(d, span));
        if (d === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.strokeStyle = agent;
      ctx!.stroke();
    }

    function draw() {
      ctx!.globalAlpha = 1;
      ctx!.clearRect(0, 0, w, h);
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      const gap = R * GAP;
      const fold = 1 - 0.9 * endMix;

      // the concentric rings: resting colour, crossfaded to the person's colour while they speak
      for (let k = 0; k < RINGS; k++) {
        const breathe = Math.sin(t * 2.4 - k * 0.55) * gap * 0.14 * (connectMix + thinkMix * 0.6);
        const push = listenMix * level * gap * 0.75 * (k + 1) * 0.5 + kick * gap * 0.6 * (k + 1) * 0.5;
        const r = R + gap * (k + 1) * fold + breathe + push;
        const a = RING_ALPHA[k] * (1 - endMix * 0.7);
        circle(r, rest, a * (1 - listenMix), 1.25);
        circle(r, person, Math.min(1, a * (1.4 + level * 2.2)) * listenMix, 1.5);
      }

      // ripples leaving the disc: ringing (two, 1.8 s) and connecting (one, 2.4 s)
      if (ringMix > 0.01) {
        for (let i = 0; i < 2; i++) {
          const age = ((t / 1.8 + i * 0.5) % 1 + 1) % 1;
          circle(R + age * gap * (RINGS + 0.5), agent, (1 - age) * 0.55 * ringMix, 1.5);
        }
      }
      if (connectMix > 0.01) {
        const age = ((t / 2.4) % 1 + 1) % 1;
        circle(R + age * gap * (RINGS + 0.5), agent, (1 - age) * 0.4 * connectMix, 1.5);
      }

      // the assistant: a teal ring hugging the disc and the side waves
      if (speakMix > 0.01) {
        circle(R + 4 + level * 3, agent, speakMix * (0.55 + level * 0.45), 2);
        const amp = R * 0.5 * speakMix * (0.12 + level * 0.88);
        for (let j = WAVES.length - 1; j >= 0; j--) {
          wave(-1, j, amp);
          wave(1, j, amp);
        }
      }

      // thinking: a short teal arc turning around the disc
      if (thinkMix > 0.01) {
        ctx!.globalAlpha = thinkMix * 0.9;
        ctx!.strokeStyle = agent;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.arc(w / 2, h / 2, R + 5, arc, arc + Math.PI * 0.55);
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;
    }

    function targets(m: RespiraCirculosMode) {
      return {
        speak: m === "speak" ? 1 : 0,
        listen: m === "listen" ? 1 : 0,
        think: m === "think" ? 1 : 0,
        connect: m === "connect" ? 1 : 0,
        ring: m === "ring" ? 1 : 0,
        end: m === "end" ? 1 : 0,
      };
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
        // the voice just connected: one swell outward
        if (prevMode === "connect" && (m === "listen" || m === "speak" || m === "think" || m === "muted")) kick = 1;
        prevMode = m;
      }
      const tg = targets(m);
      let target = 0;
      if (m === "speak") target = read(s.levels?.output, bands);
      else if (m === "listen") target = read(s.levels?.input, bands);
      else bands.fill(0);
      level += (target - level) * (target > level ? 0.35 : 0.1);
      for (let i = 0; i < BANDS; i++) smooth[i] += (bands[i] - smooth[i]) * (bands[i] > smooth[i] ? 0.4 : 0.12);
      const e = Math.min(1, dt * 7);
      speakMix += (tg.speak - speakMix) * e;
      listenMix += (tg.listen - listenMix) * e;
      thinkMix += (tg.think - thinkMix) * e;
      connectMix += (tg.connect - connectMix) * e;
      ringMix += (tg.ring - ringMix) * e;
      endMix += (tg.end - endMix) * Math.min(1, dt * 4);
      kick *= Math.pow(0.04, dt); // gone in about a second
      t += dt;
      arc = (arc + dt * TAU * 0.6) % TAU;

      const settled =
        Math.abs(tg.speak - speakMix) < 0.005 &&
        Math.abs(tg.listen - listenMix) < 0.005 &&
        Math.abs(tg.think - thinkMix) < 0.005 &&
        Math.abs(tg.connect - connectMix) < 0.005 &&
        Math.abs(tg.ring - ringMix) < 0.005 &&
        Math.abs(tg.end - endMix) < 0.005 &&
        kick < 0.005;
      const still = (m === "rest" || m === "muted" || m === "end") && settled;
      const slow = m === "ring" || m === "connect" || m === "think";
      if (!slow || now - lastDraw > 32) {
        draw();
        lastDraw = now;
      }
      if (still) {
        raf = 0;
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function staticDraw() {
      const tg = targets(snap.current.mode);
      speakMix = tg.speak;
      listenMix = tg.listen;
      thinkMix = tg.think;
      connectMix = 0; // no breathing
      ringMix = tg.ring;
      endMix = tg.end;
      kick = 0;
      level = tg.speak || tg.listen ? 0.45 : 0;
      smooth.fill(level);
      t = 1.1;
      arc = -Math.PI / 2;
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
    if (discRef.current) ro.observe(discRef.current);
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
  }, [discRef]);

  return <canvas ref={canvasRef} aria-hidden className={`block h-full w-full ${className}`} />;
}
