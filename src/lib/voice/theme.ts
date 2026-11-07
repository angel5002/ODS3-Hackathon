// Visual variants of the voice screens (E5 v2). The values live in src/app/globals.css under
// [data-voice-theme="claro" | "oscuro"] and are measured by scripts/dev/contrast-check.mjs.
export type VoiceTheme = "claro" | "oscuro";

/** The variant used when a screen gets no `theme` prop (the original dark call screen). */
export const DEFAULT_VOICE_THEME: VoiceTheme = "oscuro";

export const VOICE_THEMES: { id: VoiceTheme; label: string }[] = [
  { id: "oscuro", label: "Oscuro" },
  { id: "claro", label: "Claro" },
];
