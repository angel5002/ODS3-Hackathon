// /demo (control center and operator tools): local tokens and the little motion it uses, so the screen does not
// depend on the global palette the design track owns. Sober public-health look (NHS / USWDS): flat white surfaces,
// 1 px borders, small radii, Public Sans, hierarchy by size and weight. Every colour that carries text or a control
// edge is an opaque hex measured by `node scripts/dev/contrast-check.mjs` (it reads DEMO_TOKENS from this file):
// text >= 4.5:1, icons and control edges >= 3:1. Colour never carries meaning alone: every state also has its word.
// Rendered once as a hoisted <style> (React 19 dedupes it by href).

export const DEMO_TOKENS = {
  "cc-page": "#f1f3f2",
  "cc-surface": "#ffffff",
  "cc-subtle": "#f1f3f2",
  // hairlines between rows and around panels: decorative only (a control edge uses --cc-control)
  "cc-border": "#c9cfcc",
  "cc-text": "#1b1f1e",
  "cc-text-2": "#47504d",
  "cc-control": "#6b7471",
  "cc-primary": "#10302f",
  "cc-primary-press": "#1f4644",
  "cc-on-primary": "#ffffff",
  "cc-on-primary-2": "#c9dad7",
  "cc-accent": "#0b6459",
  "cc-ok": "#136b3f",
  "cc-warn": "#8a4600",
  "cc-danger": "#b42318",
  "cc-on-danger": "#ffffff",
  "cc-danger-subtle": "#fbeceb",
  "cc-focus": "#0b6459",
} as const;

const vars = Object.entries(DEMO_TOKENS)
  .map(([k, v]) => `--${k}:${v};`)
  .join("");

const CSS = `
.cc-root{${vars}background-color:var(--cc-page);color:var(--cc-text);}
.cc-root :focus-visible{outline:3px solid var(--cc-focus);outline-offset:2px;}
@keyframes cc-live{0%,100%{opacity:1}50%{opacity:.35}}
.cc-live{animation:cc-live 1600ms ease-in-out infinite;}
.cc-bar{transform-origin:left center;transition:transform 300ms cubic-bezier(.23,1,.32,1);}
@keyframes cc-swap{from{opacity:0}to{opacity:1}}
.cc-swap{animation:cc-swap 200ms ease-out both;}
.cc-press{transition:background-color 120ms ease,transform 120ms cubic-bezier(.23,1,.32,1);}
.cc-press:active:not(:disabled){transform:scale(.98);}
@media (prefers-reduced-motion:reduce){.cc-live,.cc-swap{animation:none}.cc-bar,.cc-press{transition:none}.cc-press:active:not(:disabled){transform:none}}
`;

export function DemoTheme() {
  return (
    <style href="asistia-demo-theme" precedence="medium">
      {CSS}
    </style>
  );
}
