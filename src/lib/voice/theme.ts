// Visual variant of the voice screens (E5 v2). The team chose the light palette; the tokens live in
// src/app/globals.css (":root, [data-voice-theme='claro']") and are measured by scripts/dev/contrast-check.mjs.
// The type stays a union-ready string so another variant can be added later as one more token block.
export type VoiceTheme = "claro";

/** The variant used when a screen gets no `theme` prop. */
export const DEFAULT_VOICE_THEME: VoiceTheme = "claro";
