// Measures the contrast of the voice call tokens (E5 v2). Pure Node, no dependencies.
// Reads the [data-voice-theme="claro"] block of src/app/globals.css (the light palette chosen by the team),
// takes every --vc-* hex value and prints each text/background and icon-or-control/background pair with its WCAG 2.x contrast ratio.
// Thresholds: text 4.5:1 (1.4.3), icons, wave and control edges 3:1 (1.4.11). Exit code 1 if any pair fails.
//
//   node scripts/dev/contrast-check.mjs            table
//   node scripts/dev/contrast-check.mjs --md       the same table as Markdown
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const css = readFileSync(join(root, "src", "app", "globals.css"), "utf8");
const md = process.argv.includes("--md");

function tokens(theme) {
  // every block of the theme is merged (the call tokens, then the app surface tokens of E5 app)
  const blocks = [...css.matchAll(new RegExp(`\\[data-voice-theme="${theme}"\\]\\s*\\{([^}]*)\\}`, "g"))];
  if (!blocks.length) throw new Error(`No [data-voice-theme="${theme}"] block in globals.css`);
  const out = {};
  for (const m of blocks) for (const [, name, value] of m[1].matchAll(/--(vc-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

function rgb(hex) {
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Not an opaque 6-digit hex: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** WCAG 2.x relative luminance */
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, kind, where it is used]
const BGS = ["vc-bg", "vc-bg-2"]; // the screen is a gradient between these two: check against both ends
const PAIRS = [
  ...BGS.flatMap((bg) => [
    ["vc-text", bg, "texto", "títulos, estado, subtítulos"],
    ["vc-text-2", bg, "texto", "texto secundario, rótulos de botones"],
    ["vc-text-3", bg, "texto", "línea de seguridad, enlace discreto"],
    ["vc-warn", bg, "texto", "aviso de líneas ocupadas"],
    ["vc-icon", bg, "icono", "iconos sobre el fondo"],
    ["vc-agent", bg, "icono", "onda y punto del asistente"],
    ["vc-person", bg, "icono", "onda y punto de la persona"],
    ["vc-rest", bg, "icono", "onda en reposo"],
    ["vc-edge", bg, "control", "borde de botones neutros"],
    ["vc-danger", bg, "control", "botón Colgar / Rechazar"],
    ["vc-accept", bg, "control", "botón Contestar"],
    ["vc-primary", bg, "control", "botón principal"],
    ["vc-toggle", bg, "control", "Silenciar activado"],
    ["vc-focus", bg, "control", "anillo de foco"],
  ]),
  ["vc-text", "vc-surface", "texto", "texto en botón neutro"],
  ["vc-text", "vc-surface-press", "texto", "texto en botón neutro pulsado"],
  ["vc-icon", "vc-surface", "icono", "icono en botón neutro"],
  ["vc-text", "vc-surface", "icono", "icono blanco/tinta en botón neutro"],
  ["vc-on-primary", "vc-primary", "texto", "texto en botón principal"],
  ["vc-on-primary", "vc-primary-press", "texto", "texto en botón principal pulsado"],
  ["vc-on-danger", "vc-danger", "texto", "texto en botón Colgar"],
  ["vc-on-danger", "vc-danger-press", "texto", "texto en botón Colgar pulsado"],
  ["vc-on-accept", "vc-accept", "icono", "icono en Contestar"],
  ["vc-on-accept", "vc-accept-press", "icono", "icono en Contestar pulsado"],
  ["vc-on-toggle", "vc-toggle", "icono", "icono en Silenciar activado"],
];

// E5 app: /pedir-cita (inicio, chat, formulario), burbujas y campo del chat, teléfono simulado /t/[token] y /demo.
// Every new foreground/background combination those screens use, including the ones whose tokens already existed.
const APP_PAIRS = [
  ["vc-text-2", "vc-surface", "texto", "franja de aviso «Demostración…» (app)"],
  ["vc-icon", "vc-surface", "icono", "icono Info de la franja de aviso; mosaico de icono de opción (app)"],
  ["vc-text-3", "vc-surface", "texto", "pista «Responda con los botones del mensaje»; botón Enviar desactivado (app)"],
  ["vc-text", "vc-surface", "texto", "«Respondió: …» en la burbuja (app)"],
  ["vc-icon", "vc-bg", "texto", "rótulo «Oferta de cupo», «Teléfono N», enlaces (app)"],
  ["vc-icon", "vc-bg-2", "texto", "enlaces sobre el fondo menta (app)"],
  ["vc-text", "vc-bg", "texto", "burbuja del asistente, títulos de tarjetas (app)"],
  ["vc-text-2", "vc-bg", "texto", "subtítulo de la cabecera, descripciones (app)"],
  ["vc-text-3", "vc-bg", "texto", "hora de la burbuja del asistente, «escribiendo…» (app)"],
  ["vc-text-3", "vc-bg", "icono", "puntos de «escribiendo…» (app)"],
  ["vc-on-primary", "vc-primary", "texto", "burbuja propia, tarjeta principal, botón Enviar (app)"],
  ["vc-on-primary-2", "vc-primary", "texto", "hora en la burbuja propia, descripción en la tarjeta principal (app)"],
  ["vc-on-primary", "vc-primary-press", "icono", "icono en el mosaico de la tarjeta principal (app)"],
  ["vc-on-primary-2", "vc-primary-press", "texto", "descripción de la tarjeta principal pulsada (app)"],
  ["vc-agent", "vc-bg", "control", "borde de la burbuja de oferta o confirmación de cupo (app)"],
  ["vc-agent", "vc-bg-2", "control", "borde de la burbuja de oferta sobre el fondo menta (app)"],
  ["vc-edge", "vc-bg", "control", "borde del campo de texto, de los botones de respuesta y de los botones secundarios (app)"],
  ["vc-edge", "vc-bg-2", "control", "borde de las opciones rápidas sobre el fondo menta (app)"],
  ["vc-text", "vc-surface-press", "texto", "botón de respuesta pulsado (app)"],
  ["vc-warn", "vc-warn-soft", "texto", "«Se cierra a las …» (app)"],
  ["vc-warn", "vc-warn-soft", "icono", "reloj de «Se cierra a las …» (app)"],
  ["vc-text", "vc-danger-soft", "texto", "aviso de emergencia (app)"],
  ["vc-danger-press", "vc-danger-soft", "icono", "icono del aviso de emergencia (app)"],
  ["vc-danger-press", "vc-bg", "texto", "botón «Reiniciar demo» (app)"],
  ["vc-danger", "vc-bg", "control", "borde del botón «Reiniciar demo», icono «En vivo» (app)"],
  ["vc-danger-press", "vc-danger-soft", "texto", "botón «Reiniciar demo» pulsado (app)"],
  ["vc-text", "vc-bg-2", "texto", "títulos de /demo sobre el fondo menta (app)"],
  ["vc-text-2", "vc-bg-2", "texto", "texto secundario de /demo sobre el fondo menta (app)"],
  ["vc-text-3", "vc-bg-2", "texto", "URL bajo cada QR (app)"],
];
PAIRS.push(...APP_PAIRS);

// E5 demo: the /demo control center (projected to the jury) and its operator tools use their own local tokens
// (DEMO_TOKENS in src/components/demo/DemoTheme.tsx, sober NHS/USWDS-like palette). Every pair the screen uses.
function demoTokens() {
  const src = readFileSync(join(root, "src", "components", "demo", "DemoTheme.tsx"), "utf8");
  const out = {};
  for (const [, name, value] of src.matchAll(/"(cc-[a-z0-9-]+)":\s*"(#[0-9a-fA-F]{6})"/g)) out[name] = value;
  if (!Object.keys(out).length) throw new Error("No DEMO_TOKENS in DemoTheme.tsx");
  return out;
}
const DEMO_PAIRS = [
  ["cc-text", "cc-surface", "texto", "títulos, cifras y nombres de /demo"],
  ["cc-text", "cc-subtle", "texto", "«Último: …», fila nueva de la lista (demo)"],
  ["cc-text", "cc-page", "texto", "fondo de la página /demo"],
  ["cc-text-2", "cc-surface", "texto", "texto secundario de los paneles (demo)"],
  ["cc-text-2", "cc-subtle", "texto", "texto secundario sobre gris (demo)"],
  ["cc-text-2", "cc-page", "texto", "línea de aviso «Demostración…» al pie (demo)"],
  ["cc-accent", "cc-surface", "texto", "enlaces de los pasos, «Sonando», «Oferta a …» (demo)"],
  ["cc-accent", "cc-subtle", "texto", "«Nueva» en la fila resaltada (demo)"],
  ["cc-ok", "cc-surface", "texto", "«En llamada», «Asignado a …», paso hecho (demo)"],
  ["cc-warn", "cc-surface", "texto", "«No contestó», «Sin ACEPTO» (demo)"],
  ["cc-danger", "cc-surface", "texto", "botón «Reiniciar demo» (demo)"],
  ["cc-danger", "cc-danger-subtle", "texto", "botón «Reiniciar demo» con el puntero encima (demo)"],
  ["cc-on-primary", "cc-primary", "texto", "paso principal, regla activa, código QR del jurado (demo)"],
  ["cc-on-primary", "cc-primary-press", "texto", "paso principal pulsado (demo)"],
  ["cc-on-primary-2", "cc-primary", "texto", "«Para el jurado» (demo)"],
  ["cc-on-danger", "cc-danger", "texto", "«Sí, reiniciar» (demo)"],
  ["cc-control", "cc-surface", "control", "borde de botones secundarios, selectores y campos (demo)"],
  ["cc-control", "cc-subtle", "control", "borde de botones sobre gris (demo)"],
  ["cc-primary", "cc-surface", "control", "botón principal y etapa con movimiento (demo)"],
  ["cc-danger", "cc-surface", "control", "borde de «Reiniciar demo»; borde P1 de la lista (demo)"],
  ["cc-warn", "cc-surface", "control", "borde P2 y de llamada sin respuesta (demo)"],
  ["cc-accent", "cc-surface", "control", "borde P3, de «Sonando» y de «Último» (demo)"],
  ["cc-ok", "cc-surface", "control", "borde de «En llamada» y de cupo asignado (demo)"],
  ["cc-accent", "cc-subtle", "control", "barra del % del plazo y borde de «Último» (demo)"],
  ["cc-focus", "cc-surface", "control", "anillo de foco (demo)"],
  ["cc-focus", "cc-page", "control", "anillo de foco sobre el fondo (demo)"],
  ["cc-accent", "cc-surface", "icono", "iconos de los paneles (demo)"],
];
PAIRS.push(...DEMO_PAIRS);

const MIN = { texto: 4.5, icono: 3, control: 3 };
let failures = 0;
const lines = [];
const out = (s) => lines.push(s);

for (const theme of ["claro"]) {
  const t = { ...tokens(theme), ...demoTokens() };
  if (md) {
    out(`\n**Variante ${theme}**\n`);
    out("| Primer plano | Fondo | Tipo | Mínimo | Contraste | Resultado | Uso |");
    out("| --- | --- | --- | --- | --- | --- | --- |");
  } else {
    out(`\nVariante ${theme}`);
    out(`${"primer plano".padEnd(30)} ${"fondo".padEnd(28)} ${"tipo".padEnd(8)} mín   ratio   resultado  uso`);
  }
  for (const [fg, bg, kind, use] of PAIRS) {
    if (!t[fg] || !t[bg]) throw new Error(`Missing --${!t[fg] ? fg : bg} in theme ${theme}`);
    const r = ratio(t[fg], t[bg]);
    const ok = r >= MIN[kind];
    if (!ok) failures++;
    const a = `${fg} ${t[fg]}`;
    const b = `${bg} ${t[bg]}`;
    if (md) out(`| ${a} | ${b} | ${kind} | ${MIN[kind]}:1 | ${r.toFixed(2)}:1 | ${ok ? "PASS" : "FAIL"} | ${use} |`);
    else out(`${a.padEnd(30)} ${b.padEnd(28)} ${kind.padEnd(8)} ${String(MIN[kind]).padEnd(4)} ${r.toFixed(2).padStart(6)}:1  ${ok ? "PASS" : "FAIL"}       ${use}`);
  }
}

console.log(lines.join("\n"));
console.log(`\n${failures === 0 ? "Todos los pares pasan." : `${failures} par(es) no pasan.`}`);
process.exit(failures === 0 ? 0 : 1);
