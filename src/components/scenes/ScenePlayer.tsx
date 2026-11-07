"use client";

// One scene of the pitch, ready to embed (track D's presentation mode in /demo): it owns its controller and the
// presenter keys. The host can also drive it through `handleRef` (next/prev/reset) or listen to onDone/onPastEnd.
// Fills its parent (h-full w-full): the host gives it the stage. No notices are shown during the playback.
import { useImperativeHandle, type Ref } from "react";
import type { SceneId } from "@/lib/demo/contract";
import { Scene1View } from "./Scene1View";
import { Scene2View } from "./Scene2View";
import { useSceneController, useSceneKeyboard, type SceneController, type SceneKeyboardOptions } from "./useSceneController";

export type SceneHandle = Pick<SceneController, "next" | "prev" | "reset"> & { index: number; atEnd: boolean };

export type ScenePlayerProps = {
  scene: SceneId;
  /** read the AI lines aloud (default: scene 1 yes, scene 2 no, to keep the script's 2.4 s chat pace) */
  voice?: boolean;
  /** presenter keys (default on: → PageDown Space Enter / ← PageUp); false to drive it only through handleRef */
  keyboard?: boolean | Omit<SceneKeyboardOptions, "onPastEnd" | "onBeforeStart">;
  /** "next" pressed on the last line: e.g. go to the next moment of the presentation */
  onPastEnd?: () => void;
  /** "prev" pressed on the first line */
  onBeforeStart?: () => void;
  /** the last line was reached */
  onDone?: () => void;
  /** log each step to voice_events as a scene (default true; needs the staff session) */
  logEvents?: boolean;
  handleRef?: Ref<SceneHandle>;
  className?: string;
};

export function ScenePlayer({ scene, voice, keyboard = true, onPastEnd, onBeforeStart, onDone, logEvents, handleRef, className }: ScenePlayerProps) {
  const c = useSceneController(scene, { voice, logEvents, onDone });
  const kb = typeof keyboard === "object" ? keyboard : { enabled: keyboard };
  useSceneKeyboard(c, { ...kb, onPastEnd, onBeforeStart });
  useImperativeHandle(handleRef, () => ({ next: c.next, prev: c.prev, reset: c.reset, index: c.index, atEnd: c.atEnd }), [c.next, c.prev, c.reset, c.index, c.atEnd]);
  return scene === "escena1" ? <Scene1View controller={c} className={className} /> : <Scene2View controller={c} className={className} />;
}
