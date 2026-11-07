// /demo presentation mode: local tokens and motion. Colours alias the global token names (track A remaps their
// values to the Stoic look: near-white page, near-black ink, one health accent); the hex after each comma is only a
// fallback. Type scales with the projector: 1em = clamp(20px, 2.75vmin, 44px) on the presentation root, so every
// size below is in em and the same view fits 1280×720 and 1920×1080 without scrolling.
//
// Local tokens (no edits to globals.css):
//   --pr-bg        page            -> var(--color-surface)
//   --pr-ink       main text       -> var(--color-ink)
//   --pr-muted     secondary text  -> var(--color-muted)
//   --pr-line      hairlines       -> var(--color-line)
//   --pr-soft      quiet fills     -> var(--color-sunken)
//   --pr-accent    the one health accent -> var(--color-brand)
//   --pr-accent-soft               -> var(--color-brand-soft)
//   --pr-no        "Sin AsistIA" band     -> var(--color-risk-alto)
//   --pr-no-soft                          -> var(--color-risk-alto-soft)
//   --pr-yes       "Con AsistIA" band     -> var(--color-st-ok)
//   --pr-yes-soft                         -> var(--color-st-ok-soft)
const CSS = `
.pr-root{
  --pr-bg:var(--color-surface,#ffffff);--pr-ink:var(--color-ink,#111111);--pr-muted:var(--color-muted,#4a4a4a);
  --pr-line:var(--color-line,#e3e3e3);--pr-soft:var(--color-sunken,#f4f4f4);
  --pr-accent:var(--color-brand,#0e5a57);--pr-accent-soft:var(--color-brand-soft,#e1eeec);
  --pr-no:var(--color-risk-alto,#b42318);--pr-no-soft:var(--color-risk-alto-soft,#fde8e6);
  --pr-yes:var(--color-st-ok,#1b6e43);--pr-yes-soft:var(--color-st-ok-soft,#dff1e6);
  --pr-ease:cubic-bezier(.23,1,.32,1);
  font-size:clamp(20px,2.75vmin,44px);background:var(--pr-bg);color:var(--pr-ink);
}
.pr-root :focus-visible{outline:3px solid var(--pr-accent);outline-offset:3px;}
.pr-title{font-family:var(--font-display);letter-spacing:-0.015em;line-height:1.05;font-weight:700;text-wrap:balance;}
@keyframes pr-in{from{opacity:0;transform:translateY(.45em)}to{opacity:1;transform:none}}
.pr-in{animation:pr-in 420ms var(--pr-ease) both;animation-delay:calc(var(--i,0) * 90ms);}
@keyframes pr-fade{from{opacity:0}to{opacity:1}}
.pr-fade{animation:pr-fade 360ms ease-out both;}
@keyframes pr-band{from{opacity:0;transform:translateX(-1.2em)}to{opacity:1;transform:none}}
.pr-band{animation:pr-band 520ms var(--pr-ease) both;}
@keyframes pr-live{0%,100%{opacity:1}50%{opacity:.3}}
.pr-live{animation:pr-live 1800ms ease-in-out infinite;}
@keyframes pr-wave{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
.pr-wave>i{display:block;width:.28em;border-radius:.2em;background:currentColor;transform-origin:center;animation:pr-wave 1100ms ease-in-out infinite;}
.pr-wave>i:nth-child(2){animation-delay:-200ms}.pr-wave>i:nth-child(3){animation-delay:-450ms}.pr-wave>i:nth-child(4){animation-delay:-700ms}.pr-wave>i:nth-child(5){animation-delay:-900ms}
@keyframes pr-draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.pr-draw{transform-origin:left center;animation:pr-draw 700ms var(--pr-ease) both;animation-delay:calc(var(--i,0) * 160ms);}
.pr-move{transition:transform 900ms var(--pr-ease),background-color 400ms ease,border-color 400ms ease;}
.pr-swap{transition:opacity 300ms ease,color 300ms ease,background-color 300ms ease;}
@media (prefers-reduced-motion:reduce){
  .pr-in,.pr-fade,.pr-band,.pr-draw{animation:none}
  .pr-live,.pr-wave>i{animation:none}
  .pr-move,.pr-swap{transition:none}
}
`;

export function PresentationTheme() {
  return (
    <style href="asistia-presentation-theme" precedence="medium">
      {CSS}
    </style>
  );
}
