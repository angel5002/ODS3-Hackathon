// Builds the AsistIA logo as pure SVG paths (no font needed to display it).
// Mark: the app's calendar-with-check. Wordmark: Bricolage Grotesque 800.
// Usage: node video/make-logo.mjs
import { readFileSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";

const buf = readFileSync(new URL("../node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff", import.meta.url));
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const SIZE = 120; // font size in svg units
const word = "AsistIA";
const tracking = -0.02 * SIZE; // tight, like the app display headings

// glyph by glyph (no shaping: the word needs no substitutions)
const glyphs = [...word].map((ch) => font.charToGlyph(ch));
let x = 0;
let top = 0;
const parts = [];
glyphs.forEach((g, i) => {
  const p = g.getPath(x, 0, SIZE);
  top = Math.min(top, p.getBoundingBox().y1);
  parts.push({ d: p.toPathData(2), accent: i >= word.length - 2 }); // "IA" in the accent color: reads as I, not l
  const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0;
  x += ((g.advanceWidth + kern) / font.unitsPerEm) * SIZE + tracking;
});
const textW = x - tracking;
const ascent = -top; // tallest glyph above the baseline

const markSize = 150;
const gap = 34;
const height = markSize;
const textY = height / 2 + ascent / 2; // vertically centered on the mark
const width = Math.ceil(markSize + gap + textW + 4);

function svg({ ink, mark, check, accent, bg }) {
  const s = markSize / 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="AsistIA">
  ${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ""}
  <g transform="scale(${s})">
    <rect x="2" y="5" width="28" height="25" rx="7" fill="${mark}" opacity="0.14"/>
    <rect x="2" y="5" width="28" height="25" rx="7" fill="none" stroke="${mark}" stroke-width="2"/>
    <path d="M10 2.5v5M22 2.5v5" stroke="${mark}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M10.5 18.5l3.6 3.6 7.6-7.6" fill="none" stroke="${check}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g transform="translate(${markSize + gap} ${textY.toFixed(2)})" fill="${ink}">
    ${parts.map((p) => `<path d="${p.d}"${p.accent ? ` fill="${accent}"` : ""}/>`).join("\n    ")}
  </g>
</svg>
`;
}

const dark = svg({ ink: "#16212c", mark: "#0e5a57", check: "#5fd0b4", accent: "#0e5a57" });
const light = svg({ ink: "#ffffff", mark: "#ffffff", check: "#5fd0b4", accent: "#5fd0b4" });
writeFileSync(new URL("./insumos/logo-asistia.svg", import.meta.url), dark);
writeFileSync(new URL("./insumos/logo-asistia-claro.svg", import.meta.url), light);
writeFileSync(new URL("./escenas/logo-asistia-claro.svg", import.meta.url), light);
console.log(`logo ${width}x${height}`);
