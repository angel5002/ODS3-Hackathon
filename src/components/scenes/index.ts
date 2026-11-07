// Scene playback of the final pitch (track C), for /demo's presentation mode (track D).
//
//   <ScenePlayer scene="escena1" onPastEnd={goToNextMoment} />            // keys: → PageDown Space Enter / ← PageUp
//   <ScenePlayer scene="escena2" keyboard={false} handleRef={ref} />       // host drives ref.current.next()
//
// Or build your own stage with the controller and the views:
//   const c = useSceneController("escena1", { voice: true }); useSceneKeyboard(c, { onPastEnd });
//   <Scene1View controller={c} />  ·  <CallView {...scene1CallProps(c)!} />
export { ScenePlayer, type ScenePlayerProps, type SceneHandle } from "./ScenePlayer";
export { Scene1View, scene1CallProps, type Scene1ViewProps } from "./Scene1View";
export { Scene2View, scene2Summary, type Scene2ViewProps } from "./Scene2View";
export {
  useSceneController,
  useSceneKeyboard,
  SCENE_NEXT_KEYS,
  SCENE_PREV_KEYS,
  type SceneController,
  type SceneControllerOptions,
  type SceneKeyboardOptions,
} from "./useSceneController";
export { SCENES, ESCENA_1, ESCENA_2, estimateScene, type PlayableScene, type SceneStep } from "@/lib/demo/scenes";
