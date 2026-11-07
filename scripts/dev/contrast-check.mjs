// Measures the contrast of the voice call tokens (E5 v2). Pure Node, no dependencies.
// Reads the [data-voice-theme="…"] blocks of src/app/globals.css, takes every --vc-* hex value and prints, per
// theme, each text/background and icon-or-control/background pair with its WCAG 2.x contrast ratio.
// Thresholds: text 4.5:1 (1.4.3), icons, wave and control edges 3:1 (1.4.11). Exit code 1 if any pair fails.
//
//   node scripts/dev/contrast-check.mjs            table for both themes
//   node scripts/dev/contrast-check.mjs --md       the same table as Markdown
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const css = readFileSync(join(root, "src", "app", "globals.css"), "utf8");
const md = process.argv.includes("--md");

function tokens(theme) {
  const m = css.match(new RegExp(`\\[data-voice-theme="${theme}"\\]\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`No [data-voice-theme="${theme}"] block in globals.css`);
  const out = {};
  for (const [, name, value] of m[1].matchAll(/--(vc-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
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

const MIN = { texto: 4.5, icono: 3, control: 3 };
let failures = 0;
const lines = [];
const out = (s) => lines.push(s);

for (const theme of ["oscuro", "claro"]) {
  const t = tokens(theme);
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
