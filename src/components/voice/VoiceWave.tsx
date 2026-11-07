"use client";

// Voice wave for the call screens (E5 v2). <canvas> + requestAnimationFrame; React never re-renders per frame.
// Four layers: two translucent ribbons (back and middle), a soft halo and a crisp front line. Their height
// follows the real frequency data of the agent's voice (levels.output) or the person's microphone
// (levels.input), read inside the frame. The agent and the person have their own colour and the wave blends
// between them when the turn changes. At rest it breathes slowly; while connecting it beats; on the moment of
// connecting it swells once; on hang-up (`ending`) it flattens and fades out, then the loop stops.
// Colours come from the --vc-* tokens of the nearest [data-voice-theme] (src/app/globals.css).
// Budget for a mid-range phone: DPR capped at 2, a point every 4 px, gradients cached (no allocations per
// frame once warm), 30 fps while resting, the loop stops while the tab is hidden. Reduced motion: one static
// drawing per change of props, nothing moves.
import { useEffect, useRef } from "react";
import type { AudioLevels, VoiceWaveProps } from "@/lib/voice/contract";
import type { VoiceTheme } from "@/lib/voice/theme";

type RGB = [number, number, number];

/** Speaker colours as CSS values (the same tokens the wave reads), for dots and labels next to the wave. */
export const WAVE_COLOR: Record<"agente" | "persona", string> = { agente: "var(--vc-agent)", persona: "var(--vc-person)" };

export type VoiceWaveExtraProps = {
  /** Visual variant. Only used to re-read the colour tokens when it changes; the tokens come from the nearest
   *  [data-voice-theme] ancestor. Optional. */
  theme?: VoiceTheme;
  /** The voice session is being set up: the wave beats softly. Optional, default false. */
  connecting?: boolean;
  /** The call is ending: the wave flattens and fades out, then stops drawing. Optional, default false. */
  ending?: boolean;
};

const BANDS = 8;
/** bins used for the voice: with fftSize 256 at 48 kHz each bin is ~190 Hz, so 48 bins cover ~9 kHz */
const VOICE_BINS = 48;
const STEP_PX = 4;
const MAX_DPR = 2;
const MIX_STEPS = 24;
const REST_STEPS = 12;

type Snapshot = {
  levels: AudioLevels | null;
  active: boolean;
  speaker: VoiceWaveProps["speaker"];
  reducedMotion: boolean;
  connecting: boolean;
  ending: boolean;
  theme: VoiceTheme | undefined;
};

function readBands(levels: AudioLevels | null, speaker: Snapshot["speaker"], out: Float32Array): boolean {
  out.fill(0);
  if (!levels) return false;
  let data: Uint8Array | null = null;
  try {
    data = speaker === "persona" ? levels.input() : levels.output();
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

function parseColour(value: string, fallback: RGB): RGB {
  const v = value.trim();
  const m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const r = v.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (r) return [Number(r[1]), Number(r[2]), Number(r[3])];
  return fallback;
}

/** layers, back to front */
const LAYERS = [
  { gain: 0.78, offset: 2.1, speed: 0.8, alpha: 0.2, kind: "ribbon" as const },
  { gain: 0.56, offset: 0.7, speed: 1.25, alpha: 0.3, kind: "ribbon" as const },
  { gain: 1, offset: 0, speed: 1, alpha: 0.16, kind: "halo" as const },
  { gain: 1, offset: 0, speed: 1, alpha: 1, kind: "line" as const },
];

export function VoiceWave({
  levels,
  active,
  speaker,
  reducedMotion = false,
  className = "",
  theme,
  connecting = false,
  ending = false,
}: VoiceWaveProps & VoiceWaveExtraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef<Snapshot>({ levels, active, speaker, reducedMotion, connecting, ending, theme });
  const wake = useRef<(() => void) | null>(null);

  // latest props for the loop, without restarting it
  useEffect(() => {
    props.current = { levels, active, speaker, reducedMotion, connecting, ending, theme };
    wake.current?.();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const target = new Float32Array(BANDS);
    const bands = new Float32Array(BANDS);
    const caches = LAYERS.map(() => new Map<number, CanvasGradient>());
    let agent: RGB = [10, 152, 132];
    let person: RGB = [226, 89, 11];
    let restC: RGB = [111, 143, 138];
    let blend: GlobalCompositeOperation = "source-over";
    let themeSeen: VoiceTheme | undefined = undefined;
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    let lastDraw = 0;
    let phase = 0;
    let mix = props.current.speaker === "persona" ? 0 : 1; // 1 = agent colour, 0 = person colour
    let rest = props.current.active ? 0 : 1; // 1 = resting colour
    let fade = props.current.ending ? 0 : 1; // global opacity, goes to 0 on hang-up
    let kick = 0; // one swell when the voice connects
    let wasConnecting = props.current.connecting;

    const reduced = () => props.current.reducedMotion || mql.matches;

    function readTokens() {
      const cs = getComputedStyle(canvas!);
      agent = parseColour(cs.getPropertyValue("--vc-agent"), agent);
      person = parseColour(cs.getPropertyValue("--vc-person"), person);
      restC = parseColour(cs.getPropertyValue("--vc-rest"), restC);
      const b = cs.getPropertyValue("--vc-wave-blend").trim();
      blend = b === "source-over" || b === "multiply" || b === "screen" || b === "lighter" ? b : "source-over";
      themeSeen = props.current.theme;
      caches.forEach((c) => c.clear());
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      caches.forEach((c) => c.clear());
    }

    /** horizontal gradient that fades at both ends, cached per quantized colour */
    function gradient(layer: number) {
      const ms = Math.round(mix * MIX_STEPS);
      const rs = Math.round(rest * REST_STEPS);
      const key = ms * (REST_STEPS + 1) + rs;
      const cache = caches[layer];
      const hit = cache.get(key);
      if (hit) return hit;
      const m = ms / MIX_STEPS;
      const r0 = rs / REST_STEPS;
      const c = [0, 1, 2].map((i) => {
        const v = person[i] + (agent[i] - person[i]) * m;
        return Math.round(v + (restC[i] - v) * r0);
      });
      const a = LAYERS[layer].alpha;
      const rgb = `${c[0]},${c[1]},${c[2]}`;
      const g = ctx!.createLinearGradient(0, 0, width, 0);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(0.16, `rgba(${rgb},${a})`);
      g.addColorStop(0.5, `rgba(${rgb},${Math.min(1, a * 1.15)})`);
      g.addColorStop(0.84, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      cache.set(key, g);
      return g;
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

    function heightAt(u: number, floor: number) {
      const win = Math.sin(Math.PI * u) ** 2; // the ends rest on the centre line
      // square root: quiet speech still moves the wave, loud speech does not clip at once
      return Math.min(1, floor + Math.sqrt(energyAt(u)) * 1.3) * win;
    }

    function shapeAt(u: number, t: number, offset: number) {
      return (
        Math.sin(2 * Math.PI * 1.35 * u + t * 1.3 + offset) * 0.6 +
        Math.sin(2 * Math.PI * 2.9 * u - t * 2.1 + offset * 2) * 0.28 +
        Math.sin(2 * Math.PI * 5.1 * u + t * 3.3 - offset) * 0.12
      );
    }

    function ribbon(layer: number, t: number, floor: number, amp: number) {
      const L = LAYERS[layer];
      const mid = height / 2;
      const tt = t * L.speed;
      ctx!.beginPath();
      // upper edge left to right, lower edge right to left: a lens that swells with the voice
      for (let x = 0; x <= width + STEP_PX; x += STEP_PX) {
        const px = Math.min(x, width);
        const u = px / width;
        const h = amp * L.gain * heightAt(u, floor) * (0.55 + 0.45 * Math.abs(shapeAt(u, tt, L.offset)));
        if (x === 0) ctx!.moveTo(px, mid - h);
        else ctx!.lineTo(px, mid - h);
      }
      for (let x = width; x >= -STEP_PX; x -= STEP_PX) {
        const px = Math.max(x, 0);
        const u = px / width;
        const h = amp * L.gain * 0.8 * heightAt(u, floor) * (0.55 + 0.45 * Math.abs(shapeAt(u, tt + 0.9, L.offset + 1.3)));
        ctx!.lineTo(px, mid + h);
      }
      ctx!.closePath();
      ctx!.fillStyle = gradient(layer);
      ctx!.fill();
    }

    function line(layer: number, t: number, floor: number, amp: number, lineWidth: number) {
      const mid = height / 2;
      ctx!.beginPath();
      for (let x = 0; x <= width + STEP_PX; x += STEP_PX) {
        const px = Math.min(x, width);
        const u = px / width;
        const y = mid + amp * heightAt(u, floor) * shapeAt(u, t, 0);
        if (x === 0) ctx!.moveTo(px, y);
        else ctx!.lineTo(px, y);
      }
      ctx!.strokeStyle = gradient(layer);
      ctx!.lineWidth = lineWidth;
      ctx!.stroke();
    }

    function draw(t: number, floor: number, swell: number) {
      ctx!.globalCompositeOperation = "source-over";
      ctx!.globalAlpha = 1;
      ctx!.clearRect(0, 0, width, height);
      if (fade <= 0.001) return;
      const amp = height * 0.44 * (1 + swell * 0.25);
      ctx!.globalAlpha = fade;
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      ctx!.globalCompositeOperation = blend;
      ribbon(0, t, floor * 0.9, amp);
      ribbon(1, t, floor, amp);
      ctx!.globalCompositeOperation = "source-over";
      line(2, t, floor, amp, Math.max(8, height * 0.05));
      line(3, t, floor, amp, 2.5);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function frame(now: number) {
      const p = props.current;
      if (p.theme !== themeSeen) readTokens();
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const live = p.active && !p.ending;
      const hasData = live && readBands(p.levels, p.speaker, target);
      if (!live) target.fill(0);
      let level = 0;
      for (let i = 0; i < BANDS; i++) {
        const k = target[i] > bands[i] ? 0.35 : 0.08; // fast attack, slow release
        bands[i] += (target[i] - bands[i]) * k;
        level += bands[i];
      }
      level /= BANDS;
      mix += ((p.speaker === "persona" ? 0 : 1) - mix) * 0.09;
      rest += ((live || p.connecting ? 0 : 1) - rest) * 0.08;
      fade += ((p.ending ? 0 : 1) - fade) * (p.ending ? 0.07 : 0.12);
      if (wasConnecting && !p.connecting && p.active) kick = 1; // the voice just connected
      wasConnecting = p.connecting;
      kick *= 0.94;

      let floor: number;
      if (p.ending) floor = 0;
      else if (p.connecting) {
        // a soft heartbeat while connecting: two quick beats every 1.4 s
        const c = (now / 1000) % 1.4;
        const beat = Math.exp(-((c - 0.18) ** 2) / 0.004) + 0.6 * Math.exp(-((c - 0.42) ** 2) / 0.004);
        floor = 0.07 + 0.2 * beat;
      } else if (live) floor = hasData ? 0.05 : 0.1 + 0.05 * Math.sin(now / 700);
      else floor = 0.045 + 0.03 * Math.sin(now / 1100); // resting: slow breathing
      floor += kick * 0.35;

      phase += dt * (live ? 0.8 + level * 3.2 : p.connecting ? 1.1 : 0.35);

      const idle = !live && !p.connecting && kick < 0.01 && Math.abs(fade - (p.ending ? 0 : 1)) < 0.01;
      // resting: 30 fps is enough for a slow breath
      if (!idle || now - lastDraw > 32) {
        draw(phase, floor, kick);
        lastDraw = now;
      }
      if (p.ending && fade < 0.01 && level < 0.003) {
        fade = 0;
        draw(phase, 0, 0);
        raf = 0;
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function staticDraw() {
      const p = props.current;
      if (p.theme !== themeSeen) readTokens();
      mix = p.speaker === "persona" ? 0 : 1;
      rest = p.active || p.connecting ? 0 : 1;
      fade = p.ending ? 0 : 1;
      bands.fill(p.active && !p.ending ? 0.3 : 0);
      draw(0.6, p.active ? 0.05 : p.connecting ? 0.12 : 0.05, 0);
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
      else if (!raf) draw(phase, 0, 0);
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
