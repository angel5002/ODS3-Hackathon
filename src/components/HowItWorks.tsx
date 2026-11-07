"use client";

// "¿Cómo funciona?": a 36-second animated walk-through (6 steps × 6 s) next to "Qué respalda esta propuesta" on
// /pedir-cita and the jury cards. HTML + CSS only (no video): it loads instantly on a phone. Advances by itself with a
// progress bar; tap the right side to go on, the left side to go back, ✕ to close; ← → and Esc on a keyboard.
// prefers-reduced-motion: no movement (the pictures are static), the steps still advance. It never writes anywhere.
// Figures: only "1 de cada 4" (proposal v5.1, HMA 2023). No promises (script v7: never "reducimos la espera").
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const STEP_MS = 6000;

type Step = { title: string; text: string; art: ReactNode };

const STEPS: Step[] = [
  {
    title: "Se pierden citas",
    text: "En el Hospital María Auxiliadora, 1 de cada 4 citas de 2023 se registró como inasistencia, mientras otros esperaban.",
    art: (
      <div className="hw-row">
        <div className="hw-slots">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className={`hw-slot ${n === 2 ? "hw-vanish" : ""}`} />
          ))}
        </div>
        <div className="hw-queue">
          {[0, 1, 2].map((n) => (
            <span key={n} className="hw-person hw-wait" style={{ animationDelay: `${n * 0.3}s` }} />
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Confirmamos la cita",
    text: "AsistIA confirma cada cita por mensaje o por voz. Si la persona no responde, su cita se mantiene.",
    art: (
      <div className="hw-phone">
        <span className="hw-bubble hw-pop" style={{ animationDelay: "0.4s" }}>¿Podrá venir el jueves?</span>
        <span className="hw-bubble hw-me hw-pop" style={{ animationDelay: "1.6s" }}>No podré ir</span>
        <svg className="hw-wave" viewBox="0 0 120 24" aria-hidden>
          <path d="M0 12 Q10 2 20 12 T40 12 T60 12 T80 12 T100 12 T120 12" />
        </svg>
      </div>
    ),
  },
  {
    title: "El cupo va a la lista",
    text: "El cupo liberado se ofrece a la lista, ordenada primero por categoría clínica. Una persona del equipo aprueba la oferta.",
    art: (
      <div className="hw-row">
        <span className="hw-slot hw-free hw-slide" />
        <ol className="hw-list">
          {["P1", "P2", "P3"].map((p, n) => (
            <li key={p} className={n === 0 ? "hw-first" : ""}>
              <span>{p}</span>
              <i />
            </li>
          ))}
        </ol>
        <span className="hw-check hw-pop" style={{ animationDelay: "2.4s" }}>Aprobado por el equipo</span>
      </div>
    ),
  },
  {
    title: "El cupo no se pierde",
    text: "La persona acepta y el cupo vuelve a ser una consulta.",
    art: (
      <div className="hw-row">
        <span className="hw-slot hw-free hw-give" />
        <span className="hw-person hw-big" />
        <span className="hw-tick hw-pop" style={{ animationDelay: "2s" }}>✓</span>
      </div>
    ),
  },
  {
    title: "El médico llega preparado",
    text: "Antes de la cita, una preconsulta breve y opcional. El médico recibe un resumen, sin diagnósticos.",
    art: (
      <div className="hw-row">
        <div className="hw-phone hw-small">
          <span className="hw-bubble hw-pop" style={{ animationDelay: "0.3s" }}>¿Qué molestia tiene?</span>
          <span className="hw-bubble hw-me hw-pop" style={{ animationDelay: "1.1s" }}>Me duele la rodilla</span>
        </div>
        <div className="hw-doc">
          {[0, 1, 2, 3].map((n) => (
            <i key={n} className="hw-fill" style={{ animationDelay: `${1.8 + n * 0.5}s` }} />
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Cada etapa, medida",
    text: "Un tablero mide cada etapa del recorrido. Lo que AsistIA logre en cada institución se mide en el piloto.",
    art: (
      <div className="hw-track">
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} className="hw-stop" style={{ animationDelay: `${0.4 + n * 0.6}s` }} />
        ))}
      </div>
    ),
  },
];

export function HowItWorksButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`min-h-11 text-[15px] font-medium text-vc-text-2 underline decoration-vc-line underline-offset-4 hover:text-vc-text ${className}`}
      >
        ¿Cómo funciona?
      </button>
      {open && <Tour onClose={() => setOpen(false)} />}
    </>
  );
}

function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const ref = useRef<HTMLDialogElement>(null);
  const go = useCallback(
    (n: number) => {
      if (n < 0) n = 0;
      if (n >= STEPS.length) return onClose();
      setI(n);
      setStartedAt(Date.now());
    },
    [onClose],
  );

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => go(i + 1), STEP_MS - (Date.now() - startedAt));
    return () => clearTimeout(t);
  }, [i, startedAt, go]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);

  const s = STEPS[i];
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="hw-title"
      className="hw m-0 h-dvh max-h-none w-screen max-w-none bg-vc-bg p-0 text-vc-text backdrop:bg-black/40 sm:m-auto sm:h-[min(92dvh,760px)] sm:w-[420px] sm:rounded-3xl"
    >
      <style>{CSS}</style>
      <div className="flex h-full flex-col px-5 pb-6 pt-4">
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((_, n) => (
            <span key={n} className="h-1 flex-1 overflow-hidden rounded-full bg-vc-line">
              <span
                key={n === i ? `on-${i}-${startedAt}` : n}
                className={`block h-full bg-vc-text ${n < i ? "w-full" : n === i ? "hw-progress" : "w-0"}`}
                style={n === i ? { animationDuration: `${STEP_MS}ms` } : undefined}
              />
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[14px] text-vc-text-2">
            Paso {i + 1} de {STEPS.length}
          </p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-11 place-items-center rounded-full text-vc-text-2 hover:bg-vc-bg-2">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {/* tap zones: left = back, right = next (the close button sits above them) */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div key={i} className="hw-enter flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 place-items-center">{s.art}</div>
            <h2 id="hw-title" className="font-display text-[30px] leading-tight">
              {s.title}
            </h2>
            <p className="mt-2 text-pretty text-[18px] leading-snug text-vc-text-2" aria-live="polite">
              {s.text}
            </p>
          </div>
          <button type="button" aria-label="Paso anterior" onClick={() => go(i - 1)} className="absolute inset-y-0 left-0 w-1/3" />
          <button type="button" aria-label="Paso siguiente" onClick={() => go(i + 1)} className="absolute inset-y-0 right-0 w-2/3" />
        </div>
      </div>
    </dialog>
  );
}

const CSS = `
.hw{--ink:var(--color-ink,#151a19);--line:var(--color-vc-line,#d9dedc);--acc:var(--color-accent,#0c6b62);--soft:var(--color-accent-soft,#e3efed)}
.hw-progress{width:0;animation:hw-grow linear forwards}
@keyframes hw-grow{to{width:100%}}
.hw-enter{animation:hw-in .45s cubic-bezier(.2,.8,.2,1)}
@keyframes hw-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.hw-row{display:flex;align-items:center;justify-content:center;gap:22px;flex-wrap:wrap}
.hw-slots{display:grid;grid-template-columns:repeat(2,44px);gap:10px}
.hw-slot{display:block;width:44px;height:56px;border-radius:10px;border:2px solid var(--ink);background:#fff}
.hw-vanish{animation:hw-vanish 1.2s 1s ease forwards}
@keyframes hw-vanish{to{border-style:dashed;border-color:var(--line);background:transparent}}
.hw-queue{display:flex;gap:8px}
.hw-person{display:block;width:26px;height:40px;border-radius:13px 13px 6px 6px;background:var(--line);position:relative}
.hw-person::before{content:"";position:absolute;left:5px;top:-18px;width:16px;height:16px;border-radius:50%;background:inherit}
.hw-wait{animation:hw-bob 1.6s ease-in-out infinite}
@keyframes hw-bob{50%{transform:translateY(-3px)}}
.hw-big{width:40px;height:60px;border-radius:20px 20px 8px 8px;background:var(--ink)}
.hw-big::before{left:8px;top:-26px;width:24px;height:24px}
.hw-phone{display:flex;flex-direction:column;gap:8px;width:200px;padding:16px 12px;border:2px solid var(--ink);border-radius:26px;background:#fff}
.hw-small{width:170px}
.hw-bubble{align-self:flex-start;max-width:90%;padding:7px 11px;border-radius:14px;background:var(--soft);font-size:14px;line-height:1.25;opacity:0}
.hw-me{align-self:flex-end;background:var(--ink);color:#fff}
.hw-pop{animation:hw-pop .4s ease forwards}
@keyframes hw-pop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
.hw-wave{width:120px;height:24px;align-self:center;margin-top:6px}
.hw-wave path{fill:none;stroke:var(--acc);stroke-width:2.5;stroke-linecap:round;animation:hw-wave 1.2s ease-in-out infinite;transform-origin:center}
@keyframes hw-wave{50%{transform:scaleY(.3)}}
.hw-free{border-color:var(--acc);background:var(--soft)}
.hw-slide{animation:hw-slide 1.4s .3s ease both}
@keyframes hw-slide{from{transform:translateX(-30px);opacity:0}to{transform:none;opacity:1}}
.hw-list{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.hw-list li{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.hw-list i{display:block;width:90px;height:12px;border-radius:6px;background:var(--line)}
.hw-first i{background:var(--acc);animation:hw-pulse 1s 1.4s ease 2}
@keyframes hw-pulse{50%{opacity:.4}}
.hw-check{flex-basis:100%;text-align:center;font-size:15px;font-weight:600;color:var(--acc);opacity:0}
.hw-give{animation:hw-give 1.6s .4s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes hw-give{to{transform:translateX(30px) scale(.8)}}
.hw-tick{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--acc);color:#fff;font-size:24px;font-weight:700;opacity:0}
.hw-doc{display:flex;flex-direction:column;gap:10px;width:120px;padding:16px 12px;border:2px solid var(--ink);border-radius:10px;background:#fff}
.hw-doc i{display:block;height:10px;border-radius:5px;background:var(--line);transform-origin:left;transform:scaleX(.15)}
.hw-fill{animation:hw-fill .7s ease forwards}
@keyframes hw-fill{to{transform:none;background:var(--ink)}}
.hw-track{position:relative;display:flex;justify-content:space-between;width:260px}
.hw-track::before{content:"";position:absolute;left:8px;right:8px;top:50%;height:3px;background:var(--line);transform:translateY(-50%)}
.hw-stop{position:relative;width:20px;height:20px;border-radius:50%;border:3px solid var(--line);background:#fff;animation:hw-stop .4s ease forwards}
@keyframes hw-stop{to{border-color:var(--acc);background:var(--acc)}}
@media (prefers-reduced-motion:reduce){
  .hw *{animation-duration:1ms!important;animation-delay:0s!important;animation-iteration-count:1!important}
  .hw-progress{animation:none!important;width:100%}
}
`;
