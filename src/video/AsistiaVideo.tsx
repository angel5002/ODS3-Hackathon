// "Cómo funciona AsistIA": a 68-second motion-graphics explainer (1920×1080, 30 fps), the same composition played in
// the page with @remotion/player and exported to MP4 with the Remotion CLI (src/video/index.ts).
// Style: the app's Stoic system (light background, line icons, one teal accent, DM Sans + DM Serif Display).
// Text: the team's script (7/11). No figure beyond the proposal v5.1 (347 lost appointments a day at the HMA; the 72-hour
// confirmation; P1–P4) and no promises. Clock times in the tracking scene are an illustration, not data.
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BellRing, CalendarCheck, Check, ClipboardList, FileText, Hourglass, Repeat, Siren, Stethoscope } from "lucide-react";

export const VIDEO = { fps: 30, width: 1920, height: 1080, durationInFrames: 2040 };

const C = {
  bg: "#f6f7f6",
  card: "#ffffff",
  ink: "#151a19",
  muted: "#5b6663",
  line: "#d9dedc",
  acc: "#0c6b62",
  accSoft: "#e3efed",
  alert: "#b42318",
  alertSoft: "#fdecea",
};
const SANS = "var(--font-dm-sans, 'DM Sans'), system-ui, sans-serif";
const SERIF = "var(--font-dm-serif, 'DM Serif Display'), Georgia, serif";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
/** 0→1 between two frames, eased */
const t = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });

// ------------------------------------------------------------------------------------------------ building blocks

function Scene({ dur, children }: { dur: number; children: ReactNode }) {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 14, dur - 14, dur], [0, 1, 1, 0], clamp);
  const y = interpolate(f, [0, 18], [16, 0], { ...clamp, easing: ease });
  return <AbsoluteFill style={{ opacity: o, transform: `translateY(${y}px)` }}>{children}</AbsoluteFill>;
}

function Caption({ children, at = 10 }: { children: ReactNode; at?: number }) {
  const f = useCurrentFrame();
  const p = t(f, at, at + 18);
  return (
    <div
      style={{
        position: "absolute",
        left: 160,
        right: 160,
        bottom: 96,
        textAlign: "center",
        fontFamily: SERIF,
        fontSize: 58,
        lineHeight: 1.12,
        color: C.ink,
        opacity: p,
        transform: `translateY(${(1 - p) * 14}px)`,
        textWrap: "balance",
      }}
    >
      {children}
    </div>
  );
}

function Person({ color = C.line, size = 1, label, style }: { color?: string; size?: number; label?: string; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * size, ...style }}>
      <svg width={64 * size} height={104 * size} viewBox="0 0 64 104" aria-hidden>
        <circle cx="32" cy="20" r="17" fill={color} />
        <rect x="6" y="42" width="52" height="62" rx="24" fill={color} />
      </svg>
      {label && <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 26 * size, color: C.ink }}>{label}</span>}
    </div>
  );
}

function Chip({ children, tone = "ink", style }: { children: ReactNode; tone?: "ink" | "acc" | "alert" | "muted"; style?: CSSProperties }) {
  const m = {
    ink: { bg: C.ink, fg: "#fff", bd: C.ink },
    acc: { bg: C.acc, fg: "#fff", bd: C.acc },
    alert: { bg: C.alertSoft, fg: C.alert, bd: C.alert },
    muted: { bg: C.card, fg: C.muted, bd: C.line },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 18px",
        borderRadius: 999,
        border: `2px solid ${m.bd}`,
        background: m.bg,
        color: m.fg,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 28,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Siri-like call wave: a few sines whose amplitude follows `amp` (0–1) */
function Wave({ f, amp, width = 260, color = C.acc }: { f: number; amp: number; width?: number; color?: string }) {
  const h = 90;
  const lines = [0, 1, 2].map((k) => {
    let d = "";
    for (let x = 0; x <= width; x += 6) {
      const env = Math.sin((Math.PI * x) / width);
      const y = h / 2 + Math.sin(x / 18 + f / (5 + k * 2) + k) * env * amp * (32 - k * 8);
      d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)} `;
    }
    return <path key={k} d={d} fill="none" stroke={color} strokeOpacity={1 - k * 0.3} strokeWidth={4 - k} strokeLinecap="round" />;
  });
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden>
      {lines}
    </svg>
  );
}

function Phone({ children, style, label }: { children: ReactNode; style?: CSSProperties; label?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, ...style }}>
      <div
        style={{
          width: 280,
          height: 520,
          borderRadius: 40,
          background: C.ink,
          padding: 8,
          boxShadow: "0 24px 50px -28px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 32,
            background: C.bg,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 14,
            padding: 16,
          }}
        >
          <span style={{ position: "absolute", top: 10, width: 70, height: 16, borderRadius: 99, background: C.ink }} />
          {children}
        </div>
      </div>
      {label && <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 24, color: C.muted }}>{label}</span>}
    </div>
  );
}

function Bubble({ children, me, p }: { children: ReactNode; me?: boolean; p: number }) {
  return (
    <span
      style={{
        alignSelf: me ? "flex-end" : "flex-start",
        maxWidth: "92%",
        padding: "10px 14px",
        borderRadius: 18,
        background: me ? C.ink : C.accSoft,
        color: me ? "#fff" : C.ink,
        fontFamily: SANS,
        fontSize: 24,
        lineHeight: 1.25,
        opacity: p,
        transform: `scale(${0.9 + p * 0.1})`,
        transformOrigin: me ? "right" : "left",
      }}
    >
      {children}
    </span>
  );
}

const pop = (f: number, at: number, fps: number) => spring({ frame: f - at, fps, config: { damping: 14, stiffness: 160 } });

// ------------------------------------------------------------------------------------------------ 1 · the problem

function S1() {
  const f = useCurrentFrame();
  const lost = [2, 7, 9, 13, 18]; // cells that empty out
  return (
    <Scene dur={180}>
      <div style={{ position: "absolute", left: 200, top: 190, display: "grid", gridTemplateColumns: "repeat(5, 150px)", gap: 22 }}>
        {Array.from({ length: 20 }, (_, n) => {
          const k = lost.indexOf(n);
          const e = k < 0 ? 0 : t(f, 30 + k * 14, 50 + k * 14);
          return (
            <div
              key={n}
              style={{
                height: 112,
                borderRadius: 16,
                border: `3px ${e > 0.5 ? "dashed" : "solid"} ${e > 0.5 ? C.line : C.ink}`,
                background: `rgba(255,255,255,${1 - e})`,
                transform: `scale(${1 - e * 0.06})`,
              }}
            />
          );
        })}
      </div>
      <div style={{ position: "absolute", right: 180, top: 300, display: "flex", gap: 30 }}>
        {[0, 1, 2, 3, 4].map((n) => (
          <Person key={n} color={C.line} size={1.5} style={{ transform: `translateY(${Math.sin((f + n * 9) / 9) * 4}px)`, opacity: t(f, 6 + n * 6, 22 + n * 6) }} />
        ))}
      </div>
      <Caption at={40}>En un hospital de Lima se pierden 347 citas al día… mientras otros esperan.</Caption>
    </Scene>
  );
}

// ------------------------------------------------------------------------------------------------ 2 · clinical category

function S2() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const walk = t(f, 0, 36);
  const badge = pop(f, 60, fps);
  const move = t(f, 120, 160); // Tito climbs to the top of the list
  const rows = [
    { name: "Ana", cat: "P2", fill: 0.69 },
    { name: "Julio", cat: "P2", fill: 0.44 },
    { name: "Luis", cat: "P3", fill: 0.17 },
  ];
  const fillP = t(f, 90, 150);
  return (
    <Scene dur={240}>
      {/* Tito arrives referred; a professional assigns the category */}
      <div style={{ position: "absolute", left: 120 + walk * 120, top: 250, display: "flex", alignItems: "flex-end", gap: 20 }}>
        <div style={{ position: "relative" }}>
          <Person color={C.ink} label="Tito" size={1.5} />
          <div style={{ position: "absolute", top: -14, right: -40, transform: `scale(${badge})` }}>
            <Chip tone="acc">P1</Chip>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 54, opacity: t(f, 20, 34) }}>
          <FileText size={34} color={C.muted} strokeWidth={1.8} />
          <span style={{ fontFamily: SANS, fontSize: 24, color: C.muted, fontWeight: 600 }}>Derivado</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 140, top: 560, display: "flex", alignItems: "center", gap: 14, opacity: t(f, 40, 56) }}>
        <Stethoscope size={40} color={C.acc} strokeWidth={1.8} />
        <span style={{ fontFamily: SANS, fontSize: 28, fontWeight: 600, color: C.ink }}>Un profesional asigna la categoría</span>
      </div>
      {/* the list: category first, then the share of the deadline already used */}
      <div style={{ position: "absolute", right: 140, top: 200, width: 900 }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, color: C.muted, marginBottom: 18 }}>Lista de espera</div>
        <div style={{ position: "relative", height: 4 * 120 }}>
          {[{ name: "Tito", cat: "P1", fill: 0.1, tito: true }, ...rows].map((r, n) => {
            const pos = "tito" in r ? interpolate(move, [0, 1], [3, 0]) : n - 1 + move;
            return (
              <div
                key={r.name}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: pos * 120,
                  height: 100,
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  padding: "0 24px",
                  borderRadius: 18,
                  background: C.card,
                  border: `2px solid ${"tito" in r ? C.acc : C.line}`,
                  opacity: "tito" in r ? t(f, 100, 116) : 1,
                }}
              >
                <Chip tone={r.cat === "P1" ? "acc" : "muted"} style={{ fontSize: 24, padding: "4px 14px" }}>
                  {r.cat}
                </Chip>
                <span style={{ width: 110, fontFamily: SANS, fontWeight: 600, fontSize: 30, color: C.ink }}>{r.name}</span>
                <div style={{ flex: 1, height: 16, borderRadius: 8, background: C.line, overflow: "hidden" }}>
                  <div style={{ width: `${r.fill * fillP * 100}%`, height: "100%", background: "tito" in r ? C.acc : C.ink }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Caption at={70}>Un profesional asigna la prioridad. La lista se ordena por categoría y tiempo de espera.</Caption>
    </Scene>
  );
}

// ------------------------------------------------------------------------------------------------ 3 · confirmation

function S3() {
  const f = useCurrentFrame();
  const phones = [
    { label: "Jorge", reply: "Confirmo" },
    { label: "Sofía", reply: "Confirmo" },
    { label: "Carmen", reply: "No podré ir", carmen: true },
    { label: "Raúl", call: true },
  ];
  return (
    <Scene dur={300}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center", opacity: t(f, 4, 20) }}>
        <Chip tone="ink">72 h antes de la cita</Chip>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 160, display: "flex", justifyContent: "center", gap: 80 }}>
        {phones.map((p, n) =>
          p.call ? (
            <Phone key={p.label} label={`${p.label} · llamada`} style={{ opacity: t(f, 20 + n * 10, 36 + n * 10) }}>
              <span style={{ fontFamily: SANS, fontSize: 18, color: C.muted, textAlign: "center" }}>Hospital · asistente automatizado</span>
              <Wave f={f} amp={0.25 + 0.75 * Math.abs(Math.sin(f / 14))} width={190} />
              <span style={{ fontFamily: SANS, fontSize: 18, color: C.muted }}>Hablando</span>
            </Phone>
          ) : (
            <Phone key={p.label} label={p.label} style={{ opacity: t(f, 20 + n * 10, 36 + n * 10) }}>
              <Bubble p={t(f, 50 + n * 12, 62 + n * 12)}>¿Confirma su cita del jueves?</Bubble>
              <Bubble me p={t(f, 120 + n * 18, 132 + n * 18)}>
                {p.reply}
              </Bubble>
              {p.carmen && (
                <div style={{ position: "absolute", inset: 0, border: `4px solid ${C.acc}`, borderRadius: 32, opacity: t(f, 180, 196) }} />
              )}
            </Phone>
          ),
        )}
      </div>
      <Caption at={90}>AsistIA confirma cada cita, por mensaje o por voz.</Caption>
    </Scene>
  );
}

// ------------------------------------------------------------------------------------------------ 4 · the freed slot

function S4() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const travel = t(f, 20, 80);
  const approve = pop(f, 90, fps);
  const ring = t(f, 130, 146) * (1 - t(f, 200, 214));
  const flip = t(f, 220, 240);
  return (
    <Scene dur={300}>
      {/* Carmen's slot travels to the list */}
      <div style={{ position: "absolute", left: 150, top: 250, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <Person color={C.line} label="Carmen" size={1.5} />
      </div>
      <div
        style={{
          position: "absolute",
          left: interpolate(travel, [0, 1], [320, 760]),
          top: 280,
          width: 340,
          padding: "22px 26px",
          borderRadius: 20,
          background: C.accSoft,
          border: `3px solid ${C.acc}`,
          fontFamily: SANS,
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 700, color: C.ink }}>Oncología</div>
        <div style={{ fontSize: 24, color: C.muted }}>Cupo liberado</div>
      </div>
      <div style={{ position: "absolute", left: 760, top: 470, transform: `scale(${approve})`, transformOrigin: "left" }}>
        <Chip tone="acc">
          <Check size={28} strokeWidth={3} /> El personal aprueba la oferta
        </Chip>
      </div>
      {/* Tito's phone: the call, then the new appointment */}
      <Phone label="Celular de Tito" style={{ position: "absolute", right: 180, top: 120 }}>
        {ring > 0.05 && flip < 0.5 ? (
          <>
            <span style={{ fontFamily: SANS, fontSize: 18, color: C.muted }}>Cupo disponible</span>
            <Wave f={f} amp={ring} width={190} />
            <Bubble me p={t(f, 180, 192)}>
              ¡Sí, lo quiero!
            </Bubble>
          </>
        ) : (
          <>
            <span style={{ fontFamily: SANS, fontSize: 18, color: C.muted, fontWeight: 600 }}>Su cita · Oncología</span>
            {flip < 0.5 ? (
              <span style={{ fontFamily: SANS, fontSize: 28, fontWeight: 700, color: C.alert, background: C.alertSoft, padding: "6px 14px", borderRadius: 12 }}>
                En 5 semanas
              </span>
            ) : (
              <span style={{ fontFamily: SANS, fontSize: 32, fontWeight: 700, color: "#fff", background: C.acc, padding: "8px 16px", borderRadius: 14, transform: `scale(${0.9 + flip * 0.1})` }}>
                Mañana 9:00
              </span>
            )}
          </>
        )}
      </Phone>
      <Caption at={110}>El cupo no se pierde: el personal aprueba y llega a quien más lo necesita.</Caption>
    </Scene>
  );
}

// ------------------------------------------------------------------------------------------------ 5 · tracking

function S5() {
  const f = useCurrentFrame();
  const stops = [
    { name: "Llegada", time: "08:02" },
    { name: "Triaje", time: "08:15" },
    { name: "Médico", time: "—" },
    { name: "Alta", time: "—" },
  ];
  const x0 = 260;
  const gap = 460;
  const prog = interpolate(f, [10, 70, 200], [0, 1, 1.75], { ...clamp, easing: ease }); // stalls in the waiting stretch
  const alert = t(f, 150, 170);
  const later = t(f, 220, 250); // the doctor sees them, discharge follows
  const pos = prog + later * (3 - 1.75);
  return (
    <Scene dur={300}>
      <div style={{ position: "absolute", left: x0, top: 420, width: gap * 3, height: 6, background: C.line, borderRadius: 3 }} />
      <div style={{ position: "absolute", left: x0, top: 420, width: gap * Math.min(pos, 1), height: 6, background: C.acc, borderRadius: 3 }} />
      <div
        style={{
          position: "absolute",
          left: x0 + gap,
          top: 420,
          width: gap * Math.max(0, Math.min(pos, 2) - 1),
          height: 6,
          background: alert > 0.5 && later < 0.5 ? C.alert : C.acc,
          borderRadius: 3,
        }}
      />
      <div style={{ position: "absolute", left: x0 + gap * 2, top: 420, width: gap * Math.max(0, pos - 2), height: 6, background: C.acc, borderRadius: 3 }} />
      {stops.map((s, n) => {
        const done = pos >= n - 0.02;
        const time = n === 2 && later > 0.4 ? "09:10" : n === 3 && later > 0.9 ? "09:45" : s.time;
        return (
          <div key={s.name} style={{ position: "absolute", left: x0 + gap * n - 30, top: 393, width: 60, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: 60, height: 60, borderRadius: 30, background: done ? C.acc : C.card, border: `5px solid ${done ? C.acc : C.line}` }} />
            <div style={{ marginTop: 18, fontFamily: SANS, fontWeight: 700, fontSize: 32, color: C.ink, whiteSpace: "nowrap" }}>{s.name}</div>
            <div style={{ fontFamily: SANS, fontSize: 28, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{done ? time : "—"}</div>
          </div>
        );
      })}
      {/* the waiting stretch grows too long: alert to the person in charge */}
      <div
        style={{
          position: "absolute",
          left: x0 + gap * 1.5 - 210,
          top: 260,
          width: 420,
          display: "flex",
          justifyContent: "center",
          opacity: alert * (1 - later),
          transform: `translateY(${(1 - alert) * 10}px) rotate(${Math.sin(f / 2) * alert * (1 - later) * 2}deg)`,
        }}
      >
        <Chip tone="alert">
          <BellRing size={28} /> Aviso al responsable del turno
        </Chip>
      </div>
      <Caption at={60}>Cada etapa se mide, como el rastreo de un envío. Si alguien espera demasiado, se alerta al responsable.</Caption>
    </Scene>
  );
}

// ------------------------------------------------------------------------------------------------ 6 · pre-visit

function S6() {
  const f = useCurrentFrame();
  const lines = ["Motivo: dolor de rodilla", "Medicamentos: ibuprofeno (confirmado)", "Alergias: ninguna", "Signos de alarma: no"];
  return (
    <Scene dur={240}>
      <Phone label="Preconsulta" style={{ position: "absolute", left: 180, top: 110 }}>
        <Bubble p={t(f, 10, 22)}>¿Qué molestia quiere consultar?</Bubble>
        <Bubble me p={t(f, 30, 42)}>
          Me duele la rodilla
        </Bubble>
        <Bubble p={t(f, 50, 62)}>¿Tomó algún medicamento?</Bubble>
        <Bubble me p={t(f, 70, 82)}>
          Ibuprofeno
        </Bubble>
      </Phone>
      <div
        style={{
          position: "absolute",
          left: 600,
          top: 170,
          width: 700,
          padding: "30px 34px",
          borderRadius: 24,
          background: C.card,
          border: `2px solid ${C.line}`,
          opacity: t(f, 70, 90),
          transform: `translateX(${(1 - t(f, 70, 90)) * 30}px)`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
          <span style={{ fontFamily: SERIF, fontSize: 40, color: C.ink }}>Resumen para el médico</span>
          <ClipboardList size={36} color={C.acc} />
        </div>
        <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 24, fontWeight: 700, color: C.acc }}>Referido por el paciente</div>
        {lines.map((l, n) => (
          <div key={l} style={{ marginTop: 16, fontFamily: SANS, fontSize: 28, color: C.ink, opacity: t(f, 96 + n * 12, 108 + n * 12) }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 1340, top: 200, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ opacity: t(f, 150, 166) }}>
          <Chip tone="muted">
            <Hourglass size={26} /> Llegada estimada 10:20–10:35
          </Chip>
        </div>
        <div style={{ opacity: t(f, 170, 186) }}>
          <Chip tone="alert">
            <Siren size={26} /> Signo de alarma → emergencia
          </Chip>
        </div>
      </div>
      <Caption at={40}>El médico llega preparado. Sin diagnósticos: si hay un signo de alarma, se deriva a emergencia.</Caption>
    </Scene>
  );
}

// ------------------------------------------------------------------------------------------------ 7 · discharge

function S7() {
  const f = useCurrentFrame();
  const walk = t(f, 10, 150);
  return (
    <Scene dur={180}>
      <div style={{ position: "absolute", left: 1560, top: 180, width: 6, height: 460, background: C.line, borderRadius: 3 }} />
      <div style={{ position: "absolute", left: interpolate(walk, [0, 1], [300, 1040]), top: 250, display: "flex", alignItems: "center", gap: 30 }}>
        <Person color={C.ink} size={1.6} style={{ transform: `translateY(${Math.abs(Math.sin(f / 5)) * -6}px)` }} />
        <div
          style={{
            padding: "18px 24px",
            borderRadius: 18,
            background: C.card,
            border: `3px solid ${C.acc}`,
            fontFamily: SANS,
            opacity: t(f, 30, 46),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, fontWeight: 700, color: C.acc }}>
            <CalendarCheck size={28} /> Control reservado
          </div>
          <div style={{ fontSize: 22, color: C.muted }}>Su próxima cita ya tiene fecha</div>
        </div>
      </div>
      <Caption at={40}>Nadie sale sin su próxima cita.</Caption>
    </Scene>
  );
}

// ------------------------------------------------------------------------------------------------ 8 · board and close

function S8() {
  const f = useCurrentFrame();
  const stages = [
    { icon: CalendarCheck, name: "Antes de la cita", ind: "Consultas realizadas por cada 100 citas" },
    { icon: ClipboardList, name: "Llegada y triaje", ind: "Llegada a triaje, por prioridad" },
    { icon: Hourglass, name: "Espera", ind: "Triaje a médico y alertas a tiempo" },
    { icon: Stethoscope, name: "Atención y alta", ind: "Control reservado y realizado" },
    { icon: Repeat, name: "Cupos liberados", ind: "Consultas netas adicionales" },
  ];
  const logo = t(f, 200, 226);
  return (
    <Scene dur={300}>
      <div style={{ position: "absolute", left: 100, right: 100, top: 220, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 30, opacity: 1 - logo }}>
        {stages.map((s, n) => (
          <div key={s.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", opacity: t(f, 10 + n * 16, 28 + n * 16) }}>
            <div style={{ width: 150, height: 150, borderRadius: 75, border: `4px solid ${C.ink}`, display: "grid", placeItems: "center", background: C.card }}>
              <s.icon size={64} strokeWidth={1.6} color={C.ink} />
            </div>
            <div style={{ marginTop: 22, fontFamily: SANS, fontWeight: 700, fontSize: 32, color: C.ink }}>{s.name}</div>
            <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 24, lineHeight: 1.3, color: C.muted }}>{s.ind}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, display: "flex", justifyContent: "center", opacity: logo, transform: `scale(${0.94 + logo * 0.06})` }}>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 150, letterSpacing: "-0.02em", color: C.ink }}>
          Asist<span style={{ color: C.acc }}>IA</span>
        </span>
      </div>
      <Caption at={80}>Primero medimos dónde se forma la espera. Lo que logre AsistIA se mide en el piloto.</Caption>
    </Scene>
  );
}

// ------------------------------------------------------------------------------------------------ the composition

const SCENES: [number, number, () => ReactNode][] = [
  [0, 180, S1],
  [180, 240, S2],
  [420, 300, S3],
  [720, 300, S4],
  [1020, 300, S5],
  [1320, 240, S6],
  [1560, 180, S7],
  [1740, 300, S8],
];

export function AsistiaVideo() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: SANS }}>
      {SCENES.map(([from, dur, Comp]) => (
        <Sequence key={from} from={from} durationInFrames={dur}>
          <Comp />
        </Sequence>
      ))}
      {/* a thin progress line, so the viewer knows how long it lasts */}
      <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, width: `${(f / VIDEO.durationInFrames) * 100}%`, background: C.acc }} />
      <div style={{ position: "absolute", left: 60, top: 44, fontFamily: SANS, fontWeight: 700, fontSize: 30, color: C.ink }}>
        Asist<span style={{ color: C.acc }}>IA</span>
      </div>
    </AbsoluteFill>
  );
}
