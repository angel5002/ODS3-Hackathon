"use client";

// The small engine of the scene playback (pitch v7 §3-§4). The presenter moves line by line (next/prev or the
// keyboard); lines with `afterMs` (the chat of scene 2) follow by themselves. An AI line with audio plays the
// pre-generated file through ONE <audio> element whose WebAudio AnalyserNode feeds the call screen's wave, so the
// wave follows THAT voice. Each step is logged as a scene (voice_events kind "escena.<id>.<step>"), never as a call.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SceneId } from "@/lib/demo/contract";
import type { AudioLevels } from "@/lib/voice/contract";
import { SCENES, autoDelay, type PlayableScene, type SceneStep } from "@/lib/demo/scenes";
import { ring } from "@/lib/voice/audio";

export type SceneControllerOptions = {
  /** read the AI lines aloud with the pre-generated audio (scene 1 always needs it; scene 2 default off: 2.4 s pace) */
  voice?: boolean;
  /** POST each step to the staff route (default true); false for previews and tests without a session */
  logEvents?: boolean;
  /** route of the step log (staff only) */
  eventUrl?: string;
  /** called when the last line is reached */
  onDone?: () => void;
  /** called on every step with the line shown */
  onStep?: (index: number, line: SceneStep) => void;
};

export type SceneController = {
  scene: PlayableScene;
  index: number;
  line: SceneStep;
  /** lines already shown, in order (scene 2's chat draws these) */
  shown: SceneStep[];
  /** advance one line; false when the scene is already at its end (the host can move to the next moment) */
  next: () => boolean;
  /** go back one line (stops the audio and the automatic chat) */
  prev: () => boolean;
  reset: () => void;
  atStart: boolean;
  atEnd: boolean;
  /** the AI audio is playing now */
  agentSpeaking: boolean;
  /** analyser of the AI audio, for VoiceWave/CallView (input is always null: no microphone in a playback) */
  levels: AudioLevels;
  /** seconds since the call of scene 1 was answered */
  callSeconds: number;
  voice: boolean;
};

let audioCtx: AudioContext | null = null;

export function useSceneController(sceneId: SceneId, opts: SceneControllerOptions = {}): SceneController {
  const scene = SCENES[sceneId];
  const voice = opts.voice ?? sceneId === "escena1";
  const [index, setIndex] = useState(0);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [callStart, setCallStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRef = useRef(false);
  const indexRef = useRef(0);
  // the automatic chat calls the latest `enter` (declared below) through this ref
  const enterRef = useRef<(i: number, play: boolean) => void>(() => {});
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  // one audio element per controller
  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    a.crossOrigin = "anonymous";
    const on = () => setAgentSpeaking(true);
    const off = () => setAgentSpeaking(false);
    a.addEventListener("playing", on);
    a.addEventListener("pause", off);
    a.addEventListener("ended", off);
    a.addEventListener("error", off);
    audioRef.current = a;
    // warm the cache so the first line starts without a gap
    for (const l of scene.lines) if (l.audio) void fetch(l.audio).catch(() => {});
    return () => {
      a.pause();
      a.removeAttribute("src");
      audioRef.current = null;
      analyserRef.current = null;
    };
  }, [scene]);

  const stopAll = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (ringRef.current) clearInterval(ringRef.current);
    ringRef.current = null;
    audioRef.current?.pause();
  }, []);

  useEffect(() => stopAll, [stopAll]);

  const ensureAnalyser = useCallback(() => {
    const a = audioRef.current;
    if (!a || analyserRef.current) return;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx ??= new AC();
      const src = audioCtx.createMediaElementSource(a);
      const an = audioCtx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.6;
      src.connect(an).connect(audioCtx.destination);
      analyserRef.current = an;
      bufRef.current = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
    } catch {
      // no WebAudio: the audio still plays, the wave rests
    }
  }, []);

  const levels = useMemo<AudioLevels>(
    () => ({
      input: () => null,
      output: () => {
        const an = analyserRef.current;
        const buf = bufRef.current;
        if (!an || !buf || audioRef.current?.paused) return null;
        an.getByteFrequencyData(buf);
        return buf;
      },
    }),
    [],
  );

  const log = useCallback(
    (i: number) => {
      if (optsRef.current.logEvents === false) return;
      const line = scene.lines[i];
      void fetch(optsRef.current.eventUrl ?? "/api/staff/scene-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: scene.id, step: i, line: line.id }),
        keepalive: true,
      }).catch(() => {});
    },
    [scene],
  );

  // what happens when a line is entered: audio, ring, call timer, automatic next line
  const enter = useCallback(
    (i: number, play: boolean) => {
      stopAll();
      const line = scene.lines[i];
      if (line.cue?.phone === "activa") setCallStart((s) => s ?? Date.now());
      if (line.cue?.phone === "ticket" || line.cue?.phone === "entrante") setCallStart(null);
      if (play && line.who === "pantalla" && line.cue?.phone === "entrante") {
        ring();
        ringRef.current = setInterval(ring, 1600);
      }
      if (play && voice && line.audio && audioRef.current) {
        ensureAnalyser();
        void audioCtx?.resume().catch(() => {});
        const a = audioRef.current;
        a.src = line.audio;
        a.currentTime = 0;
        void a.play().catch(() => setAgentSpeaking(false));
      }
      const nextLine = scene.lines[i + 1];
      if (play && nextLine?.afterMs != null) {
        autoRef.current = true;
        timerRef.current = setTimeout(() => {
          indexRef.current = i + 1;
          setIndex(i + 1);
          enterRef.current(i + 1, true);
          log(i + 1);
        }, autoDelay(line, nextLine, voice));
      } else {
        autoRef.current = false;
      }
      optsRef.current.onStep?.(i, line);
      if (play && i === scene.lines.length - 1) optsRef.current.onDone?.();
    },
    [scene, voice, stopAll, ensureAnalyser, log],
  );
  useEffect(() => {
    enterRef.current = enter;
  }, [enter]);

  // the first line is on screen from the start (it is logged once; nothing plays before the presenter acts)
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    log(0);
  }, [log]);

  const next = useCallback(() => {
    const i = indexRef.current;
    if (i >= scene.lines.length - 1) return false;
    indexRef.current = i + 1;
    setIndex(i + 1);
    enter(i + 1, true);
    log(i + 1);
    return true;
  }, [scene, enter, log]);

  const prev = useCallback(() => {
    const i = indexRef.current;
    if (i <= 0) return false;
    indexRef.current = i - 1;
    setIndex(i - 1);
    enter(i - 1, false);
    log(i - 1);
    return true;
  }, [enter, log]);

  const reset = useCallback(() => {
    stopAll();
    indexRef.current = 0;
    setIndex(0);
    setCallStart(null);
    log(0);
  }, [stopAll, log]);

  // call timer (1 s)
  useEffect(() => {
    if (callStart == null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [callStart]);

  const line = scene.lines[index];
  return {
    scene,
    index,
    line,
    shown: scene.lines.slice(0, index + 1),
    next,
    prev,
    reset,
    atStart: index === 0,
    atEnd: index === scene.lines.length - 1,
    agentSpeaking,
    levels,
    callSeconds: callStart == null ? 0 : Math.max(0, Math.floor((now - callStart) / 1000)),
    voice,
  };
}

export type SceneKeyboardOptions = {
  /** listen to the keyboard (default true); the host turns it off while its own controls have focus */
  enabled?: boolean;
  nextKeys?: string[];
  prevKeys?: string[];
  /** called when "next" is pressed at the last line (e.g. /demo goes to the next moment) */
  onPastEnd?: () => void;
  /** called when "prev" is pressed at the first line */
  onBeforeStart?: () => void;
};

export const SCENE_NEXT_KEYS = ["ArrowRight", "PageDown", " ", "Enter"];
export const SCENE_PREV_KEYS = ["ArrowLeft", "PageUp"];

/** Presenter keys: → / PageDown / Space / Enter advance, ← / PageUp go back. Ignored while typing in a field. */
export function useSceneKeyboard(ctrl: Pick<SceneController, "next" | "prev">, opts: SceneKeyboardOptions = {}) {
  const ref = useRef({ ctrl, opts });
  useEffect(() => {
    ref.current = { ctrl, opts };
  });
  const enabled = opts.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const { ctrl: c, opts: o } = ref.current;
      if ((o.nextKeys ?? SCENE_NEXT_KEYS).includes(e.key)) {
        e.preventDefault();
        if (!c.next()) o.onPastEnd?.();
      } else if ((o.prevKeys ?? SCENE_PREV_KEYS).includes(e.key)) {
        e.preventDefault();
        if (!c.prev()) o.onBeforeStart?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
