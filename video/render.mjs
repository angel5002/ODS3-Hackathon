// Renders the video scenes frame by frame (deterministic: seek(i/30) per frame).
//
//   node video/render.mjs                 all scenes + full video
//   node video/render.mjs escena2         only one scene (also: escena1, escena3, cierre)
//   node video/render.mjs --storyboard    3 stills per scene in video/storyboard/
//   node video/render.mjs --join          only rebuild the full video from existing clips
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = join(ROOT, "escenas");
const OUT = join(ROOT, "salida");
const BOARD = join(ROOT, "storyboard");
const FPS = 30;
const SCENES = ["escena1", "escena2", "escena3", "cierre"];
// JPEG frames are full-range BT.601: convert to limited-range BT.709 so editors show the right colors.
const X264 = [
  "-vf", "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p",
  "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS),
  "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
];

const args = process.argv.slice(2);
const storyboard = args.includes("--storyboard");
const joinOnly = args.includes("--join");
const only = args.filter((a) => !a.startsWith("--"));
const targets = only.length ? only : SCENES;
for (const t of targets) if (!SCENES.includes(t)) throw new Error(`Escena desconocida: ${t}`);

function run(cmd, argv, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} terminó con código ${code}\n${err.slice(-1500)}`))));
    if (input) input(p.stdin);
  });
}

/** Writes to a temporary .mp4 and renames only if ffmpeg exits with code 0. */
async function ffmpegTo(finalPath, argv, opts) {
  const tmp = finalPath.replace(/\.mp4$/, ".parcial.mp4");
  rmSync(tmp, { force: true });
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...argv, tmp], opts);
  rmSync(finalPath, { force: true });
  renameSync(tmp, finalPath);
}

async function openScene(browser, id) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(SCENES_DIR, `${id}.html`)).href);
  await page.evaluate(() => window.ready);
  const info = await page.evaluate(() => ({ duration: window.DURATION, board: window.STORYBOARD, sound: window.SOUND_AT ?? null }));
  return { page, ...info };
}

async function renderScene(browser, id) {
  const { page, duration, sound } = await openScene(browser, id);
  const frames = Math.round(duration * FPS);
  const target = join(OUT, id === "cierre" ? "cierre-sin-sonido.mp4" : `${id}.mp4`);
  const t0 = Date.now();
  await ffmpegTo(target, ["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", ...X264, "-movflags", "+faststart"], {
    input: async (stdin) => {
      for (let i = 0; i < frames; i++) {
        await page.evaluate((t) => window.seek(t), i / FPS);
        const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
        if (!stdin.write(jpg)) await new Promise((r) => stdin.once("drain", r));
      }
      stdin.end();
    },
  });
  await page.close();
  console.log(`${id}: ${frames} cuadros en ${((Date.now() - t0) / 1000).toFixed(0)} s → ${target}`);
  if (id === "cierre") await withSound(target, duration, sound);
}

/** Original click: 30 ms of filtered noise with a fast decay, plus a short tonal body. */
async function makeClick() {
  const wav = join(OUT, "clic.wav");
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "anoisesrc=d=0.03:c=pink:r=48000:a=0.9:seed=7",
    "-f", "lavfi", "-i", "sine=f=1650:d=0.03:r=48000",
    "-filter_complex",
    "[0]highpass=f=1200,lowpass=f=7000,afade=t=out:st=0.002:d=0.028:curve=exp[n];" +
      "[1]volume=0.35,afade=t=out:st=0:d=0.02:curve=exp[s];" +
      "[n][s]amix=inputs=2:normalize=0,afade=t=in:d=0.001,aformat=sample_fmts=s16:channel_layouts=stereo",
    "-t", "0.03", wav,
  ]);
  return wav;
}

async function withSound(silent, duration, at) {
  const wav = await makeClick();
  const ms = Math.round(at * 1000);
  await ffmpegTo(join(OUT, "cierre.mp4"), [
    "-i", silent, "-i", wav,
    "-filter_complex", `[1]adelay=${ms}|${ms},apad,atrim=0:${duration}[a]`,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart",
  ]);
  console.log(`cierre: sonido en ${at} s → cierre.mp4 y clic.wav`);
}

async function joinAll(browser) {
  const clips = ["escena1.mp4", "escena2.mp4", "escena3.mp4", "cierre-sin-sonido.mp4"].map((f) => join(OUT, f));
  for (const c of clips) if (!existsSync(c)) throw new Error(`Falta ${c}`);
  const list = join(OUT, "lista.txt");
  writeFileSync(list, clips.map((c) => `file '${c.replace(/\\/g, "/")}'`).join("\n") + "\n");
  const video = join(OUT, "solo-video.mp4");
  await ffmpegTo(video, ["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart"]);
  // the closing click, at its place in the full timeline
  const durations = [];
  for (const id of SCENES) {
    const { page, duration, sound } = await openScene(browser, id);
    durations.push({ duration, sound });
    await page.close();
  }
  const offset = durations.slice(0, 3).reduce((s, d) => s + d.duration, 0) + durations[3].sound;
  const total = durations.reduce((s, d) => s + d.duration, 0);
  const wav = join(OUT, "clic.wav");
  if (!existsSync(wav)) await makeClick();
  const ms = Math.round(offset * 1000);
  await ffmpegTo(join(OUT, "asistia-animaciones-completo.mp4"), [
    "-i", video, "-i", wav,
    "-filter_complex", `[1]adelay=${ms}|${ms},apad,atrim=0:${total}[a]`,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart",
  ]);
  rmSync(video, { force: true });
  rmSync(list, { force: true });
  console.log(`completo: ${total} s, clic en ${offset} s → asistia-animaciones-completo.mp4`);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(BOARD, { recursive: true });
const browser = await chromium.launch();
try {
  if (storyboard) {
    for (const id of targets) {
      const { page, board } = await openScene(browser, id);
      for (const [k, t] of board.entries()) {
        await page.evaluate((x) => window.seek(x), t);
        await page.screenshot({ path: join(BOARD, `${id}-${k + 1}.png`) });
      }
      await page.close();
      console.log(`storyboard ${id}: ${board.join(" s, ")} s`);
    }
  } else {
    if (!joinOnly) for (const id of targets) await renderScene(browser, id);
    if (joinOnly || !only.length) await joinAll(browser);
  }
} finally {
  await browser.close();
}
