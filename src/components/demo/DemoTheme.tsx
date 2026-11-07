// /demo OPERAR (control board and operator tools): local tokens and the little motion it uses. Stoic direction
// (insumos/referencias/stoic_referencia.png): near-white page, white cards with a subtle border, near-black text and
// buttons, one health accent (teal) for links, live states and the focus ring. Radii come from the global tokens
// (rounded-md / rounded-lg / rounded-xl / rounded-2xl), so the global system sets them.
// Every colour that carries text or a control edge is an opaque hex measured by `node scripts/dev/contrast-check.mjs`
// (it reads DEMO_TOKENS from this file): text >= 4.5:1, icons and control edges >= 3:1. Colour never carries meaning
// alone: every state also has its word. Rendered once as a hoisted <style> (React 19 dedupes it by href).

export const DEMO_TOKENS = {
  "cc-page": "#f7f7f6",
  "cc-surface": "#ffffff",
  "cc-subtle": "#f2f2f1",
  // hairlines between rows and around panels: decorative only (a control edge uses --cc-control)
  "cc-border": "#e3e3e1",
  "cc-text": "#141414",
  "cc-text-2": "#545454",
  "cc-control": "#767676",
  "cc-primary": "#141414",
  "cc-primary-press": "#333333",
  "cc-on-primary": "#ffffff",
  "cc-on-primary-2": "#d6d6d6",
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
.cc-root{${vars}--cc-foot:0px;background-color:var(--cc-page);color:var(--cc-text);}
@media (min-width:1280px){.cc-root{--cc-foot:34px}.cc-footer{min-height:34px}}
.cc-root :focus-visible{outline:3px solid var(--cc-focus);outline-offset:2px;}
/* /demo has its own one-line notice at the foot: the site footer would repeat it */
body:has(.cc-root) #contenido ~ footer{display:none;}
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
